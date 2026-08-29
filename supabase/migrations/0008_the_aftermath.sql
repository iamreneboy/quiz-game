-- M3 P2b — the aftermath: the awards projection, and a rematch that resets the
-- room in place.
--
-- The whole file is IDEMPOTENT. It is written across two tasks and re-applied
-- after each one, so every statement here must survive a second run.
--
-- Depends on 0006_the_draw.sql (questions.room_id, rooms.categories,
-- rooms.reserve_question_id) and 0007_the_tiebreak.sql (scoring_round,
-- final_standings, the sudden_death_* columns).
--
-- The ceremony's clock is NOT touched. `ceremony_ms()` stays 12400: the awards
-- beat sits at 7200 inside the deadline 0007 already reserved, so P2b spends
-- nothing on the wire and nothing on the clock.

-- ============ award_winners ============
-- One award, from one integer field of a standings array.
--
-- Returns NULL — not a zero-valued award — when the best score is 0 or less.
-- "Most correct" in a race where nobody answered anything is not a fact about
-- a player, and handing out a Big Brain for zero correct answers would be the
-- projection inventing a result. Every caller below folds NULL away.
--
-- ORDINALITY is load-bearing on the aggregate: `standings` arrives ordered by
-- the Fairness Law (ADR-0018) and a tied award must list its winners in that
-- same order, so the card reads top-down like the board above it. jsonb_agg
-- has no inherent order to inherit.
create or replace function award_winners(p_standings jsonb, p_key text, p_field text)
returns jsonb
language sql immutable set search_path = public as $$
  with rows as (
    select e, ord, (e->>p_field)::int as v
    from jsonb_array_elements(coalesce(p_standings, '[]'::jsonb))
      with ordinality as t(e, ord)),
  best as (select max(v) as v from rows)
  select case when best.v is null or best.v <= 0 then null else
    jsonb_build_object(
      'key', p_key,
      'value', best.v,
      'winners', (
        select jsonb_agg(jsonb_build_object(
                 'player_id', rows.e->>'player_id',
                 'nickname',  rows.e->>'nickname',
                 'avatar',    rows.e->>'avatar',
                 'color',     rows.e->>'color')
               order by rows.ord)
        from rows where rows.v = best.v))
  end
  from best;
$$;

-- ============ late_surge ============
-- 📈 Late Surge: most positions gained in the second half (PRD §5.4.4).
--
-- Reconstructed from `answers`, because nothing stores a historical placing:
-- the standings AT THE MIDPOINT are recomputed by asking standings() for the
-- midpoint round, and each racer's gain is their midpoint rank minus their
-- final rank.
--
-- The final side reads `final_standings`, not `standings`: a sudden-death
-- winner has been lifted to the head (ADR-0043) and that IS where the room saw
-- them finish. The midpoint side reads plain `standings` — no tiebreak had
-- happened yet at the midpoint.
--
-- Nobody gaining ground is a legitimate outcome and returns NULL: the second
-- half of a race in which nothing moved has no surge in it.
create or replace function late_surge(
  p_room_id uuid, p_bound int, p_mid int, p_final jsonb
) returns jsonb
language sql stable set search_path = public as $$
  with mid as (
    select e->>'player_id' as pid, ord as rank
    from jsonb_array_elements(standings(p_room_id, p_mid))
      with ordinality as t(e, ord)),
  fin as (
    select e->>'player_id' as pid, ord as rank, e
    from jsonb_array_elements(coalesce(p_final, '[]'::jsonb))
      with ordinality as t(e, ord)),
  gains as (
    select fin.e, fin.rank as ord, (mid.rank - fin.rank)::int as gain
    from fin join mid on mid.pid = fin.pid),
  best as (select max(gain) as g from gains)
  select case when best.g is null or best.g <= 0 then null else
    jsonb_build_object(
      'key', 'late-surge',
      'value', best.g,
      'winners', (
        select jsonb_agg(jsonb_build_object(
                 'player_id', gains.e->>'player_id',
                 'nickname',  gains.e->>'nickname',
                 'avatar',    gains.e->>'avatar',
                 'color',     gains.e->>'color')
               order by gains.ord)
        from gains where gains.gain = best.g))
  end
  from best;
$$;

-- ============ awards ============
-- PRD §5.4.4, as the roadmap specified it: a PURE PROJECTION. It reads; it
-- never writes, and nothing it returns can feed back into rank (roadmap
-- decision 4).
--
-- BOUNDED BY scoring_round, which is P2a's standing obligation on every
-- consumer that computes a scoring bound: the tiebreak is a real round at
-- total_rounds + 1, and without the clamp its answer would count toward
-- Fastest Gun and Hot Streak. `current_round` is the right argument because
-- end_game deliberately stops the room at the last RESOLVED round.
--
-- Callable by anyone with the room id, deliberately: every surface renders the
-- awards, including a stage view that holds no host key, and the projection
-- discloses nothing a client's own `standings` does not already carry.
create or replace function awards(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_bound int;
  v_mid int;
  v_final jsonb;
  v_out jsonb := '[]'::jsonb;
  v_award jsonb;
begin
  select scoring_round(p_room_id, r.current_round) into v_bound
  from rooms r where r.id = p_room_id;
  if v_bound is null or v_bound < 1 then return '[]'::jsonb; end if;

  v_final := final_standings(p_room_id, v_bound);

  -- Fixed order, PRD §5.4.4's own: Big Brain, Fastest Gun, Hot Streak, Late
  -- Surge. The client re-sorts into the same order anyway (lib/awards.ts), so
  -- a future award can be appended here without a client change.
  v_award := award_winners(v_final, 'big-brain', 'correct');
  if v_award is not null then v_out := v_out || jsonb_build_array(v_award); end if;

  v_award := award_winners(v_final, 'fastest-gun', 'speed_points');
  if v_award is not null then v_out := v_out || jsonb_build_array(v_award); end if;

  v_award := award_winners(v_final, 'hot-streak', 'longest_streak');
  if v_award is not null then v_out := v_out || jsonb_build_array(v_award); end if;

  -- A one-round race has no halves to compare, so it has no surge. Integer
  -- division floors, which is what puts the midpoint at the end of the first
  -- half for an odd round count.
  v_mid := v_bound / 2;
  if v_mid >= 1 then
    v_award := late_surge(p_room_id, v_bound, v_mid, v_final);
    if v_award is not null then v_out := v_out || jsonb_build_array(v_award); end if;
  end if;

  return v_out;
end $$;

grant execute on all functions in schema public to anon, authenticated;

-- ============ schema ============
-- ADR-0046: the room's memory of what it has already asked.
--
-- room_questions is REWRITTEN by every rematch, so it cannot be the record —
-- and PRD §5.4.6 requires the redraw to exclude questions already used. This
-- array is appended from room_questions on the way out, which means a SPENT
-- tiebreak is recorded for free (it is a real row at total_rounds + 1,
-- ADR-0043) and an UNSPENT reserve is correctly not (it never became a row).
-- Getting that distinction free is why the append reads the draw rather than
-- the room's own reserve column.
alter table rooms add column if not exists used_question_ids uuid[] not null
  default '{}'::uuid[];

-- ============ rematch ============
-- PRD §5.4.6. The SAME room, reset in place: same id, same code, same players,
-- so no session is invalidated and nobody re-joins — sessions are code-keyed
-- (lib/session.ts), which is the whole reason this is a reset and not a new
-- room (ADR-0046).
--
-- Config is "same or tweaked": each of the three parameters defaults to the
-- race just played. The tier counts default to the HISTOGRAM OF THE PREVIOUS
-- DRAW rather than to a stored setting, which is both simpler and more correct
-- — it carries forward whatever the host added or removed in the review step.
--
-- Everything about the previous race is destroyed except the players and the
-- used list: answers, the draw, and any room-local custom questions, which are
-- questions this room has already asked and live only in it (ADR-0039).
create or replace function rematch(
  p_room_id uuid, p_host_key uuid,
  p_timer_seconds int default null,
  p_categories text[] default null,
  p_tier_counts int[] default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_timer int;
  v_cats text[];
  v_counts int[];
  v_used uuid[];
  v_total int := 0;
  v_available int;
  v_reserve uuid;
  i int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status <> 'finished' then raise exception 'the race has not finished'; end if;

  v_timer := coalesce(p_timer_seconds, v_room.timer_seconds);
  v_cats  := coalesce(p_categories, v_room.categories);

  -- The default mix is the shape of the race just run, tier by tier. A room
  -- whose host added two custom Warm-Ups gets two more Warm-Ups, from the bank.
  v_counts := coalesce(p_tier_counts, (
    select array[
      count(*) filter (where q.tier = 1), count(*) filter (where q.tier = 2),
      count(*) filter (where q.tier = 3), count(*) filter (where q.tier = 4)]::int[]
    from room_questions rq join questions q on q.id = rq.question_id
    where rq.room_id = p_room_id
      -- The tiebreak was never part of the draw the host chose, so it must not
      -- inflate the next one.
      and (v_room.sudden_death_round is null or rq.round <> v_room.sudden_death_round)));

  if v_timer < 5 or v_timer > 20 then raise exception 'timer must be 5-20 seconds'; end if;
  if coalesce(array_length(v_cats, 1), 0) < 1 then raise exception 'select at least one category'; end if;
  if array_length(v_counts, 1) is distinct from 4 then
    raise exception 'tier_counts must have exactly 4 entries';
  end if;

  -- Remember this race BEFORE deleting it. Straight off room_questions, so the
  -- tiebreak round is included exactly when it was actually asked.
  v_used := v_room.used_question_ids || coalesce((
    select array_agg(rq.question_id) from room_questions rq where rq.room_id = p_room_id
  ), '{}'::uuid[]);

  for i in 1..4 loop
    if v_counts[i] < 0 then raise exception 'tier counts cannot be negative'; end if;
    -- The same availability check create_room makes, plus the room's memory.
    select count(*) into v_available from questions q
      where q.tier = i and q.category = any(v_cats) and q.room_id is null
        and not (q.id = any(v_used));
    if v_available < v_counts[i] then
      raise exception 'not enough unused questions in tier % (need %, have %)',
        i, v_counts[i], v_available;
    end if;
    v_total := v_total + v_counts[i];
  end loop;
  if v_total < 1 then raise exception 'select at least one question'; end if;

  -- Tear the old race down. answers first: room_questions' rows are what its
  -- rounds refer to, and a custom question's delete cascades into
  -- room_questions (0006), so doing this in any other order is a race with a
  -- cascade.
  delete from answers where room_id = p_room_id;
  delete from room_questions where room_id = p_room_id;
  delete from questions where room_id = p_room_id;

  -- The draw, byte-for-byte create_room's, plus `not (id = any(v_used))`.
  -- Rounds stay ordered easy -> hard, which every draw RPC in 0006 preserves.
  insert into room_questions (room_id, round, question_id)
  select p_room_id, row_number() over (order by picked.tier, random()), picked.id
  from (
    select id, tier from (
      select id, tier,
             row_number() over (partition by tier order by random()) as rn
      from questions
      where category = any(v_cats) and room_id is null and not (id = any(v_used))
    ) shuffled
    where rn <= v_counts[tier]
  ) picked;

  -- A FRESH reserve (ADR-0041): the old one is either spent — in which case it
  -- is in v_used — or was never asked, in which case it is fair game again.
  -- Category-preferring with a bank-wide fallback, exactly as create_room.
  select q.id into v_reserve
  from questions q
  where q.room_id is null and q.tier = 4
    and not (q.id = any(v_used))
    and not exists (
      select 1 from room_questions rq
      where rq.room_id = p_room_id and rq.question_id = q.id)
  order by (q.category = any(v_cats)) desc, random()
  limit 1;
  if v_reserve is null then
    raise exception 'the bank has no spare Final Boss question to hold in reserve';
  end if;

  -- Back to the starting grid. The three sudden_death_* columns are cleared
  -- here and nowhere else; leaving any of them set would make the next race's
  -- first round look like a tiebreak to submit_answer, phase_event and the
  -- staging runtime at once.
  update rooms set
    status = 'lobby', phase = 'lobby', current_round = 0, phase_ends_at = null,
    paused_remaining_ms = null,
    timer_seconds = v_timer, categories = v_cats, total_rounds = v_total,
    used_question_ids = v_used, reserve_question_id = v_reserve,
    sudden_death_round = null, sudden_death_contenders = null,
    sudden_death_winner_id = null
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

grant execute on all functions in schema public to anon, authenticated;
