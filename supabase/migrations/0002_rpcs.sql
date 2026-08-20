-- ============ temporary stubs (Task 5 replaces these with real implementations) ============
create or replace function question_public(p_room_id uuid, p_round int) returns jsonb
language sql as $$ select null::jsonb $$;
create or replace function build_reveal(p_room_id uuid, p_round int) returns jsonb
language sql as $$ select null::jsonb $$;
create or replace function standings(p_room_id uuid) returns jsonb
language sql as $$ select '[]'::jsonb $$;

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
      then standings(v_room.id) else null end);
end $$;

grant execute on all functions in schema public to anon, authenticated;
