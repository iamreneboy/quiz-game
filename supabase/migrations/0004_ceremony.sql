-- M2 P5a — the ceremony's clock and its scoreboard.
-- Roadmap decision 4 exception, argued in docs/ADR/0027 and docs/ADR/0028.
-- Additive only: two functions replaced, no schema change, no data migration.

-- ============ advance_phase ============
-- Byte-identical to 0002_rpcs.sql except for ONE arm of v_ends: the results
-- phase now carries a deadline.
--
-- The results phase is TERMINAL, so this deadline means "when the ceremony has
-- finished playing", not "when the next phase begins" — there is no next phase.
-- It is inert for game state: useHostDriver returns early on BOTH
-- `status !== 'playing'` and `phase === 'results'` (lib/useHostDriver.ts:35),
-- and advance_phase itself raises 'game finished' when status = 'finished'.
-- Nothing schedules and nothing advances; the client reads it purely as an
-- animation anchor (ADR-0014).
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
    when 'results' then now() + interval '9 seconds'
    else null
  end;

  update rooms set phase = v_phase, current_round = v_round,
    status = v_status, phase_ends_at = v_ends
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- ============ standings ============
-- Byte-identical to 0003_reveal_picks.sql except for two added projection
-- fields. The sort is the Fairness Law and MUST NOT change (ADR-0018).
--
-- The room's timer arrives as a SCALAR SUBQUERY, not a join: this query groups
-- by p.id, and adding `rooms` to the from-list would put a new column into that
-- grouping's scope. The whole point of this migration is that the query's shape
-- is untouched and only the projection grows.
create or replace function standings(p_room_id uuid, p_max_round int) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(row order by row->'correct' desc, row->'speed_points' desc, row->'longest_streak' desc, row->>'player_id' asc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'player_id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'color', p.color,
      'correct', count(a.*) filter (where a.is_correct),
      'speed_points', coalesce(sum(a.speed_points) filter (where a.is_correct), 0),
      'longest_streak', longest_streak(p_room_id, p.id, p_max_round),
      'current_streak', current_streak(p_room_id, p.id, p_max_round),
      'answered', count(a.*),
      'avg_answer_ms', case when count(a.*) = 0 then null else round(avg(
          (select r.timer_seconds from rooms r where r.id = p_room_id) * 1000
          - a.time_remaining_ms
        ))::int end
    ) as row
    from players p
    left join answers a on a.player_id = p.id and a.room_id = p_room_id and a.round <= p_max_round
    where p.room_id = p_room_id and p.is_playing
    group by p.id
  ) s;
$$;
