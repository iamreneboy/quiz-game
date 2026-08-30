-- M3 P3a — presence: who is actually connected, who dropped, who arrived late.
--
-- THE WHOLE FILE IS IDEMPOTENT. It is written across three tasks and
-- re-applied after each one, so every statement here must survive a second run.
--
-- Depends on 0008_the_aftermath.sql (rooms.used_question_ids, rematch) and,
-- through the functions it replaces, on 0006 and 0007.
--
-- NOTHING HERE TOUCHES THE WIRE. Supabase Presence carries "who is on the
-- channel" between clients; this file carries the SERVER's much coarser view of
-- the same thing, reached through player_public — which get_room_state and
-- join_room already return. No new phase_event key, no new broadcast.

-- ============ schema ============
-- absent_reports is a COUNT OF MISSED HOST REPORTS, not an age. That choice is
-- ADR-0049 and it is load-bearing twice over:
--   * when the HOST is the one who vanished nothing is reported at all, so no
--     player can be falsely declared dropped by the mere passage of time;
--   * a test can advance it twenty steps in a loop instead of waiting a minute.
alter table players add column if not exists absent_reports int not null default 0;

-- PRD §4: a late joiner spectates until the next round start and is then
-- "clearly marked joined late". The flag outlives the materialisation for
-- exactly that reason; start_game clears it when a new race begins.
alter table players add column if not exists joined_late boolean not null default false;

-- The host's own proof of life. Written ONLY by report_presence. P3a reads it
-- nowhere; M3 P3b's host-absence sweep is its entire consumer, and it lives
-- here because report_presence is its only writer.
alter table rooms add column if not exists host_seen_at timestamptz;

-- ============ thresholds ============
-- Hand-mirrored in lib/presence.ts, in the tradition of ceremony_ms() and
-- NOMINAL_MS. 20 reports x 3000ms == the PRD's 60-second grace; a change to
-- either number must move both files, and scripts/smoke.mjs pins the product.
create or replace function presence_report_ms() returns int
language sql immutable as $$ select 3000 $$;

create or replace function drop_reports() returns int
language sql immutable as $$ select 20 $$;

-- ============ player_dropped ============
-- The server's whole definition of "gone". Deliberately NOT `is_playing`:
-- standings() filters on that column, so demoting a dropped racer would erase
-- their score and their avatar from the track — the opposite of PRD §9's
-- "60s grace with score frozen". Dropped is a presentation state plus the gate
-- that opens reclaim (Task 5). See ADR-0049.
create or replace function player_dropped(p players) returns boolean
language sql immutable set search_path = public as $$
  select p.absent_reports >= drop_reports();
$$;

-- ============ player_public ============
-- Byte-identical to 0002_rpcs.sql except for TWO added keys. Both are facts
-- about a player that every surface needs to render honestly, and both already
-- travel on the one projection every roster is built from.
create or replace function player_public(p players) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'color', p.color,
    'is_host', p.is_host, 'is_playing', p.is_playing,
    'absent_reports', p.absent_reports,
    'joined_late', p.joined_late);
$$;

-- ============ report_presence ============
-- The host's roster report (ADR-0049). ONE call every presence_report_ms(),
-- whatever the player count — the host already drives the state machine
-- (PRD §9), so it is the client that both holds the presence map and is
-- allowed to write authority.
--
-- host_key checked inside the RPC, exactly as every other host command is
-- (roadmap decision 2).
--
-- No `for update`: two overlapping reports are last-writer-wins on a monotone
-- counter, and blocking a phase transition behind a heartbeat would be a much
-- worse trade than a lost increment.
create or replace function report_presence(
  p_room_id uuid, p_host_key uuid, p_present uuid[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_present uuid[] := coalesce(p_present, '{}'::uuid[]);
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;

  -- A finished room has nothing to keep alive, and the ceremony must not be
  -- disturbed by a heartbeat. Answering rather than raising keeps the client
  -- loop free of a special case.
  if v_room.status = 'finished' then
    return jsonb_build_object('server_now', now());
  end if;

  update rooms set host_seen_at = now() where id = p_room_id;

  update players set absent_reports = 0
    where room_id = p_room_id and id = any(v_present) and absent_reports <> 0;

  -- `not (id = any('{}'))` is `not false` — an empty report increments
  -- everybody, which is exactly right for a host that can see nobody.
  -- The cap keeps a long absence from growing an int without bound.
  update players set absent_reports = least(absent_reports + 1, 1000)
    where room_id = p_room_id and not (id = any(v_present));

  return jsonb_build_object('server_now', now());
end $$;

-- ============ get_room_state ============
-- Byte-identical to 0007_the_tiebreak.sql except for ONE added key on the room
-- object: `host_seen_at`.
--
-- This is NOT a new wire opening. `phase_event` — the thing that is broadcast —
-- is untouched; this projection is the fetch a client makes for itself on
-- subscribe, and it is the only route by which a client can ever see the
-- server's record of the host's last check-in. P3a reads it nowhere; it is here
-- because M3 P3b's host-absence sweep needs it and `report_presence` (above) is
-- its only writer, so writer and reader belong in the same migration.
create or replace function get_room_state(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
begin
  select * into v_room from rooms where code = upper(p_code);
  if not found then raise exception 'room not found'; end if;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id, 'code', v_room.code, 'status', v_room.status,
      'phase', v_room.phase, 'round', v_room.current_round,
      'total_rounds', v_room.total_rounds, 'timer_seconds', v_room.timer_seconds,
      'ends_at', v_room.phase_ends_at, 'server_now', now(),
      'paused_remaining_ms', v_room.paused_remaining_ms,
      'host_seen_at', v_room.host_seen_at,
      'sudden_death', case when v_room.sudden_death_round is null then null else
        jsonb_build_object(
          'round', v_room.sudden_death_round,
          'contenders', to_jsonb(coalesce(v_room.sudden_death_contenders, '{}'::uuid[])),
          'winner_id', v_room.sudden_death_winner_id)
        end),
    'players', (
      select coalesce(jsonb_agg(player_public(p) order by p.joined_at), '[]'::jsonb)
      from players p where p.room_id = v_room.id),
    'question', case when v_room.phase in ('read','answer')
      then question_public(v_room.id, v_room.current_round) else null end,
    'reveal', case when v_room.phase in ('reveal','track')
      then build_reveal(v_room.id, v_room.current_round) else null end,
    'standings', case
      when v_room.status = 'lobby' then null
      when v_room.status = 'finished'
        then final_standings(v_room.id, scoring_round(v_room.id, v_room.current_round))
      else standings(v_room.id, scoring_round(v_room.id,
        case when v_room.phase in ('read','answer')
          then v_room.current_round - 1 else v_room.current_round end))
      end);
end $$;

-- New functions need their own grant; earlier blanket grants ran before they
-- existed.
grant execute on all functions in schema public to anon, authenticated;

-- ============ join_room ============
-- THE DOOR OPENS (ADR-0050). 0002's flat `status <> 'lobby' -> raise` becomes
-- two arms of one function, because the two mid-game cases differ by exactly
-- one nickname lookup:
--
--   RECLAIM   an existing nickname whose player the server can see is gone.
--             The SAME row is returned — same id, same player_key, same
--             answers — so the browser that reclaims it simply is that racer
--             again. Task 6 adds nothing here.
--   LATE JOIN anything else: a new player, spectating, flagged joined_late.
--             Materialised by advance_phase at the next round start (Task 6).
--
-- THE RECLAIM GATE IS `player_dropped`, AND THAT IS THE WHOLE SECURITY MODEL.
-- Reclaim hands out an existing player_key on a nickname match, so it must be
-- impossible while that player is demonstrably still connected — otherwise
-- anyone in the room could take over anyone else's run by typing their name.
-- Twenty consecutive missed host reports is the bar. PRD §9 asks for exactly
-- this ("can rejoin with the same nickname to reclaim their run") and the room
-- code is already a shared secret, so a party-game threat model is the right
-- one; see ADR-0050 for what this deliberately does NOT protect.
--
-- The host's OWN key is never handed out. A host who loses their localStorage
-- can reclaim their player row like anyone else and will come back as an
-- ordinary racer; recovering host authority from a lost session is out of
-- scope for M3 and is not attempted here.
create or replace function join_room(
  p_code text, p_nickname text, p_avatar text, p_color text,
  p_host_key uuid default null, p_is_playing boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_player players;
  v_is_host boolean := false;
  v_nick text := trim(p_nickname);
  v_reclaimed boolean := false;
begin
  select * into v_room from rooms where code = upper(p_code);
  if not found then raise exception 'room not found'; end if;
  if v_room.status = 'finished' then raise exception 'the race has finished'; end if;
  if length(v_nick) < 1 or length(v_nick) > 20 then
    raise exception 'nickname must be 1-20 characters';
  end if;

  -- Validated before the branch, so a wrong host key is rejected rather than
  -- quietly ignored by the mid-game arm.
  if p_host_key is not null then
    if p_host_key <> v_room.host_key then raise exception 'invalid host key'; end if;
    v_is_host := true;
  end if;

  if v_room.status <> 'lobby' then
    select * into v_player from players
      where room_id = v_room.id and nickname = v_nick;

    if found then
      if not player_dropped(v_player) then raise exception 'nickname taken'; end if;
      -- Avatar and colour are deliberately NOT overwritten: the room has been
      -- watching this racer's colours on the track all game, and a reclaim is
      -- the same racer returning, not a new one.
      update players set absent_reports = 0
        where id = v_player.id returning * into v_player;
      v_reclaimed := true;
    else
      insert into players (room_id, nickname, avatar, color, is_host, is_playing, joined_late)
      values (v_room.id, v_nick, p_avatar, p_color, false, false, true)
      returning * into v_player;
    end if;

    return jsonb_build_object(
      'room_id', v_room.id, 'player_id', v_player.id,
      'player_key', v_player.player_key, 'player', player_public(v_player),
      'reclaimed', v_reclaimed);
  end if;

  begin
    insert into players (room_id, nickname, avatar, color, is_host, is_playing)
    values (v_room.id, v_nick, p_avatar, p_color, v_is_host,
            case when v_is_host then p_is_playing else true end)
    returning * into v_player;
  exception when unique_violation then
    raise exception 'nickname taken';
  end;

  return jsonb_build_object(
    'room_id', v_room.id, 'player_id', v_player.id,
    'player_key', v_player.player_key, 'player', player_public(v_player),
    'reclaimed', false);
end $$;

grant execute on all functions in schema public to anon, authenticated;

-- ============ materialize_late_joiners ============
-- PRD §4: a late joiner "materializes on the track at the start of the next
-- round with 0 correct answers". Nothing else changes about them — the mark
-- stays, because the room is meant to see it.
create or replace function materialize_late_joiners(p_room_id uuid) returns void
language sql volatile set search_path = public as $$
  update players set is_playing = true
    where room_id = p_room_id and joined_late and not is_playing;
$$;

-- ============ advance_phase ============
-- Byte-identical to 0007_the_tiebreak.sql except for ONE added block, marked
-- below.
create or replace function advance_phase(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_phase text;
  v_round int;
  v_status text := 'playing';
  v_ends timestamptz;
  v_contenders uuid[];
  v_winner uuid;
  v_is_tiebreak boolean;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status = 'finished' then raise exception 'game finished'; end if;
  if v_room.status <> 'playing' then raise exception 'game not started'; end if;

  v_round := v_room.current_round;
  v_is_tiebreak := v_room.sudden_death_round is not null
    and v_room.current_round = v_room.sudden_death_round;

  case v_room.phase
    when 'countdown' then v_phase := 'read';
    when 'read'      then v_phase := 'answer';
    when 'answer' then
      v_phase := 'reveal';
      if v_is_tiebreak then
        select a.player_id into v_winner
        from answers a
        where a.room_id = p_room_id
          and a.round = v_room.sudden_death_round
          and a.is_correct
          and a.player_id = any(v_room.sudden_death_contenders)
        order by a.time_remaining_ms desc, a.player_id asc
        limit 1;
        update rooms set sudden_death_winner_id = v_winner where id = p_room_id;
      end if;
    when 'reveal' then
      if v_is_tiebreak then
        v_phase := 'results'; v_status := 'finished';
      else
        v_phase := 'track';
      end if;
    when 'track' then
      if v_room.current_round >= v_room.total_rounds then
        v_contenders := perfect_first_place_tie(p_room_id, v_room.total_rounds);
        if v_room.sudden_death_round is null
           and v_room.reserve_question_id is not null
           and coalesce(array_length(v_contenders, 1), 0) >= 2 then
          v_phase := 'read';
          v_round := v_room.total_rounds + 1;
          insert into room_questions (room_id, round, question_id)
          values (p_room_id, v_round, v_room.reserve_question_id)
          on conflict (room_id, round) do update set question_id = excluded.question_id;
          update rooms set sudden_death_round = v_round,
            sudden_death_contenders = v_contenders
          where id = p_room_id;
        else
          v_phase := 'results'; v_status := 'finished';
        end if;
      else
        v_phase := 'read'; v_round := v_room.current_round + 1;
      end if;
    else raise exception 'cannot advance from phase %', v_room.phase;
  end case;

  -- ===== M3 P3a: the ONLY change from 0007 =====
  -- A READ inside the drawn track is a round start, and PRD §4 says that is
  -- when a late joiner materialises. The `v_round <= total_rounds` bound is
  -- what excludes the TIEBREAK: it sits one round past the finish line and
  -- belongs to the contenders (ADR-0043), so a spectator must not walk into it.
  --
  -- skip_question deliberately does NOT do this. A skip REUSES the round number
  -- (ADR-0038) — it is the same round with a different question, already under
  -- way for everybody else — so a late joiner waits for the next real one.
  if v_phase = 'read' and v_round <= v_room.total_rounds then
    perform materialize_late_joiners(p_room_id);
  end if;
  -- ===== end of the change =====

  v_ends := case v_phase
    when 'read'    then now() + interval '3 seconds'
    when 'answer'  then now() + make_interval(secs => v_room.timer_seconds)
    when 'reveal'  then now() + interval '5 seconds'
    when 'track'   then now() + interval '4 seconds'
    when 'results' then now() + make_interval(secs => ceremony_ms()::double precision / 1000)
    else null
  end;

  update rooms set phase = v_phase, current_round = v_round,
    status = v_status, phase_ends_at = v_ends
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- ============ start_game ============
-- Byte-identical to 0002_rpcs.sql except for ONE added statement.
--
-- A new race means nobody joined THIS one late and nobody has missed a report
-- of it yet. It matters most after a rematch (ADR-0046), which returns the room
-- to the lobby with last race's players still carrying last race's marks.
create or replace function start_game(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_players int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status <> 'lobby' then raise exception 'game already started'; end if;
  select count(*) into v_players from players where room_id = p_room_id and is_playing;
  if v_players < 2 then raise exception 'need at least 2 players'; end if;

  -- M3 P3a: the only change from 0002.
  update players set joined_late = false, absent_reports = 0 where room_id = p_room_id;

  update rooms set status = 'playing', phase = 'countdown', current_round = 1,
    phase_ends_at = now() + interval '3 seconds'
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

grant execute on all functions in schema public to anon, authenticated;
