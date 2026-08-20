-- ============ question_public ============
create or replace function question_public(p_room_id uuid, p_round int) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'category', q.category, 'tier', q.tier,
    'prompt', q.prompt, 'options', q.options)
  from room_questions rq join questions q on q.id = rq.question_id
  where rq.room_id = p_room_id and rq.round = p_round;
$$;

-- ============ longest_streak ============
create or replace function longest_streak(p_room_id uuid, p_player_id uuid, p_max_round int) returns int
language plpgsql stable set search_path = public as $$
declare
  r record;
  cur int := 0;
  best int := 0;
begin
  for r in
    select coalesce(a.is_correct, false) as ok
    from room_questions rq
    left join answers a on a.room_id = rq.room_id and a.round = rq.round
      and a.player_id = p_player_id
    where rq.room_id = p_room_id and rq.round <= p_max_round
    order by rq.round
  loop
    if r.ok then cur := cur + 1; best := greatest(best, cur);
    else cur := 0;
    end if;
  end loop;
  return best;
end $$;

-- ============ standings ============
-- Sorted by the Fairness Law: correct desc → speed_points desc → longest_streak desc → player_id asc (deterministic tiebreak)
-- p_max_round bounds which rounds' answers are visible, so standings polled mid-round never leak
-- the outcome of the round currently in its ANSWER phase before reveal.
create or replace function standings(p_room_id uuid, p_max_round int) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(row order by row->'correct' desc, row->'speed_points' desc, row->'longest_streak' desc, row->>'player_id' asc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'player_id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'color', p.color,
      'correct', count(a.*) filter (where a.is_correct),
      'speed_points', coalesce(sum(a.speed_points) filter (where a.is_correct), 0),
      'longest_streak', longest_streak(p_room_id, p.id, p_max_round)
    ) as row
    from players p
    left join answers a on a.player_id = p.id and a.room_id = p_room_id and a.round <= p_max_round
    where p.room_id = p_room_id and p.is_playing
    group by p.id
  ) s;
$$;

-- ============ build_reveal ============
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
    'standings', standings(p_room_id, p_round))
  from room_questions rq join questions q on q.id = rq.question_id
  where rq.room_id = p_room_id and rq.round = p_round;
$$;

-- ============ phase_event helper ============
create or replace function phase_event(v_room rooms) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'phase', v_room.phase,
    'round', v_room.current_round,
    'ends_at', v_room.phase_ends_at,
    'server_now', now(),
    'payload', case v_room.phase
      when 'read'    then question_public(v_room.id, v_room.current_round)
      when 'answer'  then question_public(v_room.id, v_room.current_round)
      when 'reveal'  then build_reveal(v_room.id, v_room.current_round)
      when 'track'   then standings(v_room.id, v_room.current_round)
      when 'results' then standings(v_room.id, v_room.current_round)
      else null
    end);
$$;

-- ============ helpers ============
create or replace function gen_room_code() returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ', (floor(random()*23)+1)::int, 1), '')
  from generate_series(1, 5);
$$;

-- Public projection of a player row (never exposes player_key)
create or replace function player_public(p players) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'color', p.color,
    'is_host', p.is_host, 'is_playing', p.is_playing);
$$;

-- ============ create_room ============
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
      where tier = i and category = any(p_categories);
    if v_available < p_tier_counts[i] then
      raise exception 'not enough questions in tier % (need %, have %)', i, p_tier_counts[i], v_available;
    end if;
    v_total := v_total + p_tier_counts[i];
  end loop;
  if v_total < 1 then raise exception 'select at least one question'; end if;

  loop
    v_code := gen_room_code();
    begin
      insert into rooms (code, timer_seconds, total_rounds)
      values (v_code, p_timer_seconds, v_total)
      returning * into v_room;
      exit;
    exception when unique_violation then
      -- rare code collision: retry
    end;
  end loop;

  -- Draw: random within tier, rounds ordered easy → hard
  insert into room_questions (room_id, round, question_id)
  select v_room.id, row_number() over (order by picked.tier, random()), picked.id
  from (
    select id, tier from (
      select id, tier,
             row_number() over (partition by tier order by random()) as rn
      from questions
      where category = any(p_categories)
    ) shuffled
    where rn <= p_tier_counts[tier]
  ) picked;

  return jsonb_build_object(
    'room_id', v_room.id, 'code', v_room.code,
    'host_key', v_room.host_key, 'total_rounds', v_total);
end $$;

-- ============ join_room ============
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
begin
  select * into v_room from rooms where code = upper(p_code);
  if not found then raise exception 'room not found'; end if;
  if v_room.status <> 'lobby' then raise exception 'game already started'; end if;
  if p_host_key is not null then
    if p_host_key <> v_room.host_key then raise exception 'invalid host key'; end if;
    v_is_host := true;
  end if;
  if length(v_nick) < 1 or length(v_nick) > 20 then
    raise exception 'nickname must be 1-20 characters';
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
    'player_key', v_player.player_key, 'player', player_public(v_player));
end $$;

-- ============ get_room_state ============
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
      'ends_at', v_room.phase_ends_at, 'server_now', now()),
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

-- ============ start_game ============
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

  update rooms set status = 'playing', phase = 'countdown', current_round = 1,
    phase_ends_at = now() + interval '3 seconds'
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- ============ advance_phase ============
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
    when 'read'   then now() + interval '3 seconds'
    when 'answer' then now() + make_interval(secs => v_room.timer_seconds)
    when 'reveal' then now() + interval '5 seconds'
    when 'track'  then now() + interval '4 seconds'
    else null
  end;

  update rooms set phase = v_phase, current_round = v_round,
    status = v_status, phase_ends_at = v_ends
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- ============ submit_answer ============
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
  if v_room.phase <> 'answer' or v_room.current_round <> p_round then
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

grant execute on all functions in schema public to anon, authenticated;
