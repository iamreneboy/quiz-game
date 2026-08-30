-- M3 P3b — the vanished host: auto-pause, auto-resume, the graceful end, and
-- the 24-hour room purge.
--
-- THE WHOLE FILE IS IDEMPOTENT. It is written across two tasks and re-applied
-- after each one.
--
-- Depends on 0009_presence.sql (rooms.host_seen_at, report_presence) and,
-- through the functions it replaces, on 0007_the_tiebreak.sql.

-- ============ thresholds ============
-- Three missed reports at 0009's presence_report_ms(). Short enough that
-- "pauses within the presence timeout" is true, long enough that ordinary
-- network jitter on a phone cannot fake a vanished host.
create or replace function host_absence_pause_ms() returns int
language sql immutable as $$ select 9000 $$;

-- PRD §9: "If the host is gone > 5 min, the room ends gracefully with current
-- standings."
create or replace function host_absence_end_ms() returns int
language sql immutable as $$ select 300000 $$;

-- ============ host_absent ============
-- DERIVED, NEVER STORED (ADR-0052). A stored `paused_reason` would have meant
-- replacing pause_game, resume_game, skip_question and end_game to keep it
-- true, and it would still have been WRONG for the one case that matters most:
-- a room the host paused deliberately and then walked away from. This predicate
-- simply tells the truth at the moment it is asked.
--
-- A null host_seen_at is NOT absence. Every room created before 0009 has one,
-- and "has never checked in" is not "has vanished".
create or replace function host_absent(r rooms) returns boolean
language sql stable set search_path = public as $$
  select r.host_seen_at is not null
     and now() - r.host_seen_at > make_interval(
           secs => host_absence_pause_ms()::double precision / 1000);
$$;

-- ============ phase_event ============
-- THE WIRE'S FIFTH OPENING (ADR-0052). Byte-identical to
-- 0007_the_tiebreak.sql except for ONE added key.
--
-- host_absent is on the wire because no client can compute it. Presence would
-- tell a client the host's SOCKET is gone; it would not tell it whether the
-- server has acted, and it tells a client that has only just subscribed
-- nothing at all. The pause card has to say which of two very different things
-- happened — "the host stopped the clock" or "we lost the host" — on every
-- surface including a television that just powered on.
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
    'host_absent', host_absent(v_room),
    'sudden_death', case when v_room.sudden_death_round is null then null else
      jsonb_build_object(
        'round', v_room.sudden_death_round,
        'contenders', to_jsonb(coalesce(v_room.sudden_death_contenders, '{}'::uuid[])),
        'winner_id', v_room.sudden_death_winner_id)
      end,
    'payload', case v_room.phase
      when 'read'    then question_public(v_room.id, v_room.current_round)
      when 'answer'  then question_public(v_room.id, v_room.current_round)
      when 'reveal'  then build_reveal(v_room.id, v_room.current_round)
      when 'track'   then standings(v_room.id, scoring_round(v_room.id, v_room.current_round))
      when 'results' then final_standings(v_room.id, scoring_round(v_room.id, v_room.current_round))
      else null
    end);
$$;

-- ============ get_room_state ============
-- Byte-identical to 0009_presence.sql — NOT to 0007_the_tiebreak.sql, which
-- this plan quoted: 0009 is the live definition and it added `host_seen_at` to
-- the room object, so rebasing on 0007 would have silently dropped that key
-- back off the projection. Exactly ONE key is added here: `host_absent`. A
-- client that reloads into an abandoned room must land on the right notice,
-- not on the generic one.
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
      'host_absent', host_absent(v_room),
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

-- ============ end_room_now ============
-- The finish, lifted verbatim out of 0007's end_game so that TWO callers share
-- ONE definition of what ending a race means. The five-minute graceful end must
-- land on exactly the standings the host's own End race button would have
-- produced — extracting it is what makes that true by construction rather than
-- by two bodies staying in step.
--
-- No key check and no status check here: this is the mechanism, not the
-- command. Both callers below do their own authorisation first — and because it
-- is the mechanism rather than a command, it is REVOKED from anon/authenticated
-- at the foot of this file. ADR-0051 admits a keyless RPC only when the caller
-- gains nothing it was not already entitled to; a reachable end_room_now would
-- hand any client the power to end any race, which is exactly what that bar
-- excludes. Both callers are security definer, so the revoke costs them
-- nothing.
create or replace function end_room_now(p_room_id uuid) returns rooms
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_round int;
begin
  select * into v_room from rooms where id = p_room_id;
  v_round := v_room.current_round;

  -- A round is RESOLVED only once its outcome has been shown. COUNTDOWN, READ
  -- and ANSWER are in flight: their partial answers are discarded exactly as
  -- skip_question discards them, and the standings stop at the previous round.
  if v_room.phase in ('countdown','read','answer') then
    delete from answers where room_id = p_room_id and round = v_round;
    v_round := greatest(0, v_round - 1);
  end if;

  -- total_rounds is deliberately left alone: the size of the draw is a fact
  -- about the room, and moving it here would jump the podium's track metric at
  -- the moment the ceremony starts drawing.
  update rooms set status = 'finished', phase = 'results', current_round = v_round,
    phase_ends_at = now() + make_interval(secs => ceremony_ms()::double precision / 1000),
    paused_remaining_ms = null
  where id = p_room_id returning * into v_room;

  return v_room;
end $$;

-- ============ end_game ============
-- Now a thin command over end_room_now. The guards are unchanged from
-- 0007_the_tiebreak.sql; only the body moved.
create or replace function end_game(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status not in ('playing','paused') then raise exception 'game not running'; end if;

  return phase_event(end_room_now(p_room_id));
end $$;

-- ============ sweep_host_absence ============
-- THE ONE MUTATING RPC IN THIS PROJECT WITH NO KEY, and ADR-0051 is the whole
-- argument for why that is admissible.
--
-- A departed host cannot call its own RPC, so somebody else must. That somebody
-- is granted NOTHING: this function's authority comes entirely from
-- rooms.host_seen_at, which only the real host key can refresh
-- (report_presence, 0009). A caller whose host is alive cannot pause anything;
-- a caller whose host is dead can do exactly one thing, and it is the thing the
-- host would have done. There is no key to leak, because there is no power to
-- borrow.
--
-- Returns SQL null when nothing changed. The caller broadcasts only on a
-- non-null result, so a herd of sweeps produces at most one phase event.
create or replace function sweep_host_absence(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_gone_ms bigint;
  v_remaining int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found then raise exception 'room not found'; end if;

  -- A lobby has no clock to freeze and a finished room has nothing left to
  -- stop. Both are silent no-ops rather than errors: the sweep runs on a timer
  -- and its callers must never have to special-case a phase.
  if v_room.status not in ('playing','paused') then return null; end if;

  -- Never checked in is not vanished (see host_absent above).
  if v_room.host_seen_at is null then return null; end if;

  v_gone_ms := floor(extract(epoch from (now() - v_room.host_seen_at)) * 1000);

  -- PRD §9: past five minutes the show is over. Through the SAME path the
  -- host's own End race button uses, so the standings are identical.
  if v_gone_ms >= host_absence_end_ms() then
    return phase_event(end_room_now(p_room_id));
  end if;

  if v_gone_ms < host_absence_pause_ms() then return null; end if;

  -- Already stopped. Recomputing the remainder here would read it from the
  -- phase_ends_at the FIRST pause nulled, i.e. 0 — destroying the freeze. This
  -- is the identical trap pause_game guards, for the identical reason.
  if v_room.status = 'paused' then return null; end if;

  -- Freeze-and-shift, byte-for-byte pause_game's (roadmap decision 3). Nothing
  -- about the model changes because the pause was involuntary.
  v_remaining := greatest(0,
    coalesce(ceil(extract(epoch from (v_room.phase_ends_at - now())) * 1000), 0))::int;

  update rooms set status = 'paused', paused_remaining_ms = v_remaining,
    phase_ends_at = null
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

grant execute on all functions in schema public to anon, authenticated;

-- ============ purge_rooms ============
-- PRD §9: "rooms expire and are purged 24h after creation (Supabase scheduled
-- function or cleanup on access)". This is cleanup on access.
--
-- The cascades do all the work: players, room_questions, answers and a room's
-- custom questions (0006's `questions.room_id … on delete cascade`) all go with
-- the row — which is also what finally bounds `rooms.used_question_ids`, the
-- unbounded array M3 P2b left behind.
--
-- Exposed as a plain RPC as well as a trigger so a future pg_cron job, or a
-- host tool, can call it without duplicating the predicate.
create or replace function purge_rooms() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  with gone as (
    delete from rooms where created_at < now() - interval '24 hours' returning 1
  )
  select count(*) into v_n from gone;
  return v_n;
end $$;

create index if not exists idx_rooms_created_at on rooms (created_at);

-- The trigger, rather than a `perform purge_rooms()` inside create_room: that
-- would have meant re-stating 0006's whole 75-line create_room to add one line,
-- and it would have missed rematch and any future room writer. STATEMENT-level,
-- so create_room's code-collision retry loop cannot make it run per row; and it
-- cannot recurse, because a DELETE fires no INSERT trigger.
create or replace function trg_purge_rooms() returns trigger
language plpgsql set search_path = public as $$
begin
  perform purge_rooms();
  return null;
end $$;

drop trigger if exists rooms_purge_expired on rooms;
create trigger rooms_purge_expired
  before insert on rooms
  for each statement
  execute function trg_purge_rooms();

grant execute on all functions in schema public to anon, authenticated;

-- end_room_now is the mechanism, not a command: see its header. The blanket
-- grants above are deliberately walked back for it, and only for it.
--
-- `public` MUST be in this list. Postgres grants EXECUTE on every new function
-- to PUBLIC by default, so revoking from anon/authenticated alone leaves the
-- function fully reachable over PostgREST — verified, not assumed
-- (`has_function_privilege('anon', …)` still answered true).
revoke execute on function end_room_now(uuid) from public, anon, authenticated;
