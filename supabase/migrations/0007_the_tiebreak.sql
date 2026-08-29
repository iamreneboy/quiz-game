-- M3 P2a — the tiebreak: a photo finish, and a sudden-death round past the
-- finish line.
--
-- The whole file is IDEMPOTENT. It is written across two tasks and re-applied
-- after each one, so every statement here must survive a second run.
--
-- Depends on 0005_host_authority.sql (rooms.paused_remaining_ms, the widened
-- rooms_status_check) and 0006_the_draw.sql (rooms.reserve_question_id).

-- ============ ceremony_ms ============
-- The results phase's length, in milliseconds, as ONE number.
--
-- 0004 put a 9-second deadline on the terminal results phase so the ceremony
-- could derive its position from ends_at like every other beat (ADR-0027).
-- P2a puts a photo-finish prelude in front of the podium, and the deadline has
-- to cover it — but making the deadline DEPEND on whether a tie exists would
-- mean implementing the tie rule twice, once here and once in TypeScript, and
-- the two would be free to drift.
--
-- So the deadline always reserves the prelude (ADR-0044). A ceremony with no
-- tie plays exactly the sequence P5a built and then sits settled for the
-- remainder. That costs nothing: the deadline is inert for game state —
-- useHostDriver returns early at results and advance_phase raises once the room
-- is finished — so nothing schedules against it and nothing advances past it.
--
-- lib/ceremony/beats.ts's CEREMONY_MS is the hand-maintained mirror of this
-- value, in the same tradition as lib/staging/beats.ts's NOMINAL_MS.
create or replace function ceremony_ms() returns int
language sql immutable as $$ select 12400 $$;

-- ============ advance_phase ============
-- Byte-identical to 0005_host_authority.sql's inherited 0004 body except for
-- ONE arm of v_ends: the results deadline now comes from ceremony_ms().
create or replace function advance_phase(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_phase text;
  v_round int;
  v_status text := 'playing';
  v_ends timestamptz;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status = 'finished' then raise exception 'game finished'; end if;
  if v_room.status <> 'playing' then raise exception 'game not started'; end if;

  v_round := v_room.current_round;
  case v_room.phase
    when 'countdown' then v_phase := 'read';
    when 'read'      then v_phase := 'answer';
    when 'answer'    then v_phase := 'reveal';
    when 'reveal'    then v_phase := 'track';
    when 'track' then
      if v_room.current_round >= v_room.total_rounds then
        v_phase := 'results'; v_status := 'finished';
      else
        v_phase := 'read'; v_round := v_room.current_round + 1;
      end if;
    else raise exception 'cannot advance from phase %', v_room.phase;
  end case;

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

-- ============ skip_question ============
-- Byte-identical to 0005_host_authority.sql except that the last-round branch's
-- ceremony deadline comes from ceremony_ms().
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

  -- Renumber the tail down one VIA THE NEGATIVE SPACE (ADR-0038): the
  -- (room_id, round) primary key is not deferrable, so a single
  -- `round = round - 1` can transiently collide with a row the statement has
  -- not reached yet.
  update room_questions set round = -round
    where room_id = p_room_id and round > v_round;
  update room_questions set round = (-round) - 1
    where room_id = p_room_id and round < 0;

  if v_round > v_total then
    update rooms set total_rounds = v_total, current_round = v_total,
      status = 'finished', phase = 'results',
      phase_ends_at = now() + make_interval(secs => ceremony_ms()::double precision / 1000),
      paused_remaining_ms = null
    where id = p_room_id returning * into v_room;
  else
    update rooms set total_rounds = v_total, status = 'playing', phase = 'read',
      phase_ends_at = now() + interval '3 seconds', paused_remaining_ms = null
    where id = p_room_id returning * into v_room;
  end if;

  return phase_event(v_room);
end $$;

-- ============ end_game ============
-- Byte-identical to 0005_host_authority.sql except for the ceremony deadline.
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
  if v_room.phase in ('countdown','read','answer') then
    delete from answers where room_id = p_room_id and round = v_round;
    v_round := greatest(0, v_round - 1);
  end if;

  update rooms set status = 'finished', phase = 'results', current_round = v_round,
    phase_ends_at = now() + make_interval(secs => ceremony_ms()::double precision / 1000),
    paused_remaining_ms = null
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

grant execute on all functions in schema public to anon, authenticated;
