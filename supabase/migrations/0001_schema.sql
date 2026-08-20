create extension if not exists pgcrypto;

create table questions (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  tier int not null check (tier between 1 and 4),
  prompt text not null,
  options jsonb not null,                -- array of exactly 4 strings
  correct_index int not null check (correct_index between 0 and 3),
  fun_fact text
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_key uuid not null default gen_random_uuid(),
  status text not null default 'lobby' check (status in ('lobby','playing','finished')),
  phase text not null default 'lobby'
    check (phase in ('lobby','countdown','read','answer','reveal','track','results')),
  current_round int not null default 0,  -- 1-based while playing
  total_rounds int not null default 0,
  timer_seconds int not null default 10 check (timer_seconds between 5 and 20),
  phase_ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  player_key uuid not null default gen_random_uuid(),
  nickname text not null,
  avatar text not null,
  color text not null,
  is_host boolean not null default false,
  is_playing boolean not null default true,
  joined_at timestamptz not null default now(),
  unique (room_id, nickname)
);

create table room_questions (
  room_id uuid not null references rooms(id) on delete cascade,
  round int not null,
  question_id uuid not null references questions(id),
  primary key (room_id, round)
);

create table answers (
  room_id uuid not null references rooms(id) on delete cascade,
  round int not null,
  player_id uuid not null references players(id) on delete cascade,
  choice_index int not null check (choice_index between 0 and 3),
  is_correct boolean not null,
  time_remaining_ms int not null,
  speed_points int not null,
  answered_at timestamptz not null default now(),
  primary key (room_id, round, player_id)
);

-- Lock everything down: no direct client access. All access via SECURITY DEFINER RPCs.
alter table questions enable row level security;
alter table rooms enable row level security;
alter table players enable row level security;
alter table room_questions enable row level security;
alter table answers enable row level security;

create index idx_questions_cat_tier on questions (category, tier);
create index idx_players_room on players (room_id);
create index idx_answers_room_round on answers (room_id, round);
