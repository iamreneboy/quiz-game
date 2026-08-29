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

-- ============ schema ============
-- ADR-0043: sudden death is a ROUND, not a phase. The reserve question 0006
-- held out of the draw is inserted into room_questions at total_rounds + 1, so
-- question_public, build_reveal, submit_answer, the question surface, the timer
-- ring and useHostDriver's scheduler all work on it unchanged.
--
-- These three columns are everything that makes that round different from any
-- other: which round it is, who is allowed to answer it, and who won.
alter table rooms add column if not exists sudden_death_round int;
alter table rooms add column if not exists sudden_death_contenders uuid[];
alter table rooms add column if not exists sudden_death_winner_id uuid
  references players(id) on delete set null;

-- ============ scoring_round ============
-- THE CLAMP. This is the single mechanism that keeps a tiebreak answer from
-- becoming a correct answer.
--
-- standings() bounds visible answers by `a.round <= p_max_round`, and
-- longest_streak() bounds its walk by `rq.round <= p_max_round`. Clamping every
-- caller's round to total_rounds therefore makes round total_rounds + 1
-- invisible to BOTH — no new argument, no new branch, and `standings`' sort
-- clause stays byte-identical (ADR-0018).
--
-- For every round of a normal game this returns its argument unchanged, so the
-- three functions below are byte-equivalent to their previous bodies for any
-- room that never reaches a tiebreak.
create or replace function scoring_round(p_room_id uuid, p_round int) returns int
language sql stable set search_path = public as $$
  select least(p_round, (select r.total_rounds from rooms r where r.id = p_room_id));
$$;

-- ============ perfect_first_place_tie ============
-- The contenders, or fewer than two racers when there is no tiebreak to hold.
--
-- "Perfect" means every Fairness Law key ABOVE sudden death is level: correct
-- answers, speed points and longest streak (PRD §3.1, §5.4.2). The group is
-- always the HEAD of the standings by construction — the list is already
-- sorted by exactly those keys — which is what lets final_standings below lift
-- the winner without disturbing anybody outside it.
create or replace function perfect_first_place_tie(p_room_id uuid, p_max_round int)
returns uuid[]
language sql stable set search_path = public as $$
  with j as (select standings(p_room_id, p_max_round) as s),
  ranked as (
    select (e->>'player_id')::uuid as pid,
           (e->>'correct')::int as correct,
           (e->>'speed_points')::int as speed,
           (e->>'longest_streak')::int as streak,
           ord
    from j, jsonb_array_elements(j.s) with ordinality as t(e, ord)),
  head as (select correct, speed, streak from ranked where ord = 1)
  select coalesce(array_agg(r.pid order by r.ord), '{}'::uuid[])
  from ranked r, head h
  where r.correct = h.correct and r.speed = h.speed and r.streak = h.streak;
$$;

-- ============ final_standings ============
-- The Fairness Law's FOURTH key, applied as a presentation of the third's
-- result rather than as new arithmetic (roadmap decision 4).
--
-- standings() implements keys 1-3 plus `player_id asc` as a deterministic
-- fallback. PRD §3.1's chain is "Correct Answers -> Speed Points -> Longest
-- Streak -> Sudden Death", so the tiebreak occupies exactly the slot that
-- fallback was standing in. It is applied as a STABLE PARTITION — winner first,
-- everything else in the order standings returned it — so no player outside the
-- tied head group can move, and the sort clause in standings() is untouched.
--
-- `p_max_round` is passed through rather than assumed: end_game deliberately
-- stops the standings at the last RESOLVED round, and this wrapper must not
-- quietly widen that.
create or replace function final_standings(p_room_id uuid, p_max_round int) returns jsonb
language sql stable set search_path = public as $$
  with base as (
    select standings(p_room_id, p_max_round) as s,
           (select r.sudden_death_winner_id from rooms r where r.id = p_room_id) as w)
  select case when base.w is null then base.s else (
    select coalesce(
      jsonb_agg(e order by (e->>'player_id' = base.w::text) desc, ord), '[]'::jsonb)
    from jsonb_array_elements(base.s) with ordinality as t(e, ord)) end
  from base;
$$;

-- ============ build_reveal ============
-- Byte-identical to 0002_rpcs.sql except that its embedded standings call is
-- CLAMPED. Without this, the tiebreak round's own reveal would show a
-- scoreboard in which the tiebreak answer had already become a correct answer.
create or replace function build_reveal(p_room_id uuid, p_round int) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'correct_index', q.correct_index,
    'fun_fact', q.fun_fact,
    'counts', (
      select jsonb_agg(c.cnt order by c.idx) from (
        select gs.idx, count(a.*) as cnt
        from generate_series(0, 3) gs(idx)
        left join answers a on a.room_id = p_room_id and a.round = p_round
          and a.choice_index = gs.idx
        group by gs.idx
      ) c),
    'fastest', (
      select jsonb_build_object('player_id', a.player_id, 'nickname', p.nickname,
                                'time_remaining_ms', a.time_remaining_ms)
      from answers a join players p on p.id = a.player_id
      where a.room_id = p_room_id and a.round = p_round and a.is_correct
      order by a.time_remaining_ms desc limit 1),
    'standings', standings(p_room_id, scoring_round(p_room_id, p_round)))
  from room_questions rq join questions q on q.id = rq.question_id
  where rq.room_id = p_room_id and rq.round = p_round;
$$;

-- ============ phase_event ============
-- Byte-identical to 0005_host_authority.sql except for FOUR changes, all of
-- them consequences of the tiebreak being a round (ADR-0043):
--   * `sudden_death` — the wire's fourth opening (ADR-0042). A client cannot
--     derive this: nothing else on the event says that this round is a
--     tiebreak, who may answer it, or who won.
--   * the reveal arm's standings are clamped (inside build_reveal, above);
--   * the track arm's are clamped too — a tiebreak has no TRACK beat, so this
--     is defence rather than need, and costs nothing on every normal round;
--   * the results arm goes through final_standings, which is byte-equivalent
--     to standings() whenever no tiebreak was won.
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
-- Byte-identical to 0005_host_authority.sql except for the same two ideas: the
-- `sudden_death` key on the room, and clamped/finalised standings. The
-- standings arm is restructured from `case when status <> 'lobby'` into three
-- explicit arms so a FINISHED room reads the tiebreak-ordered list — a reload
-- onto the results screen must land on the same order the phase event carried.
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

-- ============ advance_phase ============
-- Task 1's body plus the tiebreak, in three arms:
--
--   answer -> reveal   resolves the tiebreak, so build_reveal below already
--                      runs against a decided room;
--   reveal -> results  a tiebreak round has NO track beat — nobody advances a
--                      segment, and the track is already the length the finish
--                      line was drawn at;
--   track  -> ...      the last regular round either opens the tiebreak or
--                      ends the game, exactly as before.
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
        -- FIRST correct answer wins (PRD §5.4.2). time_remaining_ms is the
        -- server's own measurement of how much of the timer was left, so
        -- `desc` is "answered earliest"; player_id breaks a dead heat the same
        -- deterministic way standings does.
        --
        -- No winner is a legitimate outcome: if nobody in the group got it
        -- right, the tie STANDS and the position is shared, which is PRD §6's
        -- rule for every place sudden death does not reach.
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
          -- The tiebreak opens as an ordinary READ, one round past the finish
          -- line. total_rounds is DELIBERATELY unchanged: the track is the
          -- length the race was run at, and growing it here would move the
          -- finish line the field has already crossed.
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

-- ============ submit_answer ============
-- Byte-identical to 0005_host_authority.sql except for ONE added guard: the
-- tiebreak belongs to the racers who tied.
--
-- This is authority, not presentation. Task 5 also renders a non-contender as a
-- spectator, but that is a courtesy — the rejection here is the rule
-- (roadmap decision 2).
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

  if v_room.sudden_death_round is not null
     and p_round = v_room.sudden_death_round
     and not (v_player.id = any(coalesce(v_room.sudden_death_contenders, '{}'::uuid[]))) then
    raise exception 'only the tied racers answer the tiebreak';
  end if;

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

-- ============ skip_question ============
-- Task 1's body plus ONE guard: the tiebreak cannot be skipped.
--
-- Skipping means "discard this round and move to the next", and a tiebreak has
-- no next — the renumbering would delete the round, shorten a track that is
-- already the right length, and leave sudden_death_round pointing at nothing.
-- The host who wants out of a tiebreak has end_game, which reaches the ceremony
-- with the tie intact and the position shared.
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
  if v_room.sudden_death_round is not null
     and v_room.current_round = v_room.sudden_death_round then
    raise exception 'the tiebreak cannot be skipped';
  end if;

  v_round := v_room.current_round;
  v_total := v_room.total_rounds - 1;

  delete from answers where room_id = p_room_id and round = v_round;
  delete from room_questions where room_id = p_room_id and round = v_round;

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

grant execute on all functions in schema public to anon, authenticated;
