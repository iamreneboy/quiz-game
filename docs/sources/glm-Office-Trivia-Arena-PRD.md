# Product Requirements Document (PRD)

## Project Name: Office Trivia Arena (Working Title)

### 1. Product Overview

**Office Trivia Arena** is a browser-based, multiplayer trivia game designed for office teams and casual groups. It combines fast-paced trivia mechanics with a 2.5D isometric virtual arena, allowing players to move around, collect items, and visually interact while competing.

The game prioritizes **knowledge as the ultimate win condition**, using movement and strategy purely as a tiebreaker and engagement booster.

### 2. Target Audience

- Corporate teams looking for engaging icebreakers or team-building activities.
- General office employees needing a quick, fun, low-barrier distraction.
- Friends hosting casual trivia nights via browser.

### 3. Core Game Loop

1. **Host Setup:** Host creates a room, configures trivia rules (categories, difficulties, question count), and curates/adds questions.
2. **Lobby:** Players join via Room Code/QR code, pick an avatar, and spawn into the isometric arena.
3. **Trivia Phase:** A question appears. Players have a set time (default 10s) to answer via UI overlay.
4. **Movement Phase (Concurrent):** While answering, players move around the arena collecting "Swag Coins" and power-ups.
5. **Scoring:** Correct answers yield "Brain Points" (based on speed). Collected coins yield "Swag Coins" (tiebreaker currency).
6. **Visual Updates:** Avatars gain visual upgrades based on correct answers. The "Corporate Ladder" leaderboard updates.
7. **Endgame:** Winner is declared. Ties are broken by Swag Coins. Winner receives a digital certificate.

---

### 4. Host Features & Game Setup

The host has granular control over the game configuration before the match starts.

#### 4.1 Room Creation

- Host generates a unique Room Code and QR Code.
- Host waits in a "Lobby View" and can see players joining in real-time.
- Host clicks **Start Game** when ready.

#### 4.2 Category Selection

Host selects one of the following distribution modes:

- **Single Category:** All questions pulled from one category.
- **Mixed Categories:** Host selects multiple specific categories.
- **Random:** Questions pulled randomly from all available categories.

**Pre-defined Categories (Office-Tuned):**

- *Pop Culture & Streaming* — Movies, Netflix, Music
- *Tech & AI* — Gadgets, Silicon Valley lore, AI trends
- *Watercooler Trivia* — Trivia from *The Office*, *Silicon Valley*, corporate buzzwords
- *Food & Coffee* — World cuisines, coffee chains, snack facts
- *Nostalgia* — 90s/00s cartoons, toys, early internet
- *Geography & Travel* — Capital cities, weird landmarks

#### 4.3 Difficulty & Question Configuration

- Host sets the number of questions per difficulty level using sliders or input fields.

**Difficulty Tiers:**

- *Sip of Coffee* — Easy
- *Brainstorm Session* — Intermediate
- *Existential Crisis* — Hard
- *Caffeine Overload* — Extra Hard

**Question Curation:**

- Host views a checklist of pre-defined questions based on selections and can deselect unwanted ones.
- Host can **Add Custom Question** with:
  - Question text
  - Correct answer
  - Multiple-choice options
  - Difficulty tag

#### 4.4 Match Settings

- **Timer:** Configurable time limit per question. Default: 10 seconds.
- **Arena Selection:** Host picks the visual map, such as Breakroom, Cubicle Maze, or Rooftop.

---

### 5. Player Experience & UI

#### 5.1 The Arena (2.5D Isometric View)

- **Visuals:** Top-down 2.5D isometric map. Lightweight, browser-friendly, mobile-responsive.
- **Controls:**
  - Desktop: WASD or Arrow keys to move.
  - Mobile: Virtual joystick overlay.
- **Avatars:** Players choose a simple avatar (Blob, Robot, or Office Worker) with their name floating above.

#### 5.2 Trivia UI Overlay

When a question drops, a holographic monitor appears in the center of the arena.

A UI overlay appears on the player's screen displaying:

- The question
- Four multiple-choice options
- A circular countdown timer

Players tap/click an option. Once submitted, their choice is locked in, but they can continue moving.

#### 5.3 Avatar Visual Enhancements (Flair)

Avatars dynamically upgrade based on consecutive or total correct answers to visually identify the leaders:

| Achievement | Visual Effect |
|---|---|
| 1 Correct | Glowing halo around avatar |
| 3 Correct | Avatar grows 10% larger |
| 5 Correct | Floating crown appears |
| Fastest Answer in Round | Rainbow movement trail for the next round |
| Wrong Answer | Avatar shrinks into a "sad dust bunny" for 3 seconds |

---

### 6. Scoring & Win Conditions

The scoring system is explicitly designed to ensure the most knowledgeable player wins, while keeping movement relevant but secondary.

#### 6.1 Brain Points (Primary Score)

- Awarded **only** for correct trivia answers.
- **Base Points:** 100 points per correct answer.
- **Speed Bonus:** Up to +50 additional points based on how fast the answer was submitted.
  - Example: Answering in 2 seconds = +50.
  - Example: Answering at 9 seconds = +5.
- **Rule:** Brain Points are the sole determinant of the primary leaderboard rank.

#### 6.2 Swag Coins & Movement (Tiebreaker)

- While the question is active, "Swag Coins" (or Coffee Cups) spawn randomly in the arena.
- Players move their avatars over the coins to collect them.

**Power-ups (Occasional):**

- *Double Coffee:* Doubles coin collection rate for 5 seconds.
- *Office Gossip:* Reveals the percentage of players who chose each answer so far.

**Tiebreaker Logic:**

If two or more players have the exact same Brain Points at the end of the game, the player with the most Swag Coins wins.

---

### 7. Leaderboard: The "Corporate Ladder"

Instead of a static UI text box, the leaderboard is rendered visually as a vertical tower on the side of the screen.

- **Desktop View:** Displays the full tower. All player avatars stand on platforms. Platforms physically rise and fall as scores update in real-time.
- **Mobile View:** Zooms in to show the Top 3 players at the top of the screen, with a floating **"You: Rank X"** UI element at the bottom.
- **Intermission:** Between rounds, a 5-second intermission occurs where the map floods with new coins. Players scramble to position themselves before the next question drops.

---

### 8. Endgame & Resolution

- The final question triggers a visual spectacle: the arena goes dark and neon lights flash.
- The Corporate Ladder locks into its final position.
- **Overtime/Tiebreaker Sequence:** If there is a tie in Brain Points, the screen flashes **"OVERTIME"**. The tied players' Swag Coins are tallied live on screen, similar to a slot-machine reveal, to determine the ultimate winner.
- **Reward:** Confetti drops. The winning player's screen displays a downloadable/shareable **"Employee of the Month"** digital certificate.

---

### 9. Technical Requirements (Suggested Stack)

- **Frontend Framework:** React.js or Vue.js for UI components and Host dashboard.
- **Game Engine:** Phaser.js or PixiJS for rendering the 2.5D isometric arena and avatar movement.
- **Backend:** Node.js with Express.
- **Real-time Communication:** WebSockets (Socket.io) for low-latency player movement, scoring, and state syncing.
- **Database:** Redis for ephemeral game state/rooms + PostgreSQL or MongoDB for storing predefined and custom questions.

---

### 10. Out of Scope (For V1)

- Full 3D VR integration (WebXR).
- Player accounts and persistent global progression. Players play as **Guests** for V1.
- Voice chat. Use external tools such as Zoom or Teams for audio.
- Advanced anti-cheat for movement mechanics. Keep it simple and trust-based for V1.
