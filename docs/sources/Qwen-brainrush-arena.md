# PRD — BrainRush Arena

| | |
|---|---|
| **Document** | Product Requirements Document |
| **Version** | 0.2 — Revised after stakeholder review |
| **Date** | August 2, 2026 |
| **Status** | ✅ Decisions logged — ready for sign-off |
| **Working title** | BrainRush Arena |

### Version History

| Version | Date | Notes |
|---|---|---|
| 0.1 | Aug 2, 2026 | Initial draft |
| 0.2 | Aug 2, 2026 | Clutch tiebreak layer added; participation Hustle removed; host accounts + custom questions pulled into v1; all §13 questions resolved |

### What Changed in v0.2

| ID(s) | Change |
|---|---|
| FR-404, **new FR-406** | New 💀 **Clutch** tiebreak layer — correct Insane answers outrank Quickdraw when Stars are level |
| FR-403 | Participation Hustle (+2 per answer) **removed** |
| FR-106 | Explicitly a **single global timer** for all tiers |
| NFR-05, §10 | Host accounts + custom question authoring **moved to v1** |
| G6 (new) | Full-silly tone locked in |
| §9 | English-only bank at launch |
| §13 | Open questions → **Decisions Log** |

Revised items are marked **▲** inline below.

---

## 1. Summary

BrainRush Arena is a browser-based, host-driven party quiz for groups (primarily office teams). Players join as avatars in a shared 2.5D arena, answer synchronized questions under time pressure, and roam between rounds to collect power-ups, coins, and positional advantages. The arena itself contains the leaderboard (a racetrack), so standings are always visible, animated, and part of the world — never a spreadsheet.

**One-line pitch:** *Kahoot's simplicity, Jackbox's silliness, and a mini-MMO arena — where knowledge always wins, nerve breaks the first tie, and hustle breaks the last.*

## 2. Problem & Opportunity

Existing quiz tools are functional but static: a question, a timer, a table of names. They test recall but produce little social energy, no movement, and no memorable moments. The opportunity is a quiz that feels like a *place* — with physical positioning, light strategy, visual status, and ceremony — while remaining fair enough that the best quizzer always wins.

## 3. Goals / Non-Goals

**Goals**
- G1 — A host with zero training can configure and run a full game in under 3 minutes.
- G2 — Competitive fairness: highest correct count always determines rank (see §5 Invariants).
- G3 — Movement and strategy meaningfully influence outcomes *without* violating G2.
- G4 — The game produces shareable moments (streaks, upsets, sudden death, podium).
- G5 — Runs entirely in-browser on desktop and mobile; no installs.
- **▲ G6 — Tone is full silly: confetti, emotes, over-the-top announcements, chaos. The single guardrail is that sabotage ships default-off.**

**Non-Goals (this version)**
- Native mobile apps, player accounts/social graph, monetization, user-generated public content, VR hardware support, math/academic curriculum content, non-English content.

## 4. Roles & Personas

| Role | Description |
|---|---|
| **Host / Director** | Creates the game, curates questions, runs the show live. Persona: the team's social organizer — wants control, low prep, and to look like a great MC. |
| **Player** | Joins via code/link, answers on their device, moves an avatar in the arena. Sub-personas: *The Competitor* (wants rankings), *The Casual* (wants to not feel dumb), *The Chaos Agent* (wants sabotage & emotes). |
| **Spectator** | Ghost view for late joiners, AFK players, and disconnected players. Sees everything, affects nothing. |

## 5. Core Invariants (do not break)

1. **▲ The Balance Law.** Ranking is strictly lexicographic: **Stars → Clutch → Quickdraw → Hustle**. No amount of nerve, speed, or movement can outrank one additional correct answer — but with Stars level, answering an Insane question outranks raw speed.
2. **Synchronized fairness.** Every player sees the same question at the same moment with the same timer, server-authoritative.
3. **No elimination.** Everyone plays every round; nobody sits out mid-game.
4. **Host is god.** The host can pause, skip, and trigger events at any time.

## 6. Glossary

| Term | Definition |
|---|---|
| ⭐ **Star** | 1 per correct answer. Primary ranking currency. |
| **▲ 💀 Clutch** | 1 per 💀 Certified Insane question answered correctly. Ice in the veins. Tiebreaker #1. |
| ⚡ **Quickdraw** | Speed bonus on correct answers. Tiebreaker #2. |
| 🔥 **Hustle** | Points from movement, pickups, streaks, scrambles. Tiebreaker #3. |
| **Tier** | Difficulty level: 🍿 Warm-Up · 🌶️ Spicy · 🧠 Brain-Sweat · 💀 Certified Insane. |
| **Scramble** | A movement-only break round where coins rain into the arena. |
| **Hot Spot** | A drifting bonus circle; correct answer inside it grants extra Hustle. |
| **Sudden Death** | Single tiebreaker question for a perfect rank tie; first correct wins. |

---

## 7. Functional Requirements

### 7.1 Game Creation & Lobby

| ID | Requirement |
|---|---|
| FR-101 | Host MUST be able to create a game with a custom name and receive a short join code + QR code. |
| FR-102 | Host MUST choose a category format: **single category**, **mixed** (2–5 categories), or **Chaos** (all categories randomized). |
| FR-103 | Host MUST set a difficulty mix via sliders (questions per tier, e.g. 5/4/2/1). The UI SHOULD show estimated game duration live. |
| FR-104 | The system MUST auto-draw questions from the bank matching the selected categories/mix. Host MUST be able to preview, veto, and swap individual drawn questions before starting. |
| FR-105 | Host MUST be able to add **custom questions**: prompt, 2–6 options, correct answer(s), tier, category. Custom questions merge into the draw pool. |
| **▲ FR-106** | Host MUST be able to toggle: power-ups, sabotage (default **OFF**), team mode (v3), and set a **single global answer timer (6–20s, default 10s) applied equally to all tiers**. |
| FR-107 | The lobby MUST support avatar creation (shape, color, accessory) and a free-roam "playground" with emote pads while waiting. |
| FR-108 | The game MUST be startable with ≥2 players. Recommended minimum surfaced in UI: 3. |

### 7.2 Categories & Content

| ID | Requirement |
|---|---|
| FR-201 | Launch categories: 🎬 Rewind (Movies & TV) · 🤖 AI & Tech · 💼 Corporate Survival · 📼 90s/2000s Nostalgia · 🍕 Snack Attack · 🎵 Name That Tune · 🐸 Meme History · 🏷️ Brand Spotting · 🌍 Wait, Really? · 🏟️ Sports Moments · 🎮 Press Start · 🤔 Most Likely To… |
| FR-202 | Every banked question MUST include: prompt, options, correct answer, tier, category, and a **fun-fact card** displayed on the reveal screen (host reads it aloud). |
| FR-203 | A question MUST NOT repeat within a single game. |
| FR-204 | "Most Likely To…" rounds MUST be scored as social votes (no wrong answer): all voters earn +5 Hustle; majority voters earn +15. |

### 7.3 Round Flow

| ID | Requirement |
|---|---|
| FR-301 | Each standard round MUST follow: **READ (2s) → ANSWER (configurable, default 10s) → REVEAL (4s) → INTERMISSION (8s) → BOARD MOMENT (4s)**. |
| FR-302 | The question and timer MUST render simultaneously on the arena's central screen and every player device. Timer is server-authoritative. |
| FR-303 | During READ and ANSWER phases, avatar movement MUST be locked. During INTERMISSION, movement MUST be unlocked. |
| FR-304 | Every 4th round MUST be replaced by a **Scramble Break**: 12s coin rain, no question. |
| FR-305 | The reveal screen MUST show: correct answer, distribution of picks (avatar bar chart), the fastest correct player ("QUICKDRAW!" stamp), and the fun-fact card. Insane reveals get escalated staging (lights dim, skull sting). |
| FR-306 | Game states: `LOBBY → COUNTDOWN → [READ → ANSWER → REVEAL → INTERMISSION → BOARD] × N → TIE_CHECK → (SUDDEN_DEATH) → PODIUM → (REMATCH?)`. `SCRAMBLE` substitutes READ/ANSWER/REVEAL on break rounds. Host `PAUSE` overlays any state. |

### 7.4 Scoring & Ranking (The Balance Law)

| ID | Requirement |
|---|---|
| FR-401 | A correct answer MUST award exactly **1 Star**, regardless of tier or speed. Stars are the primary sort key. |
| FR-402 | A correct answer MUST award Quickdraw = `⌊(timeLeft / totalTime) × 50⌋ × tierMultiplier`, where tierMultiplier = 1 / 2 / 3 / 4 for Warm-Up → Insane. Max 200/round. |
| **▲ FR-403** | A wrong or missing answer MUST award **no currency of any kind** — there is no participation floor. Hustle is only obtainable via pickups, scramble coins, the Hot Spot, emote pads, streak milestones, and social-vote rounds (FR-204). |
| **▲ FR-404** | Ranking MUST sort by **Stars desc → Clutch desc → Quickdraw desc → Hustle desc**. |
| FR-405 | A perfect tie after all four currencies MUST trigger **Sudden Death**: one Insane-tier question; **first correct answer wins the game**. A wrong answer does not eliminate — play continues until the first correct. |
| **▲ FR-406** | Each 💀 Certified Insane question answered correctly MUST award **1 Clutch**, in addition to its Star (FR-401) and Quickdraw (FR-402). The number of Insane questions in the host's mix (FR-103) sets the maximum Clutch available; a game with zero Insane questions simply skips the Clutch layer. The difficulty mixer UI SHOULD surface this ("Insane questions decide ties first"). |

**▲ Worked example (the scenario that drove this rule):** Players A and B both finish **9/10**. B answered the Insane question; A missed a Spicy one instead.

| | ⭐ Stars | 💀 Clutch | ⚡ Quickdraw | 🔥 Hustle | Result |
|---|---|---|---|---|---|
| Player A | 9 | 0 | 480 | 300 | — |
| Player B | 9 | 1 | 210 | 40 | **Wins on Clutch** |

And the invariant still holds: 10 Stars beats 9 Stars no matter what the other columns say.

### 7.5 Arena & Movement

| ID | Requirement |
|---|---|
| FR-501 | Avatars MUST be controllable via WASD/arrow keys (desktop) and a virtual joystick (mobile). Movement speed is identical for all players. |
| FR-502 | **Answer Zones:** For True/False and 2-option questions, answers MUST be physical pads in arena corners; a player's answer is only valid if they are standing on a pad when the timer ends. |
| FR-503 | **Pickups** MUST spawn at random arena locations during intermissions. Players hold max 2; collection cap 8 per game. |
| FR-504 | Pickup set (v2): ⚡ Espresso (2× Quickdraw on next correct) · 🔮 Oracle (removes half the wrong options) · 🐌 Glitch Grenade (bump a rival → blurred screen or inverted controls for first 3s of next round) · 🛡️ Shield (blocks one glitch) · 🧲 Coin Magnet (auto-collects next scramble) · 🎁 Mystery Box (random). |
| **▲ FR-505** | Glitch Grenade MUST only be usable if the holder answered the previous question correctly, and only one may be held at a time. Sabotage ships **default OFF**; host opts in per game. |
| FR-506 | **Hot Spot:** A glowing circle MUST drift around the arena each round; a correct answer while inside it awards +25 Hustle. |
| FR-507 | **Scramble coins:** 30 coins per break (values 1/3/5). Rubber-banding: spawn distribution SHOULD bias slightly toward trailing players. |
| FR-508 | Emote pads on dance tiles award +2 Hustle, capped at 3 awards per player per intermission. |

### 7.6 Leaderboard & Progression

| ID | Requirement |
|---|---|
| FR-601 | The leaderboard MUST be a **racetrack ringing the arena**: each Star advances an avatar one segment; Quickdraw triggers a visible boost animation. |
| FR-602 | Display MUST adapt to device: desktop/laptop = full standings (all players, all currencies); tablet = top 5 + "You: P#" chip; mobile = top 3 + "You: P#" chip. The "You" chip is mandatory on all devices. |
| FR-603 | Top-3 players MUST receive visual upgrades: gold/silver/bronze crowns, colored trails; the leader's avatar glows and renders slightly larger. |
| FR-604 | Streak VFX: 3 correct = smoke, 5 = flames, 8 = inferno + arena-wide announcement. Streak milestones award +10 / +25 / +50 Hustle. |
| FR-605 | The fastest correct answer each round MUST trigger a lightning-zap animation on that avatar. |

### 7.7 Ceremony & Awards

| ID | Requirement |
|---|---|
| FR-701 | Game end MUST conclude with a podium ceremony: top-3 podium rise, confetti, winner fanfare. |
| FR-702 | The ceremony MUST present stat awards: 🧠 Big Brain (most Stars) · 💀 Ice in the Veins (most Clutch) · ⚡ Fastest Gun (most Quickdraw) · 🦝 Scavenger (most Hustle) · 🔥 Hot Streak (longest streak). |
| FR-703 | Host MUST be offered a **Rematch** action: same players, same or re-edited config. |

### 7.8 Host Director Controls

| ID | Requirement |
|---|---|
| FR-801 | During the game, host MUST be able to: pause/resume, skip the current question, trigger a coin rain, and trigger a double-Hustle round. |
| FR-802 | Host view MUST display the current question's fun-fact card and answer distribution in real time. |
| FR-803 | Host MUST be able to remove a player at any time. |

### 7.9 Session Edge Cases

| ID | Requirement |
|---|---|
| FR-901 | **Late join:** players MAY join at any time; they enter as ghost spectators and materialize at the next BOARD moment. |
| FR-902 | **AFK:** 2 consecutive unanswered rounds → avatar enters nap state (no scoring). 4 consecutive → moved to spectator. Host can reinstate. |
| FR-903 | **Disconnect:** 60s reconnect grace with score frozen; after grace, player becomes spectator. |
| FR-904 | Answers are validated server-side against the round clock; a 150ms network grace window MUST be applied. |

---

## 8. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | Server-authoritative round clock; client display drift < 250ms. |
| **▲ NFR-02** | Support **2–40 players per lobby (MVP cap: 40)**; latest 2 versions of Chrome, Edge, Safari, Firefox; iOS Safari 16+, Android Chrome. |
| NFR-03 | Arena renders at 60fps target on mid-tier hardware, with automatic particle-effect degradation on low-end devices. |
| NFR-04 | Accessibility: colorblind-safe answer/zone palette; text fallback for audio rounds; reduced-motion mode; scalable UI text. |
| **▲ NFR-05** | **Host accounts ship in v1** and persist question banks (custom questions included). Players join anonymously via code. Custom questions are private to the host's lobbies. |

## 9. Content Requirements

- **▲ Language:** Question bank is **English-only at launch**.
- **MVP bank:** 4 categories (Rewind, AI & Tech, Corporate Survival, 90s Nostalgia) × 4 tiers × ≥12 questions = **192 questions minimum**.
- **Full launch:** all 12 categories at the same density (~576 questions).
- All questions authored with fun-fact cards. AI-assisted drafts allowed only with human review before publication.

## 10. Release Plan ▲

| Phase | Scope |
|---|---|
| **v1 — MVP** | **Host accounts + custom question authoring with saved banks**, lobby & codes, classic MCQ, answer zones, scramble breaks, Hot Spot, emote pads, racetrack board, **4-currency scoring (Stars/Clutch/Quickdraw/Hustle)**, 4 categories, director basics, podium + awards, rematch. |
| **v2** | Pickups & sabotage (Glitch Grenade etc.), streak/crown/flame VFX, audio & emoji rounds, remaining 8 categories. |
| **v3** | Team mode, wager rounds, arena skins, ceremony polish. |

## 11. Success Metrics

| Metric | Target |
|---|---|
| % created lobbies that start a game | ≥ 70% |
| % started games reaching the podium | ≥ 85% |
| Games decided by Stars alone vs. tiebreakers | Track; Sudden Death < 10% of games |
| **▲ % games configured with ≥1 Insane question** | ≥ 80% (validates the Clutch layer) |
| Weekly returning hosts | ≥ 30% |
| % games including custom questions | ≥ 25% |
| Round-by-round player drop-off | < 5% per round |

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Real-time sync complexity | Server-authoritative clock from day one; MVP tested on low-latency regions. |
| Content authoring bottleneck | Custom questions + AI drafts with human review; start with 4 categories. |
| Mobile performance in arena | Automatic effect degradation; arena is 2.5D, not full 3D. |
| Sabotage friction in corporate settings | Default OFF; host opt-in only. |
| **▲ Hosts set zero Insane questions, making Clutch inert** | Mixer UI surfaces "Insane questions decide ties first"; default mix includes 1 Insane. |
| Question repetition across repeat games | Per-lobby dedupe + shuffle; bank rotation by quarter. |
| Music licensing for Name That Tune | Royalty-free covers / licensed library only (flagged for legal review). |

---

## 13. Decisions Log ▲

| # | Question | Resolution |
|---|---|---|
| 1 | Weighted Stars toggle | **No 2× Stars.** New 💀 Clutch tiebreak layer instead: a correct Insane answer outranks Quickdraw when Stars are level (FR-404, FR-406). |
| 2 | Timer scaling | **Single global timer**, all tiers (FR-106). |
| 3 | Lobby cap | **40 players** for MVP (NFR-02). |
| 4 | Sabotage | **Default OFF** (FR-505). |
| 5 | Host accounts | **v1** — required to save custom questions; custom authoring moves to v1 with it (NFR-05, §10). |
| 6 | Team mode | **v3** (§10). |
| 7 | Sudden Death | **First correct wins** (FR-405). |
| 8 | Bank language | **English-only** at launch (§9). |
| 9 | Participation Hustle | **Removed** — no floor; Hustle is earned, never given (FR-403). |
| 10 | Tone | **Full silly** — confetti, emotes, chaos (G6). |