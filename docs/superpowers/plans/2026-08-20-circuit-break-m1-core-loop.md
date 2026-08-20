# Circuit Break — M1 Core Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the playable core of Circuit Break — create/join room, lobby, synchronized question rounds with server-validated answers, a basic animated track, correct-count ranking with speed/streak tiebreaks, and a results screen — deployed on Vercel + Supabase free tiers.

**Architecture:** Next.js (App Router) client app with **no custom server**. Supabase Postgres is the source of truth; all writes go through SECURITY DEFINER RPCs (tables are RLS-locked to deny direct access, so clients can never read a question's `correct_index` before the reveal). The **host's browser drives the phase state machine**: it calls `advance_phase` on a timer and broadcasts the returned phase event over a Supabase Realtime channel; every client renders from those events, syncing countdowns against server timestamps.

**Tech Stack:** Next.js 15 (App Router, TypeScript, Tailwind), @supabase/supabase-js, Zustand, Vitest. Supabase CLI + Docker for local dev.

**Spec:** `docs/PRD.md` (this plan implements Build Phase **M1** from §12; M2/M3 get separate plans).

## Global Constraints

- TypeScript `strict` mode; no `any` in committed code.
- All Postgres tables have RLS **enabled with zero policies** — every client interaction goes through SECURITY DEFINER functions (PRD §9 "Answer integrity").
- Clients must never receive `correct_index` or `fun_fact` before the REVEAL phase.
- Ranking is strictly lexicographic: correct answers → speed points → longest streak (PRD §3 Fairness Law). Speed points formula: `floor(timeRemainingMs / timerMs * 100) * tier` (tier = 1..4).
- Phase durations (ms): COUNTDOWN 3000, READ 3000, ANSWER `timer_seconds * 1000` (host-set, 5–20s, default 10), REVEAL 5000, TRACK 4000.
- Answer submission grace window: 300ms past `phase_ends_at`.
- Room codes: 5 uppercase letters from `ABCDEFGHJKMNPQRSTUVWXYZ` (no I, L, O).
- Nicknames: 1–20 chars, unique per room.
- Game startable only with ≥ 2 playing players.
- M1 simplifications (deliberate, per PRD §12): join only during lobby (late-join spectators are M3); placeholder-level styling (visual direction is M2); no custom questions, no stage view, no sudden death, no rematch (M3).
- Prerequisites on the dev machine: Node 20+, Docker Desktop running (for `supabase start`), Git.

## File Structure

```
quiz-game/
  app/
    layout.tsx, globals.css          # scaffold (Task 1)
    page.tsx                         # landing: create / join      (Task 8)
    host/new/page.tsx                # host setup wizard           (Task 8)
    room/[code]/page.tsx             # lobby + game + results shell (Task 9-12)
  components/
    JoinGate.tsx                     # nickname/avatar picker for joiners (Task 8)
    LobbyView.tsx                    # starting grid + start button (Task 9)
    GameView.tsx                     # phase router within a round  (Task 10)
    TimerRing.tsx, QuestionCard.tsx, AnswerButtons.tsx, RevealPanel.tsx (Task 10)
    Track.tsx                        # segment track + avatars      (Task 11)
    ResultsView.tsx                  # final ranking + winner       (Task 12)
  lib/
    types.ts, avatars.ts             # shared types + avatar roster (Task 6)
    supabaseClient.ts                # browser client               (Task 6)
    serverTime.ts                    # server clock offset          (Task 6)
    rank.ts                          # speedPoints + estimateDuration (Task 6)
    session.ts                       # localStorage keys per room   (Task 6)
    store.ts                         # Zustand game store           (Task 7)
    useRoomChannel.ts                # realtime subscription hook   (Task 7)
    useHostDriver.ts                 # host phase-machine driver    (Task 7)
  supabase/
    migrations/0001_schema.sql       # tables + RLS                 (Task 2)
    migrations/0002_rpcs.sql         # all game RPCs                (Task 4-5)
    seed.sql                         # 48-question starter bank     (Task 3)
  scripts/smoke.mjs                  # end-to-end game simulation against local Supabase (Task 5)
  tests/rank.test.ts, tests/store.test.ts, tests/serverTime.test.ts
```

---

### Task 1: Project scaffold

**Files:**
- Create: Next.js app at repo root, `vitest.config.ts`, `.env.local`, Supabase project scaffolding (`supabase/config.toml`)

**Interfaces:**
- Produces: a running `npm run dev` Next.js app, `npm test` (vitest), and a local Supabase stack whose URL/anon key live in `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

- [ ] **Step 1: Init git**

```bash
cd "E:/DevStuff/AI Stuff/Web/quiz-game"
git init -b main
git add docs && git commit -m "docs: PRD and source concepts"
```

- [ ] **Step 2: Scaffold Next.js** (create-next-app refuses a non-empty dir, so scaffold in a temp dir and move up)

```bash
npx --yes create-next-app@latest tmp-app --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --turbopack
```

Then move everything from `tmp-app` (including dotfiles) into the repo root and delete `tmp-app`. PowerShell:

```powershell
Get-ChildItem tmp-app -Force | Move-Item -Destination .
Remove-Item tmp-app
```

(If `.gitignore` already exists at root, merge contents instead of overwriting. Ensure `.env*` is ignored — create-next-app's default gitignore covers it.)

- [ ] **Step 3: Install runtime + dev deps**

```bash
npm i @supabase/supabase-js zustand
npm i -D vitest
```

- [ ] **Step 4: Add vitest config and script**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: { include: ['tests/**/*.test.ts'] },
});
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 5: Init and start local Supabase** (Docker Desktop must be running)

```bash
npx --yes supabase init
npx supabase start
```

Copy `API URL` and `anon key` from the output into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
```

- [ ] **Step 6: Verify**

Run: `npm run dev` → open http://localhost:3000, expect the Next.js starter page. Run: `npm test` → expect "no test files found" exit 0 (or add `--passWithNoTests` to the script).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + vitest + supabase local stack"
```

---

### Task 2: Database schema

**Files:**
- Create: `supabase/migrations/0001_schema.sql`

**Interfaces:**
- Produces: tables `questions`, `rooms`, `players`, `room_questions`, `answers` — all RLS-enabled with no policies. Column shapes below are relied on by every RPC in Tasks 4–5.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0001_schema.sql`:

```sql
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
```

- [ ] **Step 2: Apply and verify**

Run: `npx supabase db reset`
Expected: migration applies without error. Then verify RLS blocks anon reads:

```bash
npx supabase status   # note API URL + anon key
```

```bash
curl -s "http://127.0.0.1:54321/rest/v1/questions?select=*" -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
```

Expected: `[]` (RLS filters everything out — no rows leak).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_schema.sql
git commit -m "feat(db): schema for rooms, players, questions, answers with RLS lockdown"
```

---

### Task 3: Seed question bank (48 questions)

**Files:**
- Create: `supabase/seed.sql`

**Interfaces:**
- Produces: 48 rows in `questions` — 6 categories × 4 tiers × 2 each. Category keys (used by the wizard UI in Task 8): `screen-break`, `ai-tech`, `corporate`, `rewind`, `online`, `fuel`.

- [ ] **Step 1: Write the seed**

`supabase/seed.sql` (options is a JSON array; `correct_index` is 0-based):

```sql
insert into questions (category, tier, prompt, options, correct_index, fun_fact) values
-- 🎬 Screen Break
('screen-break',1,'Which movie features the line "I''ll be back"?','["The Terminator","RoboCop","Die Hard","Predator"]',0,'Schwarzenegger lobbied to say "I will be back" — he thought the contraction sounded weak.'),
('screen-break',1,'In Finding Nemo, what kind of fish is Dory?','["Blue tang","Clownfish","Angelfish","Pufferfish"]',0,'After the film, demand for blue tangs spiked so hard that marine biologists issued warnings.'),
('screen-break',2,'Which series is set at the Dunder Mifflin Paper Company?','["The Office","Parks and Recreation","30 Rock","Brooklyn Nine-Nine"]',0,'The US version was adapted from a UK original that ran only 14 episodes.'),
('screen-break',2,'Who directed both Inception and Oppenheimer?','["Christopher Nolan","Denis Villeneuve","Ridley Scott","James Cameron"]',0,'Nolan famously avoids using a smartphone or email.'),
('screen-break',3,'Which show''s 1983 finale drew over 105 million US viewers?','["M*A*S*H","Cheers","Seinfeld","Dallas"]',0,'It held the record for most-watched broadcast until the 2010 Super Bowl.'),
('screen-break',3,'What is the highest-grossing film of all time (unadjusted)?','["Avatar","Avengers: Endgame","Titanic","Star Wars: The Force Awakens"]',0,'Avatar lost the crown to Endgame in 2019, then re-releases in China put it back on top.'),
('screen-break',4,'Which 1927 film won the first Academy Award for Best Picture?','["Wings","Sunrise","Metropolis","The Jazz Singer"]',0,'Wings is the only fully silent film ever to win Best Picture.'),
('screen-break',4,'In The Matrix, how is Neo first told to "follow the white rabbit"?','["A message on his computer","A phone call","A dream","Graffiti on a wall"]',0,'Seconds later, a rabbit tattoo appears at his door — the film''s first big reality glitch.'),
-- 🤖 AI & Tech
('ai-tech',1,'What does "www" stand for in a web address?','["World Wide Web","World Web Window","Wide World Web","Web World Wide"]',0,'Its inventor Tim Berners-Lee later said the double-u name was a mistake — nine syllables for three letters.'),
('ai-tech',1,'What does "AI" stand for?','["Artificial Intelligence","Automated Intelligence","Advanced Interface","Applied Computation"]',0,'The term was coined for a 1956 workshop at Dartmouth College.'),
('ai-tech',2,'Which company created ChatGPT?','["OpenAI","Google","Meta","Anthropic"]',0,'Anthropic — maker of Claude — was founded by former OpenAI researchers.'),
('ai-tech',2,'In which decade was the first email sent?','["1970s","1960s","1980s","1990s"]',0,'Ray Tomlinson sent it in 1971 and picked the @ sign to separate user from machine.'),
('ai-tech',3,'What was Google originally called?','["BackRub","PageFinder","SearchPlus","Googol"]',0,'The name referred to the "back links" the engine analyzed. It lasted about a year.'),
('ai-tech',3,'Which AI defeated Go world champion Lee Sedol in 2016?','["AlphaGo","Deep Blue","Watson","Stockfish"]',0,'Move 37 in game two was so unusual that commentators initially assumed it was a mistake.'),
('ai-tech',4,'The first computer "bug" was literally what, found in the Harvard Mark II?','["A moth","A beetle","A fly","A cockroach"]',0,'The 1947 moth was taped into the logbook with the note "first actual case of bug being found".'),
('ai-tech',4,'What was the first item ever sold on eBay?','["A broken laser pointer","A Beanie Baby","A guitar","A wristwatch"]',0,'The founder emailed the buyer to check it was intentional — he collected broken laser pointers.'),
-- 💼 Corporate Survival
('corporate',1,'When a colleague says "let''s circle back", they want to…','["Return to the topic later","Cancel the project","Book a bigger room","Go around the building"]',0,'"Circle back" consistently tops surveys of most-hated office jargon.'),
('corporate',1,'What does "OOO" mean in an auto-reply?','["Out of office","Out of orbit","Only on occasion","Office open online"]',0,'The triple-O auto-reply dates back to Microsoft Exchange in the 1990s.'),
('corporate',2,'What does "EOD" usually mean in work chat?','["End of day","End of discussion","Every other day","Executive on duty"]',0,'Pro tip: whose timezone is "end of day"? Nobody has ever agreed.'),
('corporate',2,'"Low-hanging fruit" refers to…','["Easy wins","Kitchen snacks","Junior employees","Cheap suppliers"]',0,'Orchard workers actually pick low fruit last — it bruises less in the basket.'),
('corporate',3,'What does KPI stand for?','["Key Performance Indicator","Key Process Improvement","Known Productivity Index","Key Personnel Initiative"]',0,'The concept traces back to 1950s French "tableau de bord" management dashboards.'),
('corporate',3,'Which company popularized "20% time" for side projects?','["Google","Microsoft","Apple","IBM"]',0,'Gmail and AdSense both started as 20% projects.'),
('corporate',4,'The QWERTY layout was originally designed partly to…','["Reduce typewriter jams","Speed up typing","Alphabetize keys","Fit smaller desks"]',0,'It spaced out common letter pairs so mechanical arms wouldn''t collide.'),
('corporate',4,'In which decade did the first office cubicle debut?','["1960s","1950s","1970s","1980s"]',0,'Designer Robert Propst called later cramped versions "monolithic insanity" and regretted the invention.'),
-- 📼 Rewind
('rewind',1,'Which 90s virtual pet died if you didn''t feed it?','["Tamagotchi","Furby","Pikachu","Beanie Baby"]',0,'Over 82 million Tamagotchis have been sold; some schools banned them for causing "funerals".'),
('rewind',1,'Finish the title: The Fresh Prince of ___','["Bel-Air","Beverly Hills","Brooklyn","Burbank"]',0,'Will Smith took the role partly to pay off a massive tax bill.'),
('rewind',2,'Which falling-block game came bundled with the original Game Boy?','["Tetris","Snake","Pac-Man","Breakout"]',0,'Bundling Tetris instead of Mario is credited with selling the Game Boy to adults.'),
('rewind',2,'What was Microsoft''s animated paperclip assistant called?','["Clippy","Binky","Pixel","Wordy"]',0,'His official name was Clippit. Almost nobody has ever used it.'),
('rewind',3,'In which year did Google launch?','["1998","1996","2000","2002"]',0,'It started in a rented garage that Google later bought for nostalgia.'),
('rewind',3,'Which group sang "I Want It That Way" (1999)?','["Backstreet Boys","NSYNC","Boyz II Men","Westlife"]',0,'The songwriters barely spoke English — which is why the lyrics famously make no sense.'),
('rewind',4,'What was the best-selling single of the 1990s worldwide?','["Candle in the Wind 1997","...Baby One More Time","My Heart Will Go On","Wannabe"]',0,'Elton John''s Diana tribute sold 33 million copies; he has never performed it again.'),
('rewind',4,'What did the first-ever SMS text message (1992) say?','["Merry Christmas","Hello","Test","Happy New Year"]',0,'Engineer Neil Papworth sent it from a computer — phones couldn''t type text yet.'),
-- 🐸 Extremely Online
('online',1,'What breed of dog is the "Doge" meme?','["Shiba Inu","Corgi","Akita","Pomeranian"]',0,'The real dog, Kabosu, was a rescue from a Japanese puppy mill.'),
('online',1,'What does "LOL" stand for?','["Laughing out loud","Lots of love","Log off later","Loudly on line"]',0,'Countless parents have signed condolence texts "LOL" thinking it meant lots of love.'),
('online',2,'The "Distracted Boyfriend" meme is originally what?','["A stock photo","A movie still","A music video frame","A news photo"]',0,'The same models appear in dozens of stock photos, forming an accidental cinematic universe.'),
('online',2,'Which platform''s logo was a bird until 2023?','["Twitter","Snapchat","Telegram","Tumblr"]',0,'The bird''s official name was Larry, after basketball legend Larry Bird.'),
('online',3,'What was the first YouTube video about?','["Elephants at the zoo","A cat playing piano","A dance tutorial","A video game"]',0,'"Me at the zoo" (2005) is 19 seconds long and still up.'),
('online',3,'Who coined the word "meme" in 1976?','["Richard Dawkins","Douglas Adams","Carl Sagan","Marshall McLuhan"]',0,'He meant it as the cultural equivalent of a gene — cat pictures came later.'),
('online',4,'As of 2020, the most-retweeted post ever was…','["A Japanese billionaire''s cash giveaway","Ellen''s Oscar selfie","A plea for chicken nuggets","An Obama quote"]',0,'Yusaku Maezawa offered ¥100m to random retweeters — 4+ million obliged.'),
('online',4,'Keyboard Cat''s original footage was recorded in which decade?','["1980s","1990s","2000s","2010s"]',0,'Charlie Schmidt filmed his cat Fatso in 1984; the internet found it 23 years later.'),
-- ☕ Fuel
('fuel',1,'Espresso was invented in which country?','["Italy","France","Spain","Brazil"]',0,'The word means "pressed out" — not "express", though it is faster.'),
('fuel',1,'Sushi is traditionally wrapped in…','["Seaweed (nori)","Rice paper","Lettuce","Banana leaf"]',0,'Nori was once scraped off dock posts; now it''s farmed on huge ocean nets.'),
('fuel',2,'Which coffee chain is named after a Moby-Dick character?','["Starbucks","Costa","Peet''s","Lavazza"]',0,'The founders almost named it Pequod, after the ship. "Starbuck" was the first mate.'),
('fuel',2,'Croissants originated in which country?','["Austria","France","Belgium","Switzerland"]',0,'The Viennese kipferl came first; France laminated it with butter and took the credit.'),
('fuel',3,'After water, the most-consumed drink in the world is…','["Tea","Coffee","Beer","Orange juice"]',0,'Roughly 2 billion cups of tea are drunk every day.'),
('fuel',3,'Nutella''s main nut is the…','["Hazelnut","Almond","Peanut","Cashew"]',0,'Nutella uses about a quarter of the world''s hazelnut supply.'),
('fuel',4,'Which country drinks the most coffee per capita?','["Finland","USA","Italy","Brazil"]',0,'Finns average 8–12 kg of coffee per person per year; coffee breaks are protected in many union contracts.'),
('fuel',4,'Carrots were originally mostly what color?','["Purple","Orange","White","Red"]',0,'Dutch growers bred orange carrots in the 1600s, allegedly honoring William of Orange.');
```

- [ ] **Step 2: Apply and verify**

Run: `npx supabase db reset` (applies migrations then seed).
Verify counts via psql:

```bash
npx supabase db psql -c "select category, tier, count(*) from questions group by 1,2 order by 1,2;"
```

Expected: 24 rows, each with count = 2. (If `db psql` is unavailable in your CLI version, use `docker exec -it supabase_db_quiz-game psql -U postgres -c "..."`.)

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(db): seed 48-question starter bank across 6 categories"
```

---

### Task 4: RPCs — room lifecycle (create, join, state)

**Files:**
- Create: `supabase/migrations/0002_rpcs.sql` (this task writes the first half; Task 5 appends the game-flow half to the same file before it is ever deployed remotely)
- Create: `scripts/smoke.mjs` (lobby portion)

**Interfaces:**
- Produces RPCs (all `security definer`, callable by `anon`):
  - `create_room(p_timer_seconds int, p_categories text[], p_tier_counts int[]) → {room_id, code, host_key, total_rounds}`
  - `join_room(p_code text, p_nickname text, p_avatar text, p_color text, p_host_key uuid default null, p_is_playing boolean default true) → {room_id, player_id, player_key, player}` where `player` is the public player object `{id, nickname, avatar, color, is_host, is_playing}`
  - `get_room_state(p_code text) → {room, players, question, reveal, standings}` (question/reveal/standings null when not applicable)
  - internal helper `gen_room_code() → text`

- [ ] **Step 1: Write the failing smoke test (lobby portion)**

`scripts/smoke.mjs`:

```js
// End-to-end smoke test against local Supabase. Run: node scripts/smoke.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}
async function rpcFails(name, args, pattern) {
  const { error } = await sb.rpc(name, args);
  assert.ok(error, `${name} should have failed (${pattern})`);
  assert.match(error.message, pattern, `${name} error`);
}

// ---- Lobby lifecycle ----
const room = await rpc('create_room', {
  p_timer_seconds: 5,
  p_categories: ['ai-tech', 'fuel'],
  p_tier_counts: [2, 1, 0, 0],
});
assert.match(room.code, /^[A-HJ-KM-NP-Z]{5}$/, 'room code format');
assert.equal(room.total_rounds, 3);

const host = await rpc('join_room', {
  p_code: room.code, p_nickname: 'Ada', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: room.host_key,
});
assert.equal(host.player.is_host, true);

const p2 = await rpc('join_room', {
  p_code: room.code.toLowerCase(), p_nickname: 'Grace', p_avatar: 'duck', p_color: '#38bdf8',
});
assert.equal(p2.player.is_host, false);

await rpcFails('join_room',
  { p_code: room.code, p_nickname: 'Ada', p_avatar: 'cat', p_color: '#fff' },
  /nickname taken/i);
await rpcFails('join_room',
  { p_code: 'ZZZZZ', p_nickname: 'X', p_avatar: 'cat', p_color: '#fff' },
  /room not found/i);
await rpcFails('create_room',
  { p_timer_seconds: 5, p_categories: ['fuel'], p_tier_counts: [50, 0, 0, 0] },
  /not enough questions/i);

let state = await rpc('get_room_state', { p_code: room.code });
assert.equal(state.room.status, 'lobby');
assert.equal(state.players.length, 2);
assert.equal(state.question, null);
assert.ok(state.room.server_now, 'server_now present');

console.log('✅ lobby smoke passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/smoke.mjs`
Expected: FAIL with `create_room: Could not find the function` (RPCs don't exist yet).

- [ ] **Step 3: Write the RPCs**

`supabase/migrations/0002_rpcs.sql` (first half):

```sql
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
```

Note: `get_room_state` references `question_public`, `build_reveal`, and `standings`, which Task 5 defines **in the same migration file above `get_room_state`**. For this task's smoke run, add temporary stubs at the top of the file so the migration applies (Task 5 replaces them):

```sql
create or replace function question_public(p_room_id uuid, p_round int) returns jsonb
language sql as $$ select null::jsonb $$;
create or replace function build_reveal(p_room_id uuid, p_round int) returns jsonb
language sql as $$ select null::jsonb $$;
create or replace function standings(p_room_id uuid) returns jsonb
language sql as $$ select '[]'::jsonb $$;
```

- [ ] **Step 4: Apply and run smoke**

Run: `npx supabase db reset && node scripts/smoke.mjs`
Expected: `✅ lobby smoke passed`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_rpcs.sql scripts/smoke.mjs
git commit -m "feat(db): room lifecycle RPCs (create, join, state) + lobby smoke test"
```

---

### Task 5: RPCs — game flow (start, advance, answer, standings, reveal)

**Files:**
- Modify: `supabase/migrations/0002_rpcs.sql` (replace stubs, add game-flow functions)
- Modify: `scripts/smoke.mjs` (append full game simulation)

**Interfaces:**
- Produces RPCs:
  - `start_game(p_room_id uuid, p_host_key uuid) → PhaseEvent`
  - `advance_phase(p_room_id uuid, p_host_key uuid) → PhaseEvent`
  - `submit_answer(p_room_id uuid, p_player_key uuid, p_round int, p_choice_index int) → {locked: true}`
- **PhaseEvent** (the JSON contract the whole frontend renders from; broadcast verbatim by the host):
  `{ phase, round, ends_at, server_now, payload }` where payload is:
  - `read`/`answer` → `{category, tier, prompt, options}` (a QuestionPublic)
  - `reveal` → `{correct_index, fun_fact, counts: number[4], fastest: {player_id, nickname, time_remaining_ms} | null, standings: Standing[]}`
  - `track` / `results` → `Standing[]`
  - `countdown` → `null`
  - Standing = `{player_id, nickname, avatar, color, correct, speed_points, longest_streak}` — array pre-sorted by the Fairness Law.

- [ ] **Step 1: Append the failing game-flow smoke test**

Append to `scripts/smoke.mjs`:

```js
// ---- Game flow ----
// Room with a known 1-question draw so we can force correctness deterministically:
// seed has exactly 2 tier-1 'fuel' questions; draw both -> 2 rounds.
const g = await rpc('create_room', {
  p_timer_seconds: 5, p_categories: ['fuel'], p_tier_counts: [2, 0, 0, 0],
});
const h = await rpc('join_room', { p_code: g.code, p_nickname: 'Host', p_avatar: 'robot', p_color: '#f59e0b', p_host_key: g.host_key });
const a = await rpc('join_room', { p_code: g.code, p_nickname: 'Alice', p_avatar: 'duck', p_color: '#38bdf8' });

await rpcFails('start_game', { p_room_id: g.room_id, p_host_key: h.player_key }, /invalid host key/i);

let evt = await rpc('start_game', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'countdown');
assert.equal(evt.round, 1);

evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'read');
assert.ok(evt.payload.prompt, 'read payload has prompt');
assert.equal(evt.payload.options.length, 4);
assert.equal(evt.payload.correct_index, undefined, 'correct answer must not leak');

// Answering during READ must fail
await rpcFails('submit_answer',
  { p_room_id: g.room_id, p_player_key: h.player_key, p_round: 1, p_choice_index: 0 },
  /not accepting answers/i);

evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'answer');

// Both tier-1 fuel questions have correct_index 0 in the seed.
await rpc('submit_answer', { p_room_id: g.room_id, p_player_key: h.player_key, p_round: 1, p_choice_index: 0 }); // Host correct
await rpc('submit_answer', { p_room_id: g.room_id, p_player_key: a.player_key, p_round: 1, p_choice_index: 1 }); // Alice wrong
await rpcFails('submit_answer',
  { p_room_id: g.room_id, p_player_key: a.player_key, p_round: 1, p_choice_index: 0 },
  /already answered/i);

evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'reveal');
assert.equal(evt.payload.correct_index, 0);
assert.deepEqual(evt.payload.counts, [1, 1, 0, 0]);
assert.equal(evt.payload.fastest.nickname, 'Host');
assert.ok(evt.payload.fun_fact !== undefined);

evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'track');
assert.equal(evt.payload[0].nickname, 'Host');
assert.equal(evt.payload[0].correct, 1);
assert.ok(evt.payload[0].speed_points > 0);
assert.equal(evt.payload[1].correct, 0);

// Round 2: both answer correctly; Alice answers "faster" is not controllable here,
// so just verify Host wins on correct count 2 vs 1... both would be 2/1? Host 2, Alice 1.
evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'read');
assert.equal(evt.round, 2);
evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'answer');
await rpc('submit_answer', { p_room_id: g.room_id, p_player_key: h.player_key, p_round: 2, p_choice_index: 0 });
await rpc('submit_answer', { p_room_id: g.room_id, p_player_key: a.player_key, p_round: 2, p_choice_index: 0 });
evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key }); // reveal
evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key }); // track
evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key }); // results (last round)
assert.equal(evt.phase, 'results');
assert.equal(evt.payload[0].nickname, 'Host');
assert.equal(evt.payload[0].correct, 2);
assert.equal(evt.payload[0].longest_streak, 2);
assert.equal(evt.payload[1].correct, 1);
assert.equal(evt.payload[1].longest_streak, 1);

await rpcFails('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key }, /finished/i);

// Joining a started game must fail
await rpcFails('join_room', { p_code: g.code, p_nickname: 'Late', p_avatar: 'cat', p_color: '#fff' }, /already started/i);

console.log('✅ game-flow smoke passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/smoke.mjs`
Expected: lobby part passes, then FAIL at `start_game: Could not find the function`.

- [ ] **Step 3: Implement the game-flow functions**

In `supabase/migrations/0002_rpcs.sql`, **replace the three stubs** with real implementations (keep them positioned above `get_room_state`), and append `start_game`, `advance_phase`, `submit_answer`:

```sql
-- ============ question_public (replaces stub) ============
create or replace function question_public(p_room_id uuid, p_round int) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'category', q.category, 'tier', q.tier,
    'prompt', q.prompt, 'options', q.options)
  from room_questions rq join questions q on q.id = rq.question_id
  where rq.room_id = p_room_id and rq.round = p_round;
$$;

-- ============ longest_streak ============
create or replace function longest_streak(p_room_id uuid, p_player_id uuid) returns int
language plpgsql stable as $$
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
    where rq.room_id = p_room_id
    order by rq.round
  loop
    if r.ok then cur := cur + 1; best := greatest(best, cur);
    else cur := 0;
    end if;
  end loop;
  return best;
end $$;

-- ============ standings (replaces stub) ============
-- Sorted by the Fairness Law: correct desc → speed_points desc → longest_streak desc
create or replace function standings(p_room_id uuid) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(row order by row->'correct' desc, row->'speed_points' desc, row->'longest_streak' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'player_id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'color', p.color,
      'correct', count(a.*) filter (where a.is_correct),
      'speed_points', coalesce(sum(a.speed_points) filter (where a.is_correct), 0),
      'longest_streak', longest_streak(p_room_id, p.id)
    ) as row
    from players p
    left join answers a on a.player_id = p.id and a.room_id = p_room_id
    where p.room_id = p_room_id and p.is_playing
    group by p.id
  ) s;
$$;

-- ============ build_reveal (replaces stub) ============
create or replace function build_reveal(p_room_id uuid, p_round int) returns jsonb
language sql stable as $$
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
    'standings', standings(p_room_id))
  from room_questions rq join questions q on q.id = rq.question_id
  where rq.room_id = p_room_id and rq.round = p_round;
$$;

-- ============ phase_event helper ============
create or replace function phase_event(v_room rooms) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'phase', v_room.phase,
    'round', v_room.current_round,
    'ends_at', v_room.phase_ends_at,
    'server_now', now(),
    'payload', case v_room.phase
      when 'read'    then question_public(v_room.id, v_room.current_round)
      when 'answer'  then question_public(v_room.id, v_room.current_round)
      when 'reveal'  then build_reveal(v_room.id, v_room.current_round)
      when 'track'   then standings(v_room.id)
      when 'results' then standings(v_room.id)
      else null
    end);
$$;

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
  select * into v_room from rooms where id = p_room_id;
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
```

(The final `grant` line appears once, at the end of the file — remove the earlier duplicate from Task 4.)

- [ ] **Step 4: Apply and run the full smoke**

Run: `npx supabase db reset && node scripts/smoke.mjs`
Expected: `✅ lobby smoke passed` then `✅ game-flow smoke passed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_rpcs.sql scripts/smoke.mjs
git commit -m "feat(db): game-flow RPCs with server-validated answers and Fairness Law standings"
```

---

### Task 6: Client foundation — types, supabase client, server time, ranking utils

**Files:**
- Create: `lib/types.ts`, `lib/avatars.ts`, `lib/supabaseClient.ts`, `lib/serverTime.ts`, `lib/rank.ts`, `lib/session.ts`
- Test: `tests/rank.test.ts`, `tests/serverTime.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 7–12):

```ts
// lib/types.ts — mirrors the PhaseEvent contract from Task 5 exactly
export type Phase = 'lobby'|'countdown'|'read'|'answer'|'reveal'|'track'|'results';
export type Tier = 1|2|3|4;
export interface PlayerPublic { id: string; nickname: string; avatar: string; color: string; is_host: boolean; is_playing: boolean; }
export interface QuestionPublic { category: string; tier: Tier; prompt: string; options: string[]; }
export interface Standing { player_id: string; nickname: string; avatar: string; color: string; correct: number; speed_points: number; longest_streak: number; }
export interface RevealPayload { correct_index: number; fun_fact: string|null; counts: number[]; fastest: { player_id: string; nickname: string; time_remaining_ms: number }|null; standings: Standing[]; }
export interface PhaseEvent { phase: Phase; round: number; ends_at: string|null; server_now: string; payload: QuestionPublic|RevealPayload|Standing[]|null; }
export interface RoomInfo { id: string; code: string; status: 'lobby'|'playing'|'finished'; phase: Phase; round: number; total_rounds: number; timer_seconds: number; ends_at: string|null; server_now: string; }
export interface RoomState { room: RoomInfo; players: PlayerPublic[]; question: QuestionPublic|null; reveal: RevealPayload|null; standings: Standing[]|null; }
```

```ts
// lib/rank.ts
export function speedPoints(timeRemainingMs: number, timerMs: number, tier: Tier): number;
export function estimateDurationSeconds(totalQuestions: number, timerSeconds: number): number;
export const TIER_NAMES: Record<Tier, string>; // 1 Warm-Up · 2 Double Shot · 3 Crunch Time · 4 Final Boss
export const CATEGORIES: { key: string; label: string; emoji: string }[]; // 6 seed categories
```

```ts
// lib/serverTime.ts
export function noteServerTime(serverNowIso: string): void; // records offset vs Date.now()
export function serverNow(): number;                        // epoch ms in server clock
export function msUntil(endsAtIso: string | null): number;  // clamped >= 0
```

```ts
// lib/session.ts — per-room identity in localStorage under key `cb:<CODE>`
export interface RoomSession { roomId: string; playerId: string; playerKey: string; hostKey?: string; }
export function saveSession(code: string, s: RoomSession): void;
export function loadSession(code: string): RoomSession | null;
```

```ts
// lib/avatars.ts
export const AVATARS: { key: string; emoji: string; label: string }[]; // 12 entries
export const COLORS: string[];                                          // 8 hex accents
export function avatarEmoji(key: string): string;
```

- [ ] **Step 1: Write failing tests**

`tests/rank.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { speedPoints, estimateDurationSeconds } from '@/lib/rank';

describe('speedPoints', () => {
  it('matches SQL formula floor(remaining/total*100)*tier', () => {
    expect(speedPoints(5000, 10000, 1)).toBe(50);
    expect(speedPoints(5000, 10000, 4)).toBe(200);
    expect(speedPoints(9999, 10000, 2)).toBe(198); // floor(99.99) = 99
    expect(speedPoints(0, 10000, 3)).toBe(0);
  });
});

describe('estimateDurationSeconds', () => {
  it('sums countdown + per-round read/answer/reveal/track', () => {
    // 3s countdown + N * (3 read + timer + 5 reveal + 4 track)
    expect(estimateDurationSeconds(12, 10)).toBe(3 + 12 * (3 + 10 + 5 + 4));
  });
});
```

`tests/serverTime.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { noteServerTime, serverNow, msUntil } from '@/lib/serverTime';

describe('serverTime', () => {
  it('tracks offset from noted server timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    noteServerTime('2026-01-01T00:00:02.000Z'); // server 2s ahead
    expect(serverNow()).toBe(new Date('2026-01-01T00:00:02.000Z').getTime());
    expect(msUntil('2026-01-01T00:00:05.000Z')).toBe(3000);
    expect(msUntil('2026-01-01T00:00:01.000Z')).toBe(0); // clamped
    expect(msUntil(null)).toBe(0);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`lib/types.ts`: exactly as in the Interfaces block above.

`lib/rank.ts`:

```ts
import type { Tier } from './types';

export function speedPoints(timeRemainingMs: number, timerMs: number, tier: Tier): number {
  return Math.floor((timeRemainingMs / timerMs) * 100) * tier;
}

export function estimateDurationSeconds(totalQuestions: number, timerSeconds: number): number {
  return 3 + totalQuestions * (3 + timerSeconds + 5 + 4);
}

export const TIER_NAMES: Record<Tier, string> = {
  1: 'Warm-Up', 2: 'Double Shot', 3: 'Crunch Time', 4: 'Final Boss',
};

export const CATEGORIES = [
  { key: 'screen-break', label: 'Screen Break', emoji: '🎬' },
  { key: 'ai-tech', label: 'AI & Tech', emoji: '🤖' },
  { key: 'corporate', label: 'Corporate Survival', emoji: '💼' },
  { key: 'rewind', label: 'Rewind', emoji: '📼' },
  { key: 'online', label: 'Extremely Online', emoji: '🐸' },
  { key: 'fuel', label: 'Fuel', emoji: '☕' },
];
```

`lib/serverTime.ts`:

```ts
let offsetMs = 0;

export function noteServerTime(serverNowIso: string): void {
  offsetMs = new Date(serverNowIso).getTime() - Date.now();
}
export function serverNow(): number {
  return Date.now() + offsetMs;
}
export function msUntil(endsAtIso: string | null): number {
  if (!endsAtIso) return 0;
  return Math.max(0, new Date(endsAtIso).getTime() - serverNow());
}
```

`lib/supabaseClient.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

`lib/session.ts`:

```ts
export interface RoomSession { roomId: string; playerId: string; playerKey: string; hostKey?: string; }

export function saveSession(code: string, s: RoomSession): void {
  localStorage.setItem(`cb:${code.toUpperCase()}`, JSON.stringify(s));
}
export function loadSession(code: string): RoomSession | null {
  const raw = localStorage.getItem(`cb:${code.toUpperCase()}`);
  return raw ? (JSON.parse(raw) as RoomSession) : null;
}
```

`lib/avatars.ts`:

```ts
export const AVATARS = [
  { key: 'coffee', emoji: '☕', label: 'Coffee Cup' },
  { key: 'cactus', emoji: '🌵', label: 'Cactus' },
  { key: 'duck', emoji: '🦆', label: 'Rubber Duck' },
  { key: 'robot', emoji: '🤖', label: 'Robot' },
  { key: 'cat', emoji: '🐱', label: 'Office Cat' },
  { key: 'clip', emoji: '📎', label: 'Paperclip' },
  { key: 'plant', emoji: '🪴', label: 'Desk Plant' },
  { key: 'donut', emoji: '🍩', label: 'Donut' },
  { key: 'bulb', emoji: '💡', label: 'Big Idea' },
  { key: 'headset', emoji: '🎧', label: 'Headset' },
  { key: 'juice', emoji: '🧃', label: 'Juice Box' },
  { key: 'rocket', emoji: '🚀', label: 'Rocket' },
];
export const COLORS = ['#f59e0b','#38bdf8','#a78bfa','#34d399','#fb7185','#facc15','#f97316','#22d3ee'];

export function avatarEmoji(key: string): string {
  return AVATARS.find(a => a.key === key)?.emoji ?? '🙂';
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add lib tests vitest.config.ts
git commit -m "feat(client): shared types, ranking utils, server-time sync, session storage"
```

---

### Task 7: Game store, realtime channel hook, host driver

**Files:**
- Create: `lib/store.ts`, `lib/useRoomChannel.ts`, `lib/useHostDriver.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: types from `lib/types.ts`, `noteServerTime`/`msUntil` from `lib/serverTime.ts`, `supabase` from `lib/supabaseClient.ts`, `loadSession` from `lib/session.ts`.
- Produces:

```ts
// lib/store.ts (zustand)
export interface GameState {
  room: RoomInfo | null;
  players: PlayerPublic[];
  question: QuestionPublic | null;
  reveal: RevealPayload | null;
  standings: Standing[] | null;
  myAnswer: number | null;           // choice index locked this round, or null
  applyState(s: RoomState): void;    // full snapshot (on connect/reconnect)
  applyPhaseEvent(e: PhaseEvent): void;
  addPlayer(p: PlayerPublic): void;  // 'player_joined' broadcast
  setMyAnswer(i: number): void;
}
export const useGameStore: UseBoundStore<StoreApi<GameState>>;
```

```ts
// lib/useRoomChannel.ts
// Subscribes to channel `room:<CODE>`; on 'phase' → applyPhaseEvent, on 'player_joined' → addPlayer.
// On subscribe success, fetches get_room_state and applyState (covers reconnect/refresh).
// Returns the channel so callers can broadcast.
export function useRoomChannel(code: string): RealtimeChannel | null;
```

```ts
// lib/useHostDriver.ts
// Active only when a hostKey exists for this room. Whenever room.phase changes and the
// game is 'playing', schedules a timeout for msUntil(ends_at) then:
//   rpc advance_phase → broadcast {type:'phase'} on the channel → applyPhaseEvent locally.
// Exposes start(): calls start_game, broadcasts, applies.
export function useHostDriver(code: string, channel: RealtimeChannel | null): { start: () => Promise<void>; error: string | null };
```

Broadcast message shapes on channel `room:<CODE>`:
- `{ event: 'phase', payload: PhaseEvent }`
- `{ event: 'player_joined', payload: PlayerPublic }`

- [ ] **Step 1: Write failing store tests**

`tests/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/lib/store';
import type { PhaseEvent, RoomState } from '@/lib/types';

const baseRoom = {
  id: 'r1', code: 'ABCDE', status: 'playing' as const, phase: 'read' as const,
  round: 1, total_rounds: 3, timer_seconds: 10, ends_at: null, server_now: new Date().toISOString(),
};

beforeEach(() => {
  useGameStore.setState({ room: null, players: [], question: null, reveal: null, standings: null, myAnswer: null });
});

describe('applyPhaseEvent', () => {
  it('read event sets question and clears previous reveal + myAnswer', () => {
    useGameStore.setState({ room: { ...baseRoom }, myAnswer: 2, reveal: {} as never });
    const evt: PhaseEvent = {
      phase: 'read', round: 2, ends_at: null, server_now: new Date().toISOString(),
      payload: { category: 'fuel', tier: 1, prompt: 'Q?', options: ['a','b','c','d'] },
    };
    useGameStore.getState().applyPhaseEvent(evt);
    const s = useGameStore.getState();
    expect(s.room?.phase).toBe('read');
    expect(s.room?.round).toBe(2);
    expect(s.question?.prompt).toBe('Q?');
    expect(s.reveal).toBeNull();
    expect(s.myAnswer).toBeNull();
  });

  it('reveal event stores payload and standings', () => {
    useGameStore.setState({ room: { ...baseRoom, phase: 'answer' } });
    const evt: PhaseEvent = {
      phase: 'reveal', round: 1, ends_at: null, server_now: new Date().toISOString(),
      payload: { correct_index: 0, fun_fact: null, counts: [1,0,0,0], fastest: null, standings: [] },
    };
    useGameStore.getState().applyPhaseEvent(evt);
    expect(useGameStore.getState().reveal?.correct_index).toBe(0);
    expect(useGameStore.getState().standings).toEqual([]);
  });

  it('results event marks room finished', () => {
    useGameStore.setState({ room: { ...baseRoom, phase: 'track' } });
    const evt: PhaseEvent = {
      phase: 'results', round: 3, ends_at: null, server_now: new Date().toISOString(), payload: [],
    };
    useGameStore.getState().applyPhaseEvent(evt);
    expect(useGameStore.getState().room?.status).toBe('finished');
  });
});

describe('applyState / addPlayer', () => {
  it('snapshot replaces everything; addPlayer dedupes by id', () => {
    const snap: RoomState = {
      room: { ...baseRoom, status: 'lobby', phase: 'lobby' },
      players: [{ id: 'p1', nickname: 'A', avatar: 'duck', color: '#fff', is_host: true, is_playing: true }],
      question: null, reveal: null, standings: null,
    };
    useGameStore.getState().applyState(snap);
    useGameStore.getState().addPlayer({ id: 'p1', nickname: 'A', avatar: 'duck', color: '#fff', is_host: true, is_playing: true });
    useGameStore.getState().addPlayer({ id: 'p2', nickname: 'B', avatar: 'cat', color: '#000', is_host: false, is_playing: true });
    expect(useGameStore.getState().players.map(p => p.id)).toEqual(['p1', 'p2']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test` → FAIL (`@/lib/store` not found).

- [ ] **Step 3: Implement the store**

`lib/store.ts`:

```ts
import { create } from 'zustand';
import type { GameStateData, PhaseEvent, PlayerPublic, QuestionPublic, RevealPayload, RoomInfo, RoomState, Standing } from './types';
import { noteServerTime } from './serverTime';

export interface GameState {
  room: RoomInfo | null;
  players: PlayerPublic[];
  question: QuestionPublic | null;
  reveal: RevealPayload | null;
  standings: Standing[] | null;
  myAnswer: number | null;
  applyState(s: RoomState): void;
  applyPhaseEvent(e: PhaseEvent): void;
  addPlayer(p: PlayerPublic): void;
  setMyAnswer(i: number): void;
}

export const useGameStore = create<GameState>((set, get) => ({
  room: null, players: [], question: null, reveal: null, standings: null, myAnswer: null,

  applyState(s) {
    noteServerTime(s.room.server_now);
    set({
      room: s.room, players: s.players, question: s.question,
      reveal: s.reveal, standings: s.standings,
    });
  },

  applyPhaseEvent(e) {
    noteServerTime(e.server_now);
    const room = get().room;
    if (!room) return;
    const next: Partial<GameState> = {
      room: {
        ...room, phase: e.phase, round: e.round, ends_at: e.ends_at,
        server_now: e.server_now,
        status: e.phase === 'results' ? 'finished' : 'playing',
      },
    };
    if (e.phase === 'read') {
      next.question = e.payload as QuestionPublic;
      next.reveal = null;
      next.myAnswer = null;
    } else if (e.phase === 'answer') {
      next.question = e.payload as QuestionPublic;
    } else if (e.phase === 'reveal') {
      const r = e.payload as RevealPayload;
      next.reveal = r;
      next.standings = r.standings;
    } else if (e.phase === 'track' || e.phase === 'results') {
      next.standings = e.payload as Standing[];
    }
    set(next);
  },

  addPlayer(p) {
    set(s => (s.players.some(x => x.id === p.id) ? s : { players: [...s.players, p] }));
  },

  setMyAnswer(i) { set({ myAnswer: i }); },
}));
```

(If `GameStateData` is unused, don't import it — keep imports exactly matching usage.)

- [ ] **Step 4: Run tests**

Run: `npm test` → PASS.

- [ ] **Step 5: Implement channel hook and host driver** (verified in browser in Tasks 9–12; no unit tests — they are I/O glue)

`lib/useRoomChannel.ts`:

```ts
'use client';
import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import type { PhaseEvent, PlayerPublic, RoomState } from './types';

export function useRoomChannel(code: string): RealtimeChannel | null {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const applyState = useGameStore(s => s.applyState);
  const applyPhaseEvent = useGameStore(s => s.applyPhaseEvent);
  const addPlayer = useGameStore(s => s.addPlayer);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const ch = supabase.channel(`room:${code.toUpperCase()}`);
    ch.on('broadcast', { event: 'phase' }, ({ payload }) => {
      applyPhaseEvent(payload as PhaseEvent);
    });
    ch.on('broadcast', { event: 'player_joined' }, ({ payload }) => {
      addPlayer(payload as PlayerPublic);
    });
    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        const { data, error } = await supabase.rpc('get_room_state', { p_code: code });
        if (!error && data) applyState(data as RoomState);
        setChannel(ch);
      }
    });
    return () => { supabase.removeChannel(ch); };
  }, [code, applyState, applyPhaseEvent, addPlayer]);

  return channel;
}
```

`lib/useHostDriver.ts`:

```ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import { loadSession } from './session';
import { msUntil } from './serverTime';
import type { PhaseEvent } from './types';

export function useHostDriver(code: string, channel: RealtimeChannel | null) {
  const room = useGameStore(s => s.room);
  const applyPhaseEvent = useGameStore(s => s.applyPhaseEvent);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = typeof window !== 'undefined' ? loadSession(code) : null;
  const hostKey = session?.hostKey ?? null;

  const broadcastAndApply = useCallback((evt: PhaseEvent) => {
    channel?.send({ type: 'broadcast', event: 'phase', payload: evt });
    applyPhaseEvent(evt);
  }, [channel, applyPhaseEvent]);

  const advance = useCallback(async () => {
    if (!hostKey || !room) return;
    const { data, error: err } = await supabase.rpc('advance_phase', {
      p_room_id: room.id, p_host_key: hostKey,
    });
    if (err) { setError(err.message); return; }
    broadcastAndApply(data as PhaseEvent);
  }, [hostKey, room, broadcastAndApply]);

  // Schedule the next transition whenever the phase changes.
  useEffect(() => {
    if (!hostKey || !channel || !room) return;
    if (room.status !== 'playing' || room.phase === 'results') return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(advance, msUntil(room.ends_at));
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [hostKey, channel, room?.phase, room?.round, room?.ends_at, room?.status, advance, room]);

  const start = useCallback(async () => {
    if (!hostKey || !room) return;
    const { data, error: err } = await supabase.rpc('start_game', {
      p_room_id: room.id, p_host_key: hostKey,
    });
    if (err) { setError(err.message); return; }
    broadcastAndApply(data as PhaseEvent);
  }, [hostKey, room, broadcastAndApply]);

  return { start, error };
}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit` → expect no errors. Run `npm test` → PASS.

```bash
git add lib tests
git commit -m "feat(client): game store, realtime room channel, host phase driver"
```

---

### Task 8: Landing page, host setup wizard, join gate

**Files:**
- Create: `app/page.tsx`, `app/host/new/page.tsx`, `components/JoinGate.tsx`
- Modify: `app/layout.tsx` (title/metadata), `app/globals.css` (dark base)

**Interfaces:**
- Consumes: `supabase.rpc('create_room' | 'join_room')`, `saveSession`, `AVATARS`, `COLORS`, `CATEGORIES`, `TIER_NAMES`, `estimateDurationSeconds`.
- Produces: navigation flow — landing → `/host/new` → `/room/[CODE]`; joiners land on `/room/[CODE]` and see `<JoinGate code onJoined>` when no session exists. `JoinGate` props: `{ code: string; onJoined: () => void }` — it calls `join_room`, saves the session, broadcasts nothing itself (the room page's channel refetches state on join via `onJoined`).

M1 styling baseline (used by every UI task): dark slate background (`bg-slate-950 text-slate-100`), one amber accent (`amber-400`) for primary actions, rounded-xl cards on `bg-slate-900`. Placeholder-level; M2 replaces the design system.

- [ ] **Step 1: Base layout + globals**

`app/layout.tsx` — set metadata and body classes:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Circuit Break',
  description: 'The office trivia grand prix',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
```

Reduce `app/globals.css` to Tailwind import only (remove starter styles):

```css
@import "tailwindcss";
```

- [ ] **Step 2: Landing page**

`app/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Landing() {
  const router = useRouter();
  const [code, setCode] = useState('');
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-5xl font-black tracking-tight">
          Circuit <span className="text-amber-400">Break</span>
        </h1>
        <p className="mt-2 text-slate-400">The office trivia grand prix</p>
      </div>

      <button
        onClick={() => router.push('/host/new')}
        className="w-full rounded-xl bg-amber-400 py-4 text-lg font-bold text-slate-950 hover:bg-amber-300"
      >
        Host a game
      </button>

      <form
        className="flex w-full gap-2"
        onSubmit={e => {
          e.preventDefault();
          if (code.trim().length === 5) router.push(`/room/${code.trim().toUpperCase()}`);
        }}
      >
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          maxLength={5}
          placeholder="ROOM CODE"
          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-4 text-center text-lg font-bold tracking-[0.3em] uppercase placeholder:tracking-normal placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={code.trim().length !== 5}
          className="rounded-xl border border-slate-700 px-6 font-bold disabled:opacity-40"
        >
          Join
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Host setup wizard**

`app/host/new/page.tsx` — single page, three sections (categories → mix & timer → identity), Create button:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { saveSession } from '@/lib/session';
import { CATEGORIES, TIER_NAMES, estimateDurationSeconds } from '@/lib/rank';
import { AVATARS, COLORS } from '@/lib/avatars';
import type { Tier } from '@/lib/types';

export default function HostSetup() {
  const router = useRouter();
  const [cats, setCats] = useState<string[]>(CATEGORIES.map(c => c.key));
  const [counts, setCounts] = useState<[number, number, number, number]>([4, 4, 3, 1]);
  const [timer, setTimer] = useState(10);
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0].key);
  const [color, setColor] = useState(COLORS[0]);
  const [playing, setPlaying] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = counts.reduce((a, b) => a + b, 0);
  const mins = Math.round(estimateDurationSeconds(total, timer) / 60);

  const toggleCat = (key: string) =>
    setCats(c => (c.includes(key) ? c.filter(k => k !== key) : [...c, key]));

  const bump = (i: number, d: number) =>
    setCounts(c => {
      const n = [...c] as typeof c;
      n[i] = Math.max(0, Math.min(10, n[i] + d));
      return n;
    });

  async function create() {
    setBusy(true); setError(null);
    const { data: room, error: e1 } = await supabase.rpc('create_room', {
      p_timer_seconds: timer, p_categories: cats, p_tier_counts: counts,
    });
    if (e1) { setError(e1.message); setBusy(false); return; }
    const { data: joined, error: e2 } = await supabase.rpc('join_room', {
      p_code: room.code, p_nickname: nickname, p_avatar: avatar, p_color: color,
      p_host_key: room.host_key, p_is_playing: playing,
    });
    if (e2) { setError(e2.message); setBusy(false); return; }
    saveSession(room.code, {
      roomId: room.room_id, playerId: joined.player_id,
      playerKey: joined.player_key, hostKey: room.host_key,
    });
    router.push(`/room/${room.code}`);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-3xl font-black">New game</h1>

      <section className="space-y-3">
        <h2 className="font-bold text-slate-300">Categories</h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => toggleCat(c.key)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                cats.includes(c.key)
                  ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                  : 'border-slate-700 text-slate-400'
              }`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-slate-300">Question mix</h2>
        {([1, 2, 3, 4] as Tier[]).map((tier, i) => (
          <div key={tier} className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3">
            <span className="font-semibold">{TIER_NAMES[tier]}</span>
            <div className="flex items-center gap-3">
              <button onClick={() => bump(i, -1)} className="h-8 w-8 rounded-lg border border-slate-700 font-bold">−</button>
              <span className="w-6 text-center font-bold tabular-nums">{counts[i]}</span>
              <button onClick={() => bump(i, +1)} className="h-8 w-8 rounded-lg border border-slate-700 font-bold">+</button>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3">
          <span className="font-semibold">Answer timer: {timer}s</span>
          <input type="range" min={5} max={20} value={timer} onChange={e => setTimer(+e.target.value)} />
        </div>
        <p className="text-sm text-slate-400">
          {total} questions · about {mins} min
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-slate-300">You</h2>
        <input
          value={nickname} onChange={e => setNickname(e.target.value)} maxLength={20}
          placeholder="Your nickname"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
        />
        <div className="flex flex-wrap gap-2">
          {AVATARS.map(a => (
            <button key={a.key} onClick={() => setAvatar(a.key)} title={a.label}
              className={`h-12 w-12 rounded-xl text-2xl ${avatar === a.key ? 'bg-amber-400/20 ring-2 ring-amber-400' : 'bg-slate-900'}`}>
              {a.emoji}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-white' : ''}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={playing} onChange={e => setPlaying(e.target.checked)} />
          I&apos;m playing too (uncheck to MC only)
        </label>
      </section>

      {error && <p className="text-rose-400">{error}</p>}
      <button
        onClick={create}
        disabled={busy || total < 1 || cats.length < 1 || nickname.trim().length < 1}
        className="w-full rounded-xl bg-amber-400 py-4 text-lg font-bold text-slate-950 disabled:opacity-40"
      >
        {busy ? 'Creating…' : 'Create room'}
      </button>
    </main>
  );
}
```

- [ ] **Step 4: JoinGate**

`components/JoinGate.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { saveSession } from '@/lib/session';
import { AVATARS, COLORS } from '@/lib/avatars';

export default function JoinGate({ code, onJoined }: { code: string; onJoined: () => void }) {
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[1].key);
  const [color, setColor] = useState(COLORS[1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.rpc('join_room', {
      p_code: code, p_nickname: nickname, p_avatar: avatar, p_color: color,
    });
    if (err) { setError(err.message); setBusy(false); return; }
    saveSession(code, { roomId: data.room_id, playerId: data.player_id, playerKey: data.player_key });
    onJoined();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-black">
        Joining room <span className="text-amber-400 tracking-widest">{code}</span>
      </h1>
      <input
        value={nickname} onChange={e => setNickname(e.target.value)} maxLength={20}
        placeholder="Your nickname"
        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
      />
      <div className="flex flex-wrap gap-2">
        {AVATARS.map(a => (
          <button key={a.key} onClick={() => setAvatar(a.key)} title={a.label}
            className={`h-12 w-12 rounded-xl text-2xl ${avatar === a.key ? 'bg-amber-400/20 ring-2 ring-amber-400' : 'bg-slate-900'}`}>
            {a.emoji}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-white' : ''}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>
      {error && <p className="text-rose-400">{error}</p>}
      <button
        onClick={join}
        disabled={busy || nickname.trim().length < 1}
        className="w-full rounded-xl bg-amber-400 py-4 text-lg font-bold text-slate-950 disabled:opacity-40"
      >
        {busy ? 'Joining…' : 'Join game'}
      </button>
    </main>
  );
}
```

- [ ] **Step 5: Verify in browser**

Run: `npm run dev` (with `npx supabase start` running).
- Landing renders; "Host a game" → wizard; create a room with defaults + nickname → should navigate to `/room/CODE` (which 404s — the room page is Task 9; confirm the URL and that localStorage has `cb:<CODE>` with hostKey).
- `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add app components
git commit -m "feat(ui): landing page, host setup wizard, join gate"
```

---

### Task 9: Room page shell + lobby

**Files:**
- Create: `app/room/[code]/page.tsx`, `components/LobbyView.tsx`

**Interfaces:**
- Consumes: `useRoomChannel`, `useHostDriver`, `useGameStore`, `loadSession`, `JoinGate`, `avatarEmoji`.
- Produces: the room shell that all later views plug into. Render logic:
  - no session in localStorage → `<JoinGate>`; after join, broadcast `player_joined` on the channel with the returned player and refetch state.
  - `room.status === 'lobby'` → `<LobbyView>`
  - `room.status === 'playing'` → `<GameView>` (Task 10 — render a placeholder `<div>Game running…</div>` until then)
  - `room.status === 'finished'` → `<ResultsView>` (Task 12 — placeholder until then)
- `LobbyView` props: `{ code: string; isHost: boolean; onStart: () => void; startError: string | null }` — reads players from the store.

- [ ] **Step 1: Room page shell**

`app/room/[code]/page.tsx`:

```tsx
'use client';
import { use, useEffect, useState } from 'react';
import { useGameStore } from '@/lib/store';
import { useRoomChannel } from '@/lib/useRoomChannel';
import { useHostDriver } from '@/lib/useHostDriver';
import { loadSession } from '@/lib/session';
import { supabase } from '@/lib/supabaseClient';
import type { RoomState } from '@/lib/types';
import JoinGate from '@/components/JoinGate';
import LobbyView from '@/components/LobbyView';

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const room = useGameStore(s => s.room);
  const applyState = useGameStore(s => s.applyState);
  const channel = useRoomChannel(code);
  const { start, error: hostError } = useHostDriver(code, channel);
  const isHost = typeof window !== 'undefined' && !!loadSession(code)?.hostKey;

  useEffect(() => { setHasSession(!!loadSession(code)); }, [code]);

  async function handleJoined() {
    setHasSession(true);
    const { data } = await supabase.rpc('get_room_state', { p_code: code });
    if (data) {
      applyState(data as RoomState);
      const session = loadSession(code);
      const me = (data as RoomState).players.find(p => p.id === session?.playerId);
      if (me) channel?.send({ type: 'broadcast', event: 'player_joined', payload: me });
    }
  }

  if (hasSession === null) return null;
  if (!hasSession) return <JoinGate code={code} onJoined={handleJoined} />;
  if (!room) return <main className="grid min-h-screen place-items-center text-slate-400">Connecting…</main>;

  if (room.status === 'lobby')
    return <LobbyView code={code} isHost={isHost} onStart={start} startError={hostError} />;
  if (room.status === 'finished')
    return <main className="grid min-h-screen place-items-center text-slate-400">Results (Task 12)…</main>;
  return <main className="grid min-h-screen place-items-center text-slate-400">Game running (Task 10)…</main>;
}
```

- [ ] **Step 2: LobbyView**

`components/LobbyView.tsx`:

```tsx
'use client';
import { useGameStore } from '@/lib/store';
import { avatarEmoji } from '@/lib/avatars';

export default function LobbyView({
  code, isHost, onStart, startError,
}: { code: string; isHost: boolean; onStart: () => void; startError: string | null }) {
  const players = useGameStore(s => s.players);
  const playing = players.filter(p => p.is_playing);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-6">
      <header className="text-center">
        <p className="text-slate-400">Join at <b className="text-slate-200">{typeof window !== 'undefined' ? window.location.host : ''}</b> with code</p>
        <p className="text-6xl font-black tracking-[0.2em] text-amber-400">{code}</p>
      </header>

      <section className="flex-1">
        <h2 className="mb-4 font-bold text-slate-300">
          Starting grid — {players.length} joined
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {players.map(p => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-900 p-3">
              <span className="grid h-10 w-10 place-items-center rounded-full text-xl"
                style={{ backgroundColor: `${p.color}33`, boxShadow: `inset 0 0 0 2px ${p.color}` }}>
                {avatarEmoji(p.avatar)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.nickname}</p>
                {p.is_host && <p className="text-xs text-amber-400">{p.is_playing ? 'Host' : 'MC'}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {isHost ? (
        <div className="space-y-2">
          {startError && <p className="text-center text-rose-400">{startError}</p>}
          <button
            onClick={onStart}
            disabled={playing.length < 2}
            className="w-full rounded-xl bg-amber-400 py-4 text-lg font-bold text-slate-950 disabled:opacity-40"
          >
            {playing.length < 2 ? 'Need at least 2 players' : 'Start the race'}
          </button>
          <p className="text-center text-xs text-slate-500">3+ players recommended</p>
        </div>
      ) : (
        <p className="text-center text-slate-400">Waiting for the host to start…</p>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verify in browser (two tabs)**

With dev server + local Supabase running:
1. Tab A: host creates a room → lands in lobby, sees the code and themselves.
2. Tab B (incognito): landing → enter code → JoinGate → join → both tabs show 2 players within a second (broadcast) — verify Tab A updates without refresh.
3. Tab A: "Start the race" → both tabs switch to the "Game running (Task 10)…" placeholder simultaneously.
4. Refresh Tab B mid-lobby → rejoins via stored session, still sees full player list (snapshot refetch).

- [ ] **Step 4: Commit**

```bash
git add app components
git commit -m "feat(ui): room shell with realtime lobby"
```

---

### Task 10: Game view — countdown, question, answer, reveal

**Files:**
- Create: `components/GameView.tsx`, `components/TimerRing.tsx`, `components/QuestionCard.tsx`, `components/AnswerButtons.tsx`, `components/RevealPanel.tsx`
- Modify: `app/room/[code]/page.tsx` (render `GameView` for `status === 'playing'`)

**Interfaces:**
- Consumes: store fields `room`, `question`, `reveal`, `myAnswer`; `supabase.rpc('submit_answer')`; `msUntil`; `loadSession`; `TIER_NAMES`, `CATEGORIES`.
- Produces:
  - `GameView` props: `{ code: string }` — routes on `room.phase`: `countdown` → big 3-2-1; `read`/`answer` → QuestionCard + AnswerButtons (+TimerRing during answer); `reveal` → RevealPanel; `track` → `<Track>` (Task 11; placeholder `<div>` until then).
  - `TimerRing` props: `{ endsAt: string | null; totalMs: number }` — SVG ring that drains via requestAnimationFrame against `msUntil(endsAt)`.
  - `QuestionCard` props: `{ question: QuestionPublic; round: number; totalRounds: number }`.
  - `AnswerButtons` props: `{ options: string[]; locked: boolean; chosen: number | null; correctIndex: number | null; onChoose: (i: number) => void }` — shape-coded buttons ▲◆●■ (Global Constraints: colorblind-safe), disabled when `locked`; when `correctIndex != null` (reveal), highlights correct green / chosen-wrong red.
  - `RevealPanel` props: `{ reveal: RevealPayload; question: QuestionPublic }` — correct answer, per-option counts bar, fastest stamp, fun-fact card.

- [ ] **Step 1: TimerRing**

`components/TimerRing.tsx`:

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { msUntil } from '@/lib/serverTime';

export default function TimerRing({ endsAt, totalMs }: { endsAt: string | null; totalMs: number }) {
  const [remaining, setRemaining] = useState(() => msUntil(endsAt));
  const raf = useRef(0);

  useEffect(() => {
    const tick = () => {
      setRemaining(msUntil(endsAt));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [endsAt]);

  const frac = totalMs > 0 ? Math.max(0, Math.min(1, remaining / totalMs)) : 0;
  const R = 28;
  const C = 2 * Math.PI * R;
  const secs = Math.ceil(remaining / 1000);

  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={R} fill="none" stroke="#1e293b" strokeWidth="6" />
        <circle cx="32" cy="32" r={R} fill="none"
          stroke={frac < 0.25 ? '#fb7185' : '#fbbf24'} strokeWidth="6"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xl font-black tabular-nums">{secs}</span>
    </div>
  );
}
```

- [ ] **Step 2: QuestionCard, AnswerButtons, RevealPanel**

`components/QuestionCard.tsx`:

```tsx
import type { QuestionPublic } from '@/lib/types';
import { TIER_NAMES, CATEGORIES } from '@/lib/rank';

export default function QuestionCard({
  question, round, totalRounds,
}: { question: QuestionPublic; round: number; totalRounds: number }) {
  const cat = CATEGORIES.find(c => c.key === question.category);
  return (
    <div className="space-y-3 text-center">
      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-400">
        <span>Q{round}/{totalRounds}</span>
        <span className="rounded-full bg-slate-800 px-3 py-1">{cat?.emoji} {cat?.label}</span>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-amber-300">{TIER_NAMES[question.tier]}</span>
      </div>
      <h2 className="text-balance text-2xl font-black sm:text-3xl">{question.prompt}</h2>
    </div>
  );
}
```

`components/AnswerButtons.tsx`:

```tsx
'use client';

const SHAPES = ['▲', '◆', '●', '■'];
const SHAPE_COLORS = ['#fb7185', '#38bdf8', '#facc15', '#34d399'];

export default function AnswerButtons({
  options, locked, chosen, correctIndex, onChoose,
}: {
  options: string[]; locked: boolean; chosen: number | null;
  correctIndex: number | null; onChoose: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((opt, i) => {
        const isChosen = chosen === i;
        const revealed = correctIndex !== null;
        const cls = revealed
          ? i === correctIndex
            ? 'border-emerald-400 bg-emerald-400/15'
            : isChosen
              ? 'border-rose-400 bg-rose-400/10 opacity-70'
              : 'border-slate-800 opacity-40'
          : isChosen
            ? 'border-amber-400 bg-amber-400/10'
            : 'border-slate-700 bg-slate-900 hover:border-slate-500';
        return (
          <button
            key={i}
            disabled={locked || revealed}
            onClick={() => onChoose(i)}
            className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left font-semibold transition ${cls}`}
          >
            <span style={{ color: SHAPE_COLORS[i] }} aria-hidden>{SHAPES[i]}</span>
            <span>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}
```

`components/RevealPanel.tsx`:

```tsx
import type { QuestionPublic, RevealPayload } from '@/lib/types';

export default function RevealPanel({ reveal, question }: { reveal: RevealPayload; question: QuestionPublic }) {
  const total = reveal.counts.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="space-y-4">
      <p className="text-center text-sm font-bold uppercase tracking-widest text-emerald-400">Correct answer</p>
      <p className="text-center text-2xl font-black">{question.options[reveal.correct_index]}</p>

      <div className="space-y-2">
        {question.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-28 truncate text-slate-400 sm:w-40">{opt}</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-slate-800">
              <div
                className={i === reveal.correct_index ? 'h-full bg-emerald-400' : 'h-full bg-slate-600'}
                style={{ width: `${(reveal.counts[i] / total) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right tabular-nums">{reveal.counts[i]}</span>
          </div>
        ))}
      </div>

      {reveal.fastest && (
        <p className="text-center font-bold text-amber-300">⚡ Fastest: {reveal.fastest.nickname}</p>
      )}
      {reveal.fun_fact && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-center text-slate-300">
          💡 {reveal.fun_fact}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: GameView**

`components/GameView.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/store';
import { supabase } from '@/lib/supabaseClient';
import { loadSession } from '@/lib/session';
import { msUntil } from '@/lib/serverTime';
import TimerRing from './TimerRing';
import QuestionCard from './QuestionCard';
import AnswerButtons from './AnswerButtons';
import RevealPanel from './RevealPanel';
import Track from './Track';

export default function GameView({ code }: { code: string }) {
  const room = useGameStore(s => s.room);
  const question = useGameStore(s => s.question);
  const reveal = useGameStore(s => s.reveal);
  const myAnswer = useGameStore(s => s.myAnswer);
  const setMyAnswer = useGameStore(s => s.setMyAnswer);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!room) return null;

  async function choose(i: number) {
    if (!room || myAnswer !== null) return;
    setMyAnswer(i); // optimistic lock
    const session = loadSession(code);
    if (!session) return;
    const { error } = await supabase.rpc('submit_answer', {
      p_room_id: room.id, p_player_key: session.playerKey,
      p_round: room.round, p_choice_index: i,
    });
    if (error) setSubmitError(error.message);
  }

  if (room.phase === 'countdown') return <Countdown endsAt={room.ends_at} />;
  if (room.phase === 'track') return <Track />;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-6">
      {question && (
        <QuestionCard question={question} round={room.round} totalRounds={room.total_rounds} />
      )}

      {room.phase === 'answer' && (
        <div className="flex justify-center">
          <TimerRing endsAt={room.ends_at} totalMs={room.timer_seconds * 1000} />
        </div>
      )}

      {question && room.phase !== 'reveal' && (
        <AnswerButtons
          options={question.options}
          locked={room.phase !== 'answer' || myAnswer !== null}
          chosen={myAnswer}
          correctIndex={null}
          onChoose={choose}
        />
      )}
      {room.phase === 'read' && (
        <p className="text-center text-sm font-bold uppercase tracking-widest text-slate-500">Get ready…</p>
      )}
      {room.phase === 'answer' && myAnswer !== null && (
        <p className="text-center font-bold text-amber-300">Locked in!</p>
      )}

      {room.phase === 'reveal' && question && reveal && (
        <RevealPanel reveal={reveal} question={question} />
      )}
      {submitError && <p className="text-center text-sm text-rose-400">{submitError}</p>}
    </main>
  );
}

function Countdown({ endsAt }: { endsAt: string | null }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    const id = setInterval(() => setN(Math.max(1, Math.ceil(msUntil(endsAt) / 1000))), 100);
    return () => clearInterval(id);
  }, [endsAt]);
  return (
    <main className="grid min-h-screen place-items-center">
      <span className="text-9xl font-black text-amber-400">{n}</span>
    </main>
  );
}
```

For this task, create a placeholder `components/Track.tsx` (replaced in Task 11):

```tsx
export default function Track() {
  return <main className="grid min-h-screen place-items-center text-slate-400">Track…</main>;
}
```

Update `app/room/[code]/page.tsx`: replace the "Game running (Task 10)…" placeholder with `<GameView code={code} />` (import it).

- [ ] **Step 4: Verify in browser (two tabs)**

Start a 3-question game (e.g. counts 3/0/0/0, fuel + ai-tech, 10s timer):
- Both tabs show 3-2-1 countdown, then question in READ with locked buttons.
- ANSWER: timer ring drains in sync; picking an answer locks it; second click does nothing.
- REVEAL after timer: correct highlighted, counts bar right, fastest name shown, fun fact visible.
- TRACK placeholder shows for 4s, then next round. After last round: results placeholder.
- One tab answers nothing all game → no errors, reveal shows their absence in counts.

- [ ] **Step 5: Commit**

```bash
git add app components
git commit -m "feat(ui): synchronized question loop — countdown, answer, reveal"
```

---

### Task 11: The track

**Files:**
- Modify: `components/Track.tsx` (replace placeholder)

**Interfaces:**
- Consumes: store `standings`, `room` (`total_rounds`, `round`), `players`, `avatarEmoji`, session (`loadSession(code)` not needed — highlight self via `playerId` prop).
- Produces: `Track` props change to `{ code: string }` (GameView passes `code`). Renders a horizontal segment track: `total_rounds + 1` positions (0 = start line, total_rounds = finish 🏁). Avatars sit at x-position = `correct` count, animated with CSS transitions; players on the same segment stack vertically ordered by the standings sort (already sorted by SQL). Top 3 get 🥇🥈🥉 badges. Self is highlighted with a ring.

M1 note: this is a DOM/CSS component behind a stable interface. M2 replaces its internals with the PixiJS scene without touching GameView.

- [ ] **Step 1: Implement Track**

`components/Track.tsx`:

```tsx
'use client';
import { useGameStore } from '@/lib/store';
import { loadSession } from '@/lib/session';
import { avatarEmoji } from '@/lib/avatars';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Track({ code }: { code: string }) {
  const room = useGameStore(s => s.room);
  const standings = useGameStore(s => s.standings);
  const myId = typeof window !== 'undefined' ? loadSession(code)?.playerId : null;

  if (!room || !standings) return null;
  const total = room.total_rounds;

  // Group players by segment (correct count), keep standings order within a segment.
  const bySegment = new Map<number, typeof standings>();
  for (const s of standings) {
    const seg = Math.min(s.correct, total);
    if (!bySegment.has(seg)) bySegment.set(seg, []);
    bySegment.get(seg)!.push(s);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 p-6">
      <h2 className="text-center text-sm font-bold uppercase tracking-widest text-slate-500">
        The track — after Q{room.round}
      </h2>

      <div className="relative w-full overflow-x-auto rounded-2xl bg-slate-900 p-4">
        <div className="relative" style={{ minWidth: `${(total + 1) * 72}px`, minHeight: '220px' }}>
          {/* segment lines */}
          {Array.from({ length: total + 1 }, (_, i) => (
            <div key={i} className="absolute top-0 bottom-0 border-l border-dashed border-slate-700"
              style={{ left: `${(i / total) * 100}%` }}>
              <span className="absolute -top-1 left-1 text-xs text-slate-600 tabular-nums">
                {i === total ? '🏁' : i}
              </span>
            </div>
          ))}
          {/* avatars */}
          {standings.map(s => {
            const seg = Math.min(s.correct, total);
            const stack = bySegment.get(seg)!;
            const idx = stack.findIndex(x => x.player_id === s.player_id);
            const rank = standings.findIndex(x => x.player_id === s.player_id);
            return (
              <div key={s.player_id}
                className="absolute flex items-center gap-1 transition-all duration-1000 ease-out"
                style={{ left: `calc(${(seg / total) * 100}% + 6px)`, top: `${24 + idx * 44}px` }}>
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full text-lg ${s.player_id === myId ? 'ring-2 ring-white' : ''}`}
                  style={{ backgroundColor: `${s.color}33`, boxShadow: `inset 0 0 0 2px ${s.color}` }}>
                  {avatarEmoji(s.avatar)}
                </span>
                <span className="max-w-24 truncate text-xs font-semibold">
                  {rank < 3 && <span className="mr-0.5">{MEDALS[rank]}</span>}
                  {s.nickname}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-center text-sm text-slate-400">
        {standings[0] && <>Leader: <b className="text-slate-200">{standings[0].nickname}</b> · {standings[0].correct}/{total} correct</>}
      </div>
    </main>
  );
}
```

Update `GameView.tsx` to pass code: `if (room.phase === 'track') return <Track code={code} />;`

- [ ] **Step 2: Verify in browser**

Play a 3-question game in two tabs where tab A answers correctly and tab B doesn't:
- After Q1's reveal, the TRACK phase shows A one segment ahead with 🥇 and B at start with 🥈.
- Avatars visibly slide (CSS transition) rather than teleport when re-entering track view across rounds — since the component remounts per phase, at minimum positions must be correct each round; smooth continuous motion is an M2 concern.
- Self avatar has a white ring in the tab that owns it.

- [ ] **Step 3: Commit**

```bash
git add components
git commit -m "feat(ui): segment track view with ranked avatar positions"
```

---

### Task 12: Results screen + full playthrough

**Files:**
- Create: `components/ResultsView.tsx`
- Modify: `app/room/[code]/page.tsx` (render it for `status === 'finished'`)

**Interfaces:**
- Consumes: store `standings`, `room`; `avatarEmoji`; session for self-highlight.
- Produces: `ResultsView` props `{ code: string }` — winner banner, ranked table (correct / speed points / longest streak), "Back to home" link. (Podium ceremony, awards, confetti, rematch = M2/M3.)

- [ ] **Step 1: Implement ResultsView**

`components/ResultsView.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { useGameStore } from '@/lib/store';
import { loadSession } from '@/lib/session';
import { avatarEmoji } from '@/lib/avatars';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function ResultsView({ code }: { code: string }) {
  const room = useGameStore(s => s.room);
  const standings = useGameStore(s => s.standings);
  const myId = typeof window !== 'undefined' ? loadSession(code)?.playerId : null;
  if (!room || !standings || standings.length === 0) return null;
  const winner = standings[0];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-6">
      <header className="text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Race complete</p>
        <p className="mt-2 text-4xl font-black">
          🏆 <span style={{ color: winner.color }}>{winner.nickname}</span> wins!
        </p>
        <p className="mt-1 text-slate-400">
          {winner.correct}/{room.total_rounds} correct
        </p>
      </header>

      <table className="w-full text-left">
        <thead className="text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="pb-2">#</th><th className="pb-2">Player</th>
            <th className="pb-2 text-right">Correct</th>
            <th className="pb-2 text-right">Speed</th>
            <th className="pb-2 text-right">Best streak</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.player_id}
              className={`border-t border-slate-800 ${s.player_id === myId ? 'bg-slate-900' : ''}`}>
              <td className="py-3 font-bold tabular-nums">{MEDALS[i] ?? i + 1}</td>
              <td className="py-3">
                <span className="mr-2">{avatarEmoji(s.avatar)}</span>
                <span className="font-semibold">{s.nickname}</span>
              </td>
              <td className="py-3 text-right font-bold tabular-nums">{s.correct}</td>
              <td className="py-3 text-right tabular-nums text-slate-400">{s.speed_points}</td>
              <td className="py-3 text-right tabular-nums text-slate-400">{s.longest_streak}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Link href="/" className="text-center font-bold text-amber-400 hover:underline">
        Back to home
      </Link>
    </main>
  );
}
```

Wire into `app/room/[code]/page.tsx`: replace the finished-status placeholder with `<ResultsView code={code} />`.

- [ ] **Step 2: Full playthrough verification (the M1 acceptance test)**

With local Supabase + dev server:
1. Host (playing) creates a 4-question game (2/1/1/0), timer 5s, all categories.
2. Two more browser profiles join. Start with 3 players.
3. Play the full game: all phases advance automatically on the host's clock; all three tabs stay in sync (visually < 1s apart).
4. Mid-game, refresh a non-host tab during ANSWER → it reconnects, shows the current question with correct remaining time, and can still answer.
5. Game ends → all tabs land on results with identical rankings; verify order obeys correct → speed → streak against the answers given.
6. Run `npm test` and `node scripts/smoke.mjs` → all green. Run `npx tsc --noEmit` and `npm run build` → clean.

- [ ] **Step 3: Commit**

```bash
git add app components
git commit -m "feat(ui): results screen; complete M1 core loop"
```

---

### Task 13: Deploy to Supabase cloud + Vercel

**Files:**
- Modify: none (config/dashboard work; commit only if config files change)

**Interfaces:**
- Consumes: the two migrations + seed; env var names from Task 1.
- Produces: a public URL running the game.

- [ ] **Step 1: Create the Supabase cloud project**

At https://supabase.com/dashboard create a free-tier project (pick a region near the office). Then link and push:

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push          # applies 0001 + 0002
```

Seed the bank (db push does not run seed.sql against remote):

```bash
# Use the SQL editor in the dashboard: paste supabase/seed.sql and run,
# or: psql "<connection string from dashboard>" -f supabase/seed.sql
```

Verify in the dashboard SQL editor: `select count(*) from questions;` → 48.

- [ ] **Step 2: Deploy to Vercel**

```bash
npx vercel --yes
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production      # cloud project URL
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production # cloud anon key
npx vercel --prod
```

(Alternatively connect the GitHub repo in the Vercel dashboard for auto-deploys — either path is fine; if the user has a preference, ask.)

- [ ] **Step 3: Production smoke**

- Open the prod URL on a laptop and a phone; host on laptop, join on phone; play a 3-question game end-to-end.
- Confirm in browser devtools (Network tab) that no response before REVEAL contains `correct_index`.

- [ ] **Step 4: Commit + tag**

```bash
git add -A
git commit -m "chore: production deployment config" --allow-empty
git tag m1-core-loop
```

---

## Self-Review Notes

- **Spec coverage (M1 scope from PRD §12):** room create/join ✅ (T4, T8) · lobby ✅ (T9) · synchronized loop with RPC-validated answers ✅ (T5, T10) · basic track ✅ (T11) · correct-count ranking ✅ (T5 standings, T12) · results ✅ (T12) · deploy ✅ (T13). Fairness Law fully implemented in `standings()` ordering; sudden death deliberately deferred to M3 per PRD phases (tie for first displays as shared order by streak — acceptable for M1 and noted in constraints).
- **Type consistency:** `PhaseEvent`/`Standing`/`RevealPayload` field names match the SQL `jsonb_build_object` keys exactly (`player_id`, `speed_points`, `longest_streak`, `correct_index`, `time_remaining_ms`, `ends_at`, `server_now`). `Track`/`ResultsView`/`GameView` all take `{ code }`.
- **Known M1 deviations from PRD, all deliberate and listed in Global Constraints:** no late join, no stage view, no custom questions, no host pause/skip, placeholder visuals, DOM track (PixiJS in M2), no sudden death/awards/rematch.
