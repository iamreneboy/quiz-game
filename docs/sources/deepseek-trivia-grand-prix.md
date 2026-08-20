# Trivia Grand Prix — Game Design Document

## Game Concept
Players join a colourful, browser-based virtual race track. Each correct answer pushes their avatar one step forward. The first to cross the finish line wins. During every question, you don’t just sit there — you can steer your avatar left and right to collect bonus tokens, but only your trivia knowledge determines your position on the track. Bonus tokens and answer speed are tie-breakers, exactly as you requested.

---

## 1. Fun Office-Friendly Categories

In addition to Movies, AI and Technology, here are categories that make people laugh, reminisce, and argue playfully:

- **Pop Culture & Nostalgia** – 90s music, classic TV shows, retro toys.
- **Food & Drink** – Guess the dish from the ingredients, coffee culture, weird snacks from around the world.
- **Office Life & Jargon** – “Circle back”, meeting bingo, printer drama, desk lunch etiquette.
- **Internet Memes & Viral Moments** – Identify the meme, caption this, “Distracted Boyfriend” level questions.
- **Music & Lyrics** – Finish the lyric, name the song from emojis, iconic intro riffs.
- **Famous Quotes & Movie Lines** – Who said it? Real or movie?
- **Brand Logos & Slogans** – Cropped logos, fake slogans, guess the brand.
- **Travel & Geography (fun edition)** – Flags that look alike, “where is this weird landmark?”, street food origin.
- **Weird Science & Nature** – Animals doing bizarre things, unbelievable but true facts.
- **Corporate Fails & Tech Blunders** – Famous company blunders, accidental inventions.
- **Wordplay & Riddles** – Rebus puzzles, homophones, tricky brain teasers (light-hearted, not mathy).

The host can mix and match or let the system pull randomly from all categories.

---

## 2. Host Workflow

### Create a Game
- Give the game a name and an optional password/room code.
- Choose the question source:
  - **Single Category** – pick one fun category.
  - **Mixed** – manually select several categories.
  - **Random** – system draws from all available categories.
- Set the difficulty breakdown: number of Easy, Medium, Hard, Expert questions (e.g., 5 / 7 / 5 / 3 = 20 total).
- Adjust timer duration (default 10 seconds).
- Decide on tie-breaker elements:
  - Enable/disable track collectibles (movement mini-game).
  - Speed bonus tiers (e.g., 2s → +3 TB, 5s → +2, 10s → +1).
- Question input:
  - **Use bank** – browse pre-loaded questions filtered by category & difficulty; select the exact ones you want.
  - **Manual entry** – type question, four multiple-choice answers, mark the correct one, assign a difficulty.
- Generate the room link and share it.

### Lobby
- Players join via link, enter a nickname, and pick a fun avatar: coffee cup, sneezing panda, office plant, robot, cat in a tie, etc.
- Avatars mill about in a waiting area (a virtual paddock) with a chat box for banter.
- The host sees the player list and clicks **Start Race**.

---

## 3. Visual Environment & Movement Integration

### The Race Track
A 2.5D side-scrolling or top-down cartoon racetrack rendered in the browser. The track is divided into segments – one segment for each correct answer. The length of the track equals the total number of questions. A big finish arch marks the end.

- **Avatars** line up at the start line.
- After each correct answer, the avatar zooms forward by one segment (with dust clouds, engine revs, or silly sound effects).
- The track has 3–5 lanes. During the question timer, tokens (stars, coffee beans, power cells) spawn at random in different lanes.

### Movement During a Question
While the question and answer buttons are on screen, players can also move their avatar left/right using **arrow keys/WASD** (desktop) or a **virtual joystick** (mobile) to switch lanes and collect tokens. This is a light multitasking element – answer trivia, and also steer for bonus goodies.

- Each collected token gives **+1 Tiebreaker Point**.
- To add strategy, you could include:
  - **Golden tokens** worth +3 TB but rare.
  - **Banana peels** that spin your avatar out (fun animation, no point penalty).
  - **Boost pads** that give a one-question speed bonus if you collect three in a row.

Because movement is completely optional and only yields tiebreaker points, a pure trivia player who doesn’t steer can still win outright by answering more questions correctly.

---

## 4. Scoring System (Tie-Break Only)

This is the heart of your fairness rule.

- **Primary ranking**: **Correct Answer Count (C)**  
  Every correct answer = +1 C.  
  The player with the highest C wins. Always.

- **Secondary metric (tie-breaker)**: **Total Tiebreaker Points (T)**
  `T = Speed Bonus + Tokens Collected`

  - **Speed Bonus** (awarded only on correct answers):  
    - ≤2 seconds: +3 TB  
    - ≤5 seconds: +2 TB  
    - ≤10 seconds: +1 TB  
    - >10 seconds or timed out: 0 TB (incorrect → 0 C, 0 TB)
  - **Tokens Collected**: each token = +1 TB (or as defined).

When two or more players finish with the same C, the one with the higher T ranks above. If still tied, the system could fall back to fastest cumulative answer time or simply declare a tie.

### Why This Works
- Knowledge is king – no amount of collecting can overtake someone who simply answers more questions correctly.
- In a tie, the player who combined speed and attentiveness (collecting while thinking) gets the edge, rewarding well-rounded play.

---

## 5. Leaderboard & Round Progress – Fun Visuals

### During the Race (Live Track)
The main screen is the race track itself. Every player sees all avatars in their relative positions. The track acts as a live leaderboard:

- **Correct Answer Count** is shown by avatar position – the farther along the track, the more correct answers.
- When two avatars are on the same segment (same C), the one with higher T appears ever so slightly ahead, maybe with a small glowing turbo flame.
- Desktop users can see all racers spread out.  
  Mobile users see the track and can scroll sideways to see more, but a persistent mini podium in the corner shows top 3.

### Round Transition
After each question:
- Correct answers: avatar leaps forward, crowd cheers, a celebratory emote pops above (party popper, thumbs up).
- Incorrect answers: avatar coughs out a puff of smoke, shakes head, stays put.
- A brief pop-up shows round stats: “8 players answered correctly. Fastest: @Sarah (1.4s)”.
- Then the track camera re-centres on the lead pack.

### Visual Enhancements
- **Top 3 players** get a glowing aura and a crown/medal on their avatar, visible to everyone.
- The leader in correct answers gets a permanent trail of sparkles.
- The track itself evolves – starting in a sunny office park, moving through a neon city, ending in a victory stadium.

---

## 6. End Game

- The player who crosses the finish line first (most correct answers, tie-broken by T) is the winner.
- Full celebration sequence: confetti, avatar on a podium, “Champion” badge.
- Host sees a detailed scoreboard: C, total TB, tokens collected, fastest answer, etc.
- Option to download results as a fun “race card” PDF.

---

## 7. Why This Makes It Engaging

1. **Visual dopamine** – seeing your avatar race ahead after a correct answer is far more exciting than a plain scoreboard.
2. **Movement adds skill variety** – steering to collect tokens is satisfying and gives less trivia-inclined players a small side quest without ruining the main competition.
3. **Tension from tie-breaks** – the token chase becomes thrilling when two knowledge-equals are neck-and-neck.
4. **Office humor baked in** – categories and avatars keep the tone light, social, and non-intimidating.
5. **Spectating fun** – eliminated or slower players still enjoy watching the race and cheering.

---

## 8. Technical & UX Notes

- Use a simple 2D canvas or a lightweight WebGL framework (like Phaser or PixiJS) for smooth animation on all devices.
- Keep the virtual world playful with cartoon graphics, not photorealistic – “VR-like” in the sense of a shared space, not a heavy headset experience.
- Allow host to re-use the same game configuration with a “Play Again” button, optionally reshuffling questions.