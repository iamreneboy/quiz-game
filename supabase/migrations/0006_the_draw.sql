-- M3 P1 — the draw: inspectable, editable, and with a tiebreak held in reserve.
--
-- The whole file is IDEMPOTENT. It is written across four tasks and re-applied
-- after each one, so every statement here must survive a second run.

-- ============ schema ============
-- ADR-0039: a custom question is a `questions` row with a room_id, not a row in
-- a second table. The alternative breaks room_questions.question_id's foreign
-- key; this one keeps it, and leaves question_public and build_reveal
-- byte-identical.
alter table questions add column if not exists room_id uuid
  references rooms(id) on delete cascade;

create index if not exists idx_questions_room on questions (room_id);

-- The bank's uniqueness rule is a BANK rule. Narrowing it to `room_id is null`
-- lets a host write a room-local question whose prompt happens to match one in
-- the bank, and stops one room's custom question from blocking another room's.
drop index if exists uq_questions_category_prompt;
create unique index if not exists uq_questions_category_prompt
  on questions (category, prompt) where room_id is null;

-- ...and a room still cannot hold the same prompt twice.
create unique index if not exists uq_room_question_prompt
  on questions (room_id, prompt) where room_id is not null;

-- A question that is gone cannot be a round.
--
-- Without this cascade, deleting a room races two sibling cascades —
-- rooms -> questions (room-local) and rooms -> room_questions — and the order
-- between them is not guaranteed, so the questions cascade can hit a
-- room_questions row that still references it and raise. The cost is that
-- deleting a BANK question would silently delete live rounds; bank questions
-- are only ever inserted (P4's seed is additive), never deleted.
alter table room_questions drop constraint if exists room_questions_question_id_fkey;
alter table room_questions add constraint room_questions_question_id_fkey
  foreign key (question_id) references questions(id) on delete cascade;

-- The room remembers its own draw parameters. create_room took p_categories and
-- threw them away; swap_question needs the pool the host actually chose, and
-- add_custom_question needs it to validate a category.
alter table rooms add column if not exists categories text[] not null default '{}'::text[];

-- ADR-0041: the sudden-death reserve. One tier-4 question, drawn alongside the
-- main draw and held OUT of it. P2 consumes it; drawing it here means
-- create_room validates its availability up front. It is never returned by any
-- projection — revealing the tiebreak question would defeat it.
alter table rooms add column if not exists reserve_question_id uuid
  references questions(id) on delete set null;

-- ============ create_room ============
-- Byte-identical to 0002_rpcs.sql except for FOUR changes:
--   * `and room_id is null` on the availability count and the draw, so one
--     room's custom questions can never be drawn into another's (ADR-0039);
--   * `categories` is stored on the room;
--   * the tier-4 reserve is drawn and stored (ADR-0041);
--   * the return shape is unchanged, deliberately — the reserve is not on the
--     wire.
create or replace function create_room(
  p_timer_seconds int, p_categories text[], p_tier_counts int[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_code text;
  v_total int := 0;
  i int;
  v_available int;
  v_reserve uuid;
begin
  if p_timer_seconds < 5 or p_timer_seconds > 20 then
    raise exception 'timer must be 5-20 seconds';
  end if;
  if array_length(p_tier_counts, 1) is distinct from 4 then
    raise exception 'tier_counts must have exactly 4 entries';
  end if;
  for i in 1..4 loop
    if p_tier_counts[i] < 0 then raise exception 'tier counts cannot be negative'; end if;
    select count(*) into v_available from questions
      where tier = i and category = any(p_categories) and room_id is null;
    if v_available < p_tier_counts[i] then
      raise exception 'not enough questions in tier % (need %, have %)', i, p_tier_counts[i], v_available;
    end if;
    v_total := v_total + p_tier_counts[i];
  end loop;
  if v_total < 1 then raise exception 'select at least one question'; end if;

  loop
    v_code := gen_room_code();
    begin
      insert into rooms (code, timer_seconds, total_rounds, categories)
      values (v_code, p_timer_seconds, v_total, p_categories)
      returning * into v_room;
      exit;
    exception when unique_violation then
      -- rare code collision: retry
    end;
  end loop;

  -- Draw: random within tier, rounds ordered easy -> hard. That ordering is an
  -- INVARIANT every later draw RPC preserves: swap keeps the tier, add lands at
  -- the end of its own tier block, remove renumbers down.
  insert into room_questions (room_id, round, question_id)
  select v_room.id, row_number() over (order by picked.tier, random()), picked.id
  from (
    select id, tier from (
      select id, tier,
             row_number() over (partition by tier order by random()) as rn
      from questions
      where category = any(p_categories) and room_id is null
    ) shuffled
    where rn <= p_tier_counts[tier]
  ) picked;

  -- The reserve PREFERS the host's categories and falls back to the rest of the
  -- bank. A hard in-category requirement would make `create_room` reject a
  -- single-category room that takes every tier-4 question in it — which is
  -- exactly P4's "10-per-tier single category succeeds" exit criterion.
  select q.id into v_reserve
  from questions q
  where q.room_id is null and q.tier = 4
    and not exists (
      select 1 from room_questions rq
      where rq.room_id = v_room.id and rq.question_id = q.id)
  order by (q.category = any(p_categories)) desc, random()
  limit 1;
  if v_reserve is null then
    raise exception 'the bank has no spare Final Boss question to hold in reserve';
  end if;
  update rooms set reserve_question_id = v_reserve where id = v_room.id;

  return jsonb_build_object(
    'room_id', v_room.id, 'code', v_room.code,
    'host_key', v_room.host_key, 'total_rounds', v_total);
end $$;

grant execute on all functions in schema public to anon, authenticated;

-- ============ host_sees_answers ============
-- ADR-0040. The host's own choice at room creation — "I'm playing too" — is
-- what decides whether the review step may contain answers.
--
-- FAIL CLOSED. create_room runs before join_room, so there is a window with no
-- host player row at all; the coalesce default of `true` (is_playing) makes
-- that window mean NO answers rather than all of them.
create or replace function host_sees_answers(p_room_id uuid) returns boolean
language sql stable set search_path = public as $$
  select not coalesce(
    (select p.is_playing from players p
      where p.room_id = p_room_id and p.is_host limit 1), true);
$$;

-- ============ draw_public ============
-- The one projection every draw RPC returns, so the client replaces its whole
-- state from any of them and never has to merge.
--
-- Rounds 1..N only: `rooms.reserve_question_id` is deliberately absent
-- (ADR-0041). The redaction is TWO DIFFERENT OBJECTS rather than a nulled
-- field, because Design Pillar 2 is a statement about what the client
-- receives, and a `"correct_index": null` is still a received key.
create or replace function draw_public(p_room_id uuid, p_with_answers boolean) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'total_rounds',    (select r.total_rounds  from rooms r where r.id = p_room_id),
    'timer_seconds',   (select r.timer_seconds from rooms r where r.id = p_room_id),
    'categories',      (select to_jsonb(r.categories) from rooms r where r.id = p_room_id),
    'answers_visible', p_with_answers,
    'questions', coalesce((
      select jsonb_agg(
        case when p_with_answers then
          jsonb_build_object(
            'round', rq.round, 'category', q.category, 'tier', q.tier,
            'prompt', q.prompt, 'options', q.options,
            'is_custom', q.room_id is not null,
            'correct_index', q.correct_index, 'fun_fact', q.fun_fact)
        else
          jsonb_build_object(
            'round', rq.round, 'category', q.category, 'tier', q.tier,
            'prompt', q.prompt, 'options', q.options,
            'is_custom', q.room_id is not null)
        end
        order by rq.round)
      from room_questions rq join questions q on q.id = rq.question_id
      where rq.room_id = p_room_id), '[]'::jsonb));
$$;

-- ============ get_room_draw ============
-- PRD §5.1 step 5. Host-only, lobby-only: the draw is a pre-game artifact, and
-- once the race starts skip_question (0005) is the instrument, not this one.
create or replace function get_room_draw(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status <> 'lobby' then raise exception 'the draw is locked once the race starts'; end if;

  return draw_public(p_room_id, host_sees_answers(p_room_id));
end $$;

grant execute on all functions in schema public to anon, authenticated;
