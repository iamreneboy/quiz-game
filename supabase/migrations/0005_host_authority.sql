-- M3 P0 — host authority: pause, resume, skip, end.
-- Roadmap decision 1: M3 opens the backend, additively. No destructive DDL:
-- one CHECK constraint is widened, one nullable column is added, four
-- functions are replaced and four are new.

-- ============ schema ============
-- The 'paused' status is deliberately in the STATUS enum rather than a side
-- flag. Two existing behaviours then come free:
--   * lib/useHostDriver.ts returns early on `status !== 'playing'`, so a paused
--     room schedules nothing;
--   * advance_phase already raises 'game not started' on any non-'playing'
--     status, so a paused room cannot be advanced by a stale timer.
-- submit_answer is the one place the trick does not cover; it is guarded below.
alter table rooms drop constraint if exists rooms_status_check;
alter table rooms add constraint rooms_status_check
  check (status in ('lobby','playing','paused','finished'));

-- Freeze-and-shift (roadmap decision 3): pause_game stores what was left and
-- clears phase_ends_at; resume_game writes now() + remaining. ADR-0014's
-- derivation is untouched — a paused room simply has no live deadline.
alter table rooms add column if not exists paused_remaining_ms int;

-- ============ phase_event ============
-- Byte-identical to 0002_rpcs.sql except for THREE added keys. See ADR-0037.
--   status              — the client can no longer INFER status from phase: a
--                         paused room's phase does not change.
--   paused_remaining_ms — `ends_at: null` reads as "beat settled" everywhere
--                         (lib/staging/beats.ts elapsedIn), which would blank a
--                         paused ANSWER's ring and drop its tension to 0. The
--                         frozen remainder is what makes a freeze a freeze.
--   total_rounds        — skip_question changes the track length mid-game, and
--                         the phase event is the only thing that reaches every
--                         client.
create or replace function phase_event(v_room rooms) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'phase', v_room.phase,
    'round', v_room.current_round,
    'ends_at', v_room.phase_ends_at,
    'server_now', now(),
    'status', v_room.status,
    'paused_remaining_ms', v_room.paused_remaining_ms,
    'total_rounds', v_room.total_rounds,
    'payload', case v_room.phase
      when 'read'    then question_public(v_room.id, v_room.current_round)
      when 'answer'  then question_public(v_room.id, v_room.current_round)
      when 'reveal'  then build_reveal(v_room.id, v_room.current_round)
      when 'track'   then standings(v_room.id, v_room.current_round)
      when 'results' then standings(v_room.id, v_room.current_round)
      else null
    end);
$$;

-- ============ get_room_state ============
-- Byte-identical to 0002_rpcs.sql except for one added room key. A client that
-- reloads into a paused room must land on the frozen remainder, not on zero.
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
      'paused_remaining_ms', v_room.paused_remaining_ms),
    'players', (
      select coalesce(jsonb_agg(player_public(p) order by p.joined_at), '[]'::jsonb)
      from players p where p.room_id = v_room.id),
    'question', case when v_room.phase in ('read','answer')
      then question_public(v_room.id, v_room.current_round) else null end,
    'reveal', case when v_room.phase in ('reveal','track')
      then build_reveal(v_room.id, v_room.current_round) else null end,
    'standings', case when v_room.status <> 'lobby'
      then standings(v_room.id, case when v_room.phase in ('read','answer')
        then v_room.current_round - 1 else v_room.current_round end)
      else null end);
end $$;

-- ============ submit_answer ============
-- Byte-identical to 0002_rpcs.sql except for ONE added term in the guard.
-- The status enum trick covers useHostDriver and advance_phase; it does NOT
-- cover this function, which checked `phase = 'answer'` without consulting
-- status — so a paused room mid-ANSWER would have kept accepting answers.
create or replace function submit_answer(
  p_room_id uuid, p_player_key uuid, p_round int, p_choice_index int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_player players;
  v_q questions;
  v_remaining_ms int;
  v_total_ms int;
  v_correct boolean;
  v_points int;
begin
  select * into v_room from rooms where id = p_room_id for share;
  if not found then raise exception 'room not found'; end if;
  if v_room.status <> 'playing'
     or v_room.phase <> 'answer'
     or v_room.current_round <> p_round then
    raise exception 'not accepting answers';
  end if;
  v_remaining_ms := ceil(extract(epoch from (v_room.phase_ends_at - now())) * 1000);
  if v_remaining_ms < -300 then raise exception 'too late'; end if;  -- 300ms grace
  v_remaining_ms := greatest(v_remaining_ms, 0);

  select * into v_player from players
    where room_id = p_room_id and player_key = p_player_key;
  if not found then raise exception 'player not found'; end if;
  if not v_player.is_playing then raise exception 'spectators cannot answer'; end if;
  if p_choice_index < 0 or p_choice_index > 3 then raise exception 'invalid choice'; end if;

  select q.* into v_q from room_questions rq
    join questions q on q.id = rq.question_id
    where rq.room_id = p_room_id and rq.round = p_round;

  v_correct := (v_q.correct_index = p_choice_index);
  v_total_ms := v_room.timer_seconds * 1000;
  v_points := case when v_correct
    then floor(v_remaining_ms::numeric / v_total_ms * 100)::int * v_q.tier
    else 0 end;

  begin
    insert into answers (room_id, round, player_id, choice_index, is_correct,
                         time_remaining_ms, speed_points)
    values (p_room_id, p_round, v_player.id, p_choice_index, v_correct,
            v_remaining_ms, v_points);
  exception when unique_violation then
    raise exception 'already answered';
  end;

  return jsonb_build_object('locked', true);
end $$;

-- ============ pause_game ============
create or replace function pause_game(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_remaining int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;

  -- IDEMPOTENT, AND THAT IS LOAD-BEARING. A second pause would compute its
  -- remainder from the phase_ends_at the FIRST pause already nulled, i.e. 0 —
  -- destroying the frozen remainder. A double-tap on the strip must be inert.
  if v_room.status = 'paused' then return phase_event(v_room); end if;
  if v_room.status <> 'playing' then raise exception 'game not running'; end if;

  v_remaining := greatest(0,
    coalesce(ceil(extract(epoch from (v_room.phase_ends_at - now())) * 1000), 0))::int;

  update rooms set status = 'paused', paused_remaining_ms = v_remaining,
    phase_ends_at = null
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- ============ resume_game ============
create or replace function resume_game(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status = 'playing' then return phase_event(v_room); end if;
  if v_room.status <> 'paused' then raise exception 'game not paused'; end if;

  -- The shift. Phase and round are untouched, so no client replays a beat:
  -- every consumer derives its position from the new deadline (ADR-0014).
  update rooms set status = 'playing',
    phase_ends_at = now()
      + make_interval(secs => coalesce(v_room.paused_remaining_ms, 0)::double precision / 1000),
    paused_remaining_ms = null
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- ============ skip_question ============
-- A skipped round SHORTENS THE TRACK (ADR-0038): its question and answers are
-- deleted, the tail renumbers down, and total_rounds drops by one. The round
-- NUMBER is reused, so the host lands on a fresh READ at the same label with
-- one fewer segment ahead. The alternative — leaving the row in place — makes
-- the finish line unreachable for the rest of the game.
create or replace function skip_question(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_round int;
  v_total int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status not in ('playing','paused') then raise exception 'game not running'; end if;
  if v_room.phase not in ('read','answer','reveal') then
    raise exception 'cannot skip from phase %', v_room.phase;
  end if;

  v_round := v_room.current_round;
  v_total := v_room.total_rounds - 1;

  delete from answers where room_id = p_room_id and round = v_round;
  delete from room_questions where room_id = p_room_id and round = v_round;

  -- Renumber the tail down one, VIA THE NEGATIVE SPACE. The primary key
  -- (room_id, round) is not deferrable, so a single `round = round - 1` can
  -- transiently collide with a row the statement has not reached yet — the
  -- update order is not guaranteed. Negative round numbers can never collide
  -- with positive ones, so two passes are provably safe.
  update room_questions set round = -round
    where room_id = p_room_id and round > v_round;
  update room_questions set round = (-round) - 1
    where room_id = p_room_id and round < 0;

  if v_round > v_total then
    -- The skipped round was the last one: the race ends here, at the ceremony,
    -- with the 9-second deadline 0004_ceremony.sql established.
    update rooms set total_rounds = v_total, current_round = v_total,
      status = 'finished', phase = 'results',
      phase_ends_at = now() + interval '9 seconds', paused_remaining_ms = null
    where id = p_room_id returning * into v_room;
  else
    -- Skipping RESUMES a paused room: the host asked to move on, not to hold.
    update rooms set total_rounds = v_total, status = 'playing', phase = 'read',
      phase_ends_at = now() + interval '3 seconds', paused_remaining_ms = null
    where id = p_room_id returning * into v_room;
  end if;

  return phase_event(v_room);
end $$;

-- ============ end_game ============
-- Straight to the ceremony from wherever the room stands.
create or replace function end_game(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_round int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status not in ('playing','paused') then raise exception 'game not running'; end if;

  v_round := v_room.current_round;

  -- A round is RESOLVED only once its outcome has been shown. COUNTDOWN, READ
  -- and ANSWER are in flight: their partial answers are discarded exactly as
  -- skip_question discards them, and the standings stop at the previous round.
  -- REVEAL and TRACK have already told the room what happened, so they count.
  if v_room.phase in ('countdown','read','answer') then
    delete from answers where room_id = p_room_id and round = v_round;
    v_round := greatest(0, v_round - 1);
  end if;

  -- total_rounds is deliberately left alone: the size of the draw is a fact
  -- about the room, and moving it here would jump the podium's track metric at
  -- the moment the ceremony starts drawing.
  update rooms set status = 'finished', phase = 'results', current_round = v_round,
    phase_ends_at = now() + interval '9 seconds', paused_remaining_ms = null
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- New functions need their own grant; 0002's blanket grant ran before they
-- existed.
grant execute on all functions in schema public to anon, authenticated;
