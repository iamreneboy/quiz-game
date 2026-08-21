# PRD — Circuit Break

**A trivia grand prix for the office.**

| | |
|---|---|
| Document | Product Requirements Document |
| Version | 1.1 |
| Date | 2026-08-21 |
| Working title | **Circuit Break** (circuit breaker ⚡ × coffee break ☕) |
| Platform | Browser (desktop + mobile), deployed on Vercel free tier + Supabase free tier |
| Sources | Synthesized from the five concept docs in `docs/sources/` plus stakeholder decisions (see §14). v1.1 incorporates selected recommendations from `docs/raw/Circuit-Break-PRD-Consolidated-v1.0.md` (engine/mode/world separation, platform strategy, game-show identity). |

---

## 1. Summary

Circuit Break is a browser-based, host-driven multiplayer trivia game built for office teams of 5–20 people. Players join with a room code, pick a playful avatar, and line up on an animated racetrack. Everyone answers the same question at the same time under a shared timer; every correct answer rockets a player's avatar one segment down the track — **the racetrack is the leaderboard**. Speed and streaks earn tiebreaker points only. The game ends with a photo-finish, a podium ceremony with confetti, and stat awards.

**One-line pitch:** *Kahoot's simplicity with a game-show broadcast's production value — where the track is the scoreboard and knowledge always wins.*

**North star:** Circuit Break is a **multiplayer game show in which trivia answers control the action** — the player is a contestant, the world is a stage, and the question is one component of the show. It must never read as "a quiz website with animations": no spreadsheet leaderboard as the main surface, no four flat colored rectangles as the visual identity, no generic correct/incorrect/next flow. When a design choice is in tension, prefer the game-show identity — provided accessibility and question readability stay intact.

**Tone:** polished-playful. Premium game-show aesthetic, witty copy, celebratory ceremony — no sabotage, no humiliation mechanics. Safe to play with the whole department, managers included.

## 2. Goals & Non-Goals

**Goals**

- **G1 — Zero-training host.** A first-time host configures and starts a game in under 3 minutes.
- **G2 — Knowledge always wins.** The player with the most correct answers always ranks highest. Speed and streaks only break ties. This is the game's constitution.
- **G3 — Best-in-browser visuals.** The game should look like a produced TV game show, not a form with a timer: animated track world, avatar motion with real easing and squash-and-stretch, particle celebrations, reveal staging, podium ceremony.
- **G4 — Every device is first-class.** Remote players on Teams/Zoom get the full experience on their own device; in-room sessions can add a big-screen stage view.
- **G5 — Cheap validation now, clean upgrade path later.** v1 fits comfortably inside Vercel and Supabase free tiers at the target scale (5–20 players, a few games per week). But the architecture is not optimized around staying free forever: domain logic, the realtime protocol, and assets stay portable so paid infra, a CDN, or dedicated realtime can be swapped in without a product rewrite once demand justifies it.
- **G6 — Shareable moments.** Streak flames, photo-finish reveals, podium, and awards produce screenshots people post in the team channel.

**Non-Goals (v1)**

- Player or host accounts (everyone is anonymous per session; see §13 for v2).
- Free-roam avatar movement / WASD arenas / pickups / sabotage.
- Team mode, audio ("name that tune") rounds, image questions.
- Native apps (planned for later — see §13.3), voice chat, monetization, non-English content.
- Additional worlds/themes or game modes beyond Grand Prix × Office HQ (see §13.1–13.2), and any speculative abstraction built for them.
- Anti-cheat beyond server-side answer validation (office games are trust-based).

## 3. Design Pillars (do not break)

1. **The Fairness Law.** Final ranking is strictly lexicographic: **Correct Answers → Speed Points → Longest Streak → Sudden Death**. No tiebreaker currency can ever outrank one additional correct answer.
2. **Synchronized play.** Every player sees the same question at the same moment. Answer validation and timing are authoritative (clients never receive the correct answer before the reveal).
3. **No elimination, no humiliation.** Everyone plays every round. Wrong answers get a neutral "no move" beat, not a mockery animation.
4. **The world is the UI.** Standings, streaks, and momentum are read from the track scene itself — there is no spreadsheet-style leaderboard on the main view (a detailed stats table exists only on the end screen and host panel).
5. **The engine outlives the theme.** The office world is the launch theme, not the product's permanent identity. Three layers stay separate: **Quiz Engine** (rooms, players, questions, phases, timers, validation, scoring, fairness — knows nothing about visuals), **Game Mode** (what an answer *does* — Grand Prix: correct answer = advance one segment), and **World/Theme** (environment, avatars, props, VFX, audio identity). v1 ships exactly one of each — one engine, one mode (Grand Prix), one world (Office HQ) — with no speculative plugin frameworks, but the boundaries stay clean enough that a future world or mode is new content, not a rewrite.
6. **Platform-neutral domain.** Game rules, room/player lifecycle, scoring, phase state, and the realtime event protocol live behind the backend and a semantic event vocabulary — never in web-client-only code — so future native mobile clients can join the same games without rebuilding the game.

## 4. Roles & Views

| Role | Description |
|---|---|
| **Host** | Creates the room, curates questions, controls the show (start, pause, skip, end). Chooses at start whether to **also play** as a racer — their device then shows the normal player view plus a slim host control strip. |
| **Player** | Joins via room code or link, picks a nickname + avatar, answers on their own device. The player view is complete: track, questions, reveals, ceremony. |
| **Stage view** | A read-only spectator screen opened via the room's stage link — for the meeting-room TV or a shared screen in a call. Shows the cinematic wide shot: full track, question, timer, reveal, podium. No interaction. |
| **Late joiner / spectator** | Can join mid-game; they watch as a spectator and materialize on the track at the start of the next round with 0 correct answers (clearly marked "joined late"). |

## 5. Game Flow

### 5.1 Host setup (target: under 3 minutes)

1. **Create room** → gets a 5-letter room code, a join link, a QR code, and a stage-view link.
2. **Pick categories** — one, several, or "Mix it all".
3. **Set the difficulty mix** — steppers for questions per tier (e.g. 4 / 4 / 3 / 1). The UI shows estimated game duration live (~45s per question).
4. **Set the timer** — one global per-question timer, 5–20s, default 10s.
5. **Review the draw** *(optional)* — the system pre-draws matching questions from the bank; host can veto/swap any question and **add custom questions** (prompt, 4 options, correct answer, tier, category, optional fun-fact). Custom questions live only in this room.
6. **Choose "I'm playing too" or "MC only"**, then open the lobby.

Sensible defaults at every step: a host who just hits "Next" three times gets a good 12-question mixed game.

### 5.2 Lobby

- Players enter a nickname and pick an avatar (a roster of ~12 office-flavored characters: coffee cup, cactus, rubber duck, robot, cat-in-a-tie, stapler, plant, donut…) plus an accent color.
- Joined players appear on the starting grid, idling with subtle animations. A "ready" pulse and player count build anticipation.
- Host starts the game with ≥2 players (UI recommends 3+).

### 5.3 Round loop (per question)

| Phase | Duration | What happens |
|---|---|---|
| **READ** | 3s | Category + tier badge slams in, then the question text. Answer buttons visible but locked. Builds fairness (readers vs. skimmers) and drama. |
| **ANSWER** | 5–20s (host-set) | Four answer buttons unlock; shared countdown ring + escalating music. Players lock in one answer; locked answers show a "locked" state but not others' picks. |
| **REVEAL** | 5s | Correct answer highlighted; picks shown as an avatar-stacked distribution bar; "FASTEST ⚡ {name}" stamp for the quickest correct answer; **fun-fact card** slides in for the host to read aloud. |
| **TRACK MOMENT** | 4s | Camera cuts to the track: correct answerers zoom forward one segment with boost trails and engine SFX; overtakes get a whoosh + position flip animation; streak flames ignite/extinguish. |

- Question tiers: 🥤 **Warm-Up** (easy) · ☕ **Double Shot** (medium) · 🔥 **Crunch Time** (hard) · 💀 **Final Boss** (expert). Tier affects speed-point multiplier only (§6), never correct-answer weight.
- The **last question** gets escalated staging: lights dim, track goes neon, "FINAL QUESTION" sting.
- No question repeats within a game.

### 5.4 Endgame

1. **Photo finish** — if any places are tied on correct answers, a brief "PHOTO FINISH" sequence shows the tie resolving on speed points (animated tally).
2. **Sudden death** — only for a perfect tie *for first place* (same correct count, same speed points, same streak): one expert question, first correct answer wins.
3. **Podium ceremony** — top-3 podium rise, confetti, winner fanfare.
4. **Awards** — 🧠 Big Brain (most correct) · ⚡ Fastest Gun (most speed points) · 🔥 Hot Streak (longest streak) · 📈 Late Surge (most positions gained in the second half).
5. **Full results table** — per-player correct count, accuracy, average answer time, streak. 
6. **Rematch** — host restarts with the same players and same or tweaked config; questions reshuffle and exclude ones already used.

## 6. Scoring & Ranking

- **Correct answer = +1 Position.** The avatar advances one track segment. Track length = number of questions. This is the only thing that determines rank between players with different correct counts.
- **Speed points (tiebreaker #1)**, awarded only on correct answers:
  `speedPoints = ⌊(timeRemaining / timerLength) × 100⌋ × tierMultiplier` where tierMultiplier = 1 / 2 / 3 / 4 for Warm-Up → Final Boss.
- **Longest streak (tiebreaker #2).** Longest run of consecutive correct answers in the game.
- **Sudden death (tiebreaker #3, first place only).** One expert question; first correct wins. Lower places that remain perfectly tied share the position.
- Wrong or missing answers award nothing and cost nothing. No negative scoring.
- On-track visualization: players tied on the same segment are ordered within the segment by speed points, with a small turbo-flame on whoever holds the edge.

Streaks are also celebrated visually (3 = spark trail, 5 = flames, 8 = inferno + arena announcement) but grant no scoring benefit beyond the tiebreak record.

## 7. Categories & Content

Six launch categories, tuned for office cross-generational appeal:

| Category | Scope |
|---|---|
| 🎬 **Screen Break** | Movies, TV, streaming-era hits, iconic quotes |
| 🤖 **AI & Tech** | Tech history, AI moments and bloopers, gadgets, famous fails |
| 💼 **Corporate Survival** | Buzzword decoding, email/meeting culture, office lore, workplace absurdities |
| 📼 **Rewind** | 90s/2000s nostalgia: toys, cartoons, early internet, one-hit wonders |
| 🐸 **Extremely Online** | Memes, viral moments, internet history |
| ☕ **Fuel** | Food, coffee culture, snack facts, kitchen lore |

**Bank:** ≥ 240 questions at launch (6 categories × 4 tiers × ≥10), each with: prompt, 4 options, correct answer, tier, category, **fun-fact card**. Authored with AI assistance + human review; stored in Supabase and seeded via migration script. English-only at launch.

**Custom questions:** host-added per room (§5.1), merged into the draw, discarded when the room expires.

## 8. Visual & Audio Direction

The bar: "best visuals available for a browser game," professional yet entertaining.

- **Art direction:** a stylized night-race world — dark indigo track scene with neon accent lighting, warm avatar colors, glassmorphic UI panels floating above the world. Think *Mario Kart's energy shot on a Bloomberg budget*. Consistent design system (typography, color tokens, motion curves) across every screen so it reads as one production.
- **Track scene:** WebGL-rendered (PixiJS) side-view racetrack divided into segments, with parallax background layers that evolve as the game progresses (office park → neon city → stadium finish). Camera work matters: gentle drift during answers, snap-cuts for track moments, slow push-in on the final question.
- **Avatar flair:** top 3 get gold/silver/bronze glows and trails; the leader's avatar renders slightly larger; overtaking triggers a lightning flourish. Streak flames per §6.
- **Motion:** every state change is animated (spring easing, anticipation, follow-through). Confetti and particles are GPU-friendly and degrade automatically on low-end devices.
- **Celebration discipline:** feedback escalates in a strict hierarchy so major moments actually feel major — normal correct answer (movement + small boost + subtle sound) < streak milestone (trail/flames + arena reaction) < overtake (camera emphasis + whoosh + position flip) < final question (environmental transformation) < victory (podium + confetti + fanfare + awards). Never spend the maximum celebration on a routine correct answer.
- **Broadcast language, not classroom software:** camera-like cuts, establishing shots, lower-third player callouts, dramatic reveal cards, spotlighting, audio stingers. The design razor for every UI decision: *"does this make it feel more like a game show, or more like a quiz website?"* The stage view is treated as a major feature — "Circuit Break Broadcast," the most cinematic composition of the game — not merely another responsive layout; the player view prioritizes readability and interaction over spectacle.
- **Answer UI:** shape-coded and accessible per below, but with restrained accent colors, strong typography, and subtle depth — avoid making four giant flat colored rectangles the product's visual identity.
- **Audio:** lobby groove, escalating answer-phase music, distinct correct/wrong/overtake/streak stingers, final-question sting, podium fanfare. Mute toggle persists per device.
- **Accessibility:** colorblind-safe answer palette with shape-coded answer buttons (▲ ◆ ● ■), reduced-motion mode, scalable text, full keyboard operability for answering.
- **Responsive:** mobile portrait gets a compact track strip + large answer buttons; desktop gets the wide cinematic layout; the stage view is a chrome-free broadcast layout for TVs.

## 9. Technical Architecture

**Stack:** Next.js (App Router, TypeScript) on Vercel · Supabase (Postgres + Realtime + RPC) · PixiJS for the track scene · Tailwind + Framer Motion for UI · Howler.js for audio · Zustand for client game state.

**Why no game server:** Vercel's free tier cannot host persistent WebSocket servers. Instead:

- **Supabase Postgres** is the source of truth: `rooms`, `players`, `room_questions`, `answers`, plus the seeded `questions` bank.
- **Supabase Realtime (broadcast + presence)** carries game events on a per-room channel: phase transitions, player joins, reveal payloads, track updates. Presence tracks who's connected.
- **The host's client drives the state machine** (READ → ANSWER → REVEAL → TRACK → …), stamping each phase transition into Postgres and broadcasting it. If the host disconnects, the game pauses; on reconnect it resumes from the persisted state. (A 60s host-drop grace message tells players what's happening.)
- **Answer integrity:** correct answers are never sent to clients before the reveal. Players submit answers to a **Postgres RPC** (`submit_answer`) which validates against the server clock (with a 300ms network grace window), records the answer + response time, and returns only "locked". The reveal payload (correct option, distribution, fastest player, fun fact) is computed by a second RPC at phase end and broadcast.
- **Timing:** the phase-start broadcast carries a server timestamp; clients render the countdown against server time offset, so displayed timers drift < 250ms.
- **Room lifecycle:** rooms expire and are purged 24h after creation (Supabase scheduled function or cleanup on access).
- **Semantic, platform-neutral events — never animation frames.** Realtime events describe game meaning (`PLAYER_ADVANCED { playerId, position }`, `STREAK_CHANGED`, `REVEAL_READY`), never coordinates, sprite frames, or renderer-specific concepts. Each client performs its own animation locally (boost → move → overshoot → settle). This keeps the realtime backend lightweight and lets future native clients interpret the same protocol.
- **Rendering separation:** PixiJS owns the world (track, avatars, environment, parallax, VFX, camera); HTML/CSS/React owns everything readable and interactive (question, answer buttons, timer, host controls, dialogs, results) so accessibility never depends on canvas rendering. Zustand holds client/presentation state; Supabase remains the sole authority for game state.
- **Asset strategy:** world visuals are built as modular bundles — texture atlases, layered backgrounds, reusable props, independent avatars, separate VFX/audio — not one monolithic scene image. This is what makes future worlds (§13) and native clients independently loadable content rather than rebuilds. Prefer WebP/AVIF, compressed audio, lazy loading; avoid 4K textures and video backgrounds.
- **Performance profiles:** a high profile (full parallax, ambient animation, full particle counts) and a reduced profile (fewer particles, simplified backgrounds, reduced ambient motion) are first-class requirements, selected automatically by device capability and available as reduced-motion.

**Free-tier budget** (worst case: 20 players, 20 questions, ~4 broadcasts/round + presence): well under 1% of Supabase free-tier realtime message and connection quotas per game; the 200-concurrent-connection ceiling supports ~9 simultaneous 20-player games. Database footprint is trivial. Vercel serves only static assets and pages — no function-heavy paths.

**Edge cases**

| Case | Behavior |
|---|---|
| Player disconnects | 60s grace with score frozen; presence drop shows avatar as "reconnecting"; afterwards they become a spectator and can rejoin with the same nickname to reclaim their run. |
| Host disconnects | Game auto-pauses with an on-screen notice; host reconnect resumes. If the host is gone > 5 min, the room ends gracefully with current standings. |
| Late join | Spectator until next round start (§4). |
| AFK player | No penalty and no nap-shaming; they simply stop advancing. |
| Double submission / clock tampering | RPC accepts only the first answer per player per question and validates timestamps server-side. |

## 10. Screens Inventory

1. **Landing** — create a game / join with code.
2. **Host setup wizard** — categories → difficulty mix + timer → question review & custom questions → play-mode choice.
3. **Lobby** — join code + QR, avatar picker, starting grid.
4. **Game (player)** — track scene + question overlay + reveal + track moments. Host variant adds the control strip (pause / skip question / end game).
5. **Stage view** — read-only cinematic layout.
6. **Podium & results** — ceremony, awards, results table, rematch.

## 11. Success Criteria

- Host can go from landing page to a started game in < 3 minutes without instructions.
- A full 12-question game with 10 players completes without a desync or stall.
- 60fps track scene on a mid-range laptop; graceful degradation on a mid-range phone.
- Ties are resolved exactly per the Fairness Law in all cases, including sudden death.
- One month of typical office use (3 games/week, 15 players) stays within both free tiers.

## 12. Build Phases

| Phase | Scope |
|---|---|
| **M1 — Core loop** | Room create/join, lobby, synchronized question loop with RPC-validated answers, basic track rendering, correct-count ranking, results screen. Playable end-to-end with placeholder art. |
| **M2 — The show** | Full visual direction: track world + parallax, avatar animation & flair, reveal staging, streak VFX, podium ceremony, audio, stage view. |
| **M3 — Host power & polish** | Question review/veto/swap, custom questions, host control strip, sudden death, awards, rematch, accessibility pass, question bank to full 240, edge-case hardening. |

## 13. Future (v2+) — explicitly out of v1

None of the following may expand v1 scope. They exist here so v1's boundaries (§3 pillars 5–6, §9) are drawn in the right places.

### 13.1 Team-type worlds

The flagship expansion. At room setup the host picks **what kind of team is playing**, and that choice selects the game's world/theme — same quiz engine, same Grand Prix mode, different stage:

| Team type | World |
|---|---|
| 🏢 Office team *(default)* | Office HQ — the v1 world |
| ⚽ Sports team *(host picks the sport)* | Stadium/arena themed to that sport — pitch-side track, jerseys, crowd |
| 🎮 E-sports team | Neon tournament arena — LAN stage, casters' desk, RGB everything |
| *(more as demand shows)* | e.g. classroom, healthcare, retail crew… |

Because most company teams fit the office setting, Office HQ stays the default and a solo host who never touches the option gets today's experience unchanged. Each world swaps environment, avatar roster, props, VFX styling, and audio identity — but keeps Circuit Break's shared grammar (typography, motion curves, reveal structure, timer language, game-show staging) so every world still feels unmistakably like Circuit Break, not a separate mini-game. Category packs may also be themed per team type (e.g. sports trivia categories for a sports team).

### 13.2 Game modes

Grand Prix is the launch mode. Future modes redefine what a correct answer *does* (Battle, Tower, Treasure Run, Team Showdown) and are selectable independently of the world. Build only on demonstrated demand.

### 13.3 Native mobile

Circuit Break will eventually ship as native iOS/Android apps while **browser play remains a first-class path forever** — a host inviting 15 coworkers can never require an install. The apps are a full product experience (persistent profile, push notifications for scheduled games, haptics, faster startup, game history), not a WebView wrapper. One invitation mechanism: the room QR/link deep-links into the app when installed and falls back to the browser when not. Web and native clients share the same backend, domain rules, scoring, and semantic event protocol (§9); the stage view stays browser-based. Infrastructure is upgraded at the same time (paid hosting, CDN, larger database/realtime tiers) — the free-tier constraint is a v1 validation choice, not an architectural assumption.

### 13.4 Other v2+ candidates

Host accounts with persistent question banks (Supabase Auth) · team mode · image & audio questions · "Most Likely To…" social-vote rounds · optional lane-steering token minigame during questions (the one movement mechanic worth revisiting) · shareable result cards · localization · custom branding / org question banks (commercial).

### 13.5 Expansion decision framework

Don't guess which expansion matters — measure. Signals: games completed, rematch rate, repeat hosts, players per room, share/screenshot behavior, and what users literally ask for ("can we play this as a sports team?" → new world; "can we compete differently?" → new mode; "can we play as teams?" → team mode; "can I use my own questions?" → authoring). Build what the signals request, nothing speculative.

## 14. Decisions Log

| # | Decision | Resolution |
|---|---|---|
| 1 | Game world | **Animated racetrack, event-driven motion only** — no free-roam movement in v1 (Supabase free-tier realtime cost + polish focus). |
| 2 | Tone | **Polished-playful** — premium game-show feel; no sabotage or humiliation mechanics. |
| 3 | Question source | **Curated bank (~240) + per-room host custom questions.** |
| 4 | Accounts & scale | **No accounts in v1; designed for 5–20 players.** |
| 5 | Display model | **Player-complete devices + optional big-screen stage view.** |
| 6 | Host participation | **Host chooses: play along or MC-only.** |
| 7 | Ranking | **Correct answers → speed points → longest streak → sudden death (1st place only).** |
| 8 | Timer | Single global per-question timer, 5–20s, default 10s. |
| 9 | Language | English-only bank at launch. |
| 10 | Product architecture | **Engine ≠ Mode ≠ World.** Quiz engine is theme-agnostic; Grand Prix is a game-mode implementation; the office setting is a world/theme implementation ("Office HQ"), not the product identity. One of each in v1, no speculative abstraction layers. |
| 11 | Worlds roadmap | **Team-type-driven worlds (v2+).** Host picks the team type at setup (office = default, sports w/ sport picker, e-sports, …) which selects the world. Same engine + mode across worlds; shared visual grammar. |
| 12 | Platform strategy | **Web-first, platform-neutral domain.** Native iOS/Android apps later, sharing backend + semantic event protocol; browser join and stage view remain first-class forever; QR/link deep-links to app with browser fallback. |
| 13 | Infrastructure | **Free-tier for validation, not forever.** v1 runs on Vercel + Supabase free tiers; architecture keeps a clean paid-upgrade path (hosting, CDN, database/realtime) for the commercial phase. |
| 14 | Avatars | **Keep the office-object roster in v1** (coffee cup, duck, cat-in-a-tie…) over the suggested human corporate archetypes — more charming, no workplace-stereotype risk, cheaper to animate. Avatar rosters become per-world content in v2+. |
