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
