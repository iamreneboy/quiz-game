-- M2 P3b — the one protocol opening (roadmap decision 4).
-- Additive only: two functions replaced, no schema change, no data migration.

-- ============ current_streak ============
-- longest_streak's loop, returning the TRAILING run rather than the best one.
-- The streak flame is persistent flair (ADR-0013) but `streak-tier` cues fire
-- only at 3/5/8, so a reload mid-streak used to lose the flame until the next
-- milestone. With the run on the wire, flairFor derives it like every other
-- piece of flair.
create or replace function current_streak(p_room_id uuid, p_player_id uuid, p_max_round int) returns int
language plpgsql stable set search_path = public as $$
declare
  r record;
  cur int := 0;
begin
  for r in
    select coalesce(a.is_correct, false) as ok
    from room_questions rq
    left join answers a on a.room_id = rq.room_id and a.round = rq.round
      and a.player_id = p_player_id
    where rq.room_id = p_room_id and rq.round <= p_max_round
    order by rq.round
  loop
    if r.ok then cur := cur + 1;
    else cur := 0;
    end if;
  end loop;
  return cur;
end $$;

-- ============ standings ============
-- Unchanged except for the added current_streak field. The sort is the
-- Fairness Law and must stay byte-identical: correct desc -> speed_points desc
-- -> longest_streak desc -> player_id asc.
create or replace function standings(p_room_id uuid, p_max_round int) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(row order by row->'correct' desc, row->'speed_points' desc, row->'longest_streak' desc, row->>'player_id' asc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'player_id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'color', p.color,
      'correct', count(a.*) filter (where a.is_correct),
      'speed_points', coalesce(sum(a.speed_points) filter (where a.is_correct), 0),
      'longest_streak', longest_streak(p_room_id, p.id, p_max_round),
      'current_streak', current_streak(p_room_id, p.id, p_max_round)
    ) as row
    from players p
    left join answers a on a.player_id = p.id and a.room_id = p_room_id and a.round <= p_max_round
    where p.room_id = p_room_id and p.is_playing
    group by p.id
  ) s;
$$;

-- ============ build_reveal ============
-- Gains 'picks': who chose what, for the avatar-stacked distribution bar.
-- 'counts' STAYS even though picks subsumes it: it keeps the phase-reveal cue's
-- shape untouched (ADR-0001) and is the fallback for a client running against a
-- database that has not taken this migration.
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
    'picks', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'player_id', a.player_id, 'choice_index', a.choice_index)
             order by a.time_remaining_ms desc), '[]'::jsonb)
      from answers a
      where a.room_id = p_room_id and a.round = p_round),
    'fastest', (
      select jsonb_build_object('player_id', a.player_id, 'nickname', p.nickname,
                                'time_remaining_ms', a.time_remaining_ms)
      from answers a join players p on p.id = a.player_id
      where a.room_id = p_room_id and a.round = p_round and a.is_correct
      order by a.time_remaining_ms desc limit 1),
    'standings', standings(p_room_id, p_round))
  from room_questions rq join questions q on q.id = rq.question_id
  where rq.room_id = p_room_id and rq.round = p_round;
$$;
