# Candidate questions — "Coffee is Life"

Draft question bank pulled from `docs/raw/Coffee_presentation_deck_planning.pptx`
(23 slides: caffeine science, coffee history, the four commercial species,
Philippine coffee history, processing/roasting/brewing craft, barista technique,
and trivia). **Nothing here is wired into the app yet** — this is a review list.
Mark the ones you want with `[x]`, delete or edit the rest, and see "Next step"
at the bottom for how the chosen ones get added to the real bank.

## Format

Each entry mirrors the schema already used in `supabase/questions/*.json`
(see `scripts/questionRules.mjs`): a **tier** (1 Warm-Up → 4 Final Boss), a
**prompt**, four **options** with the correct one marked, and a short
**fun fact** shown after the answer. `(Sxx)` cites the source slide.

Not yet decided: a category key/label/emoji. `fuel` already owns `☕`, so
suggest `coffee-is-life` / "Coffee is Life" / `🫘` — confirm before integrating.

52 questions, 13 per tier, across nine topic clusters. Pick freely across
tiers — there's no requirement to take all 13 in a cluster.

---

## Tier 1 — Warm-Up

- [x] **1. (S3)** What does caffeine block in your brain to fight fatigue?
  A) **Adenosine** ✅ B) Dopamine C) Serotonin D) Cortisol
  *Caffeine is shaped closely enough to sit in the same receptors as adenosine — without switching them on. The fatigue is still there; you just stop receiving the message.*

- [x] **2. (S8)** What is "3-in-1" coffee?
  A) A single-origin pour-over B) **An instant coffee, creamer and sugar sachet** ✅ C) A triple espresso shot D) A cold brew concentrate
  *It's how most Filipinos actually drink coffee — no shame in the sachet.*

- [x] **3. (S15)** Which brewing method uses full immersion for about four minutes?
  A) Pour-over B) **French press** ✅ C) Espresso machine D) Moka pot
  *Heavy body, some sediment, and the hardest brewer to ruin.*

- [x] **4. (S17)** A latte is built from two espresso shots and mostly what?
  A) Whipped cream B) Cold foam C) Chocolate syrup D) **Steamed milk** ✅
  *Two shots plus 240 ml steamed milk with about 1 cm of foam is the café's house default.*

- [x] **5. (S11)** A coffee bean starts out as a seed inside what?
  A) A root B) A flower C) A leaf D) **A fruit** ✅
  *How you remove the fruit around the seed decides most of the final flavour.*

- [ ] **6. (S5)** In the popular legend, who discovered coffee after his goats wouldn't sleep?
  A) **Kaldi** ✅ B) Marco Polo C) Ali ibn Omar D) Frederick the Great
  *It's folklore, not history — the real documented start is Sufi monks in 1400s Yemen.*

- [ ] **7. (S22)** Roughly how much of a cup of coffee is just water?
  A) 50% B) 75% C) **98%** ✅ D) 25%
  *Bad water makes bad coffee no matter what you paid for the beans.*

- [x] **8. (S13)** Which grind size does espresso need?
  A) Coarse B) Medium C) **Fine** ✅ D) Medium-coarse
  *Espresso only has about 25 seconds of contact time, so it needs the finest grind of any method.*

- [x] **9. (S7)** Barako coffee comes from which of the four commercial coffee species?
  A) Arabica B) Robusta C) Excelsa D) **Liberica** ✅
  *Barako isn't a brand or roast level — it's a distinct species, and the Philippines is one of the few places that grows it commercially.*

- [ ] **10. (S16)** About how much liquid is in one standard espresso shot?
  A) 10 ml B) **30 ml** ✅ C) 60 ml D) 100 ml
  *Almost every café drink is built on two shots, not one.*

- [x] **11. (S6)** Which Philippine town saw the country's first coffee planted, in 1740?
  A) **Lipa, Batangas** ✅ B) Baguio C) Sagada D) Davao
  *A Spanish friar planted it — coffee reached the Philippines the same way it reached most producing countries: through empire.*

- [x] **12. (S15)** Which brewer is the only one that actually makes real espresso?
  A) Moka pot B) French press C) **Espresso machine** ✅ D) Pour-over
  *9 bars of pressure in 25 seconds — nothing else on the list reaches that, which is also why nothing else can make a real latte.*

- [x] **13. (S13)** Which brew method needs the coarsest grind?
  A) Espresso B) Pour-over C) **French press / cold brew** ✅ D) Drip
  *The longer water sits with the grounds, the coarser the grind needs to be — cold brew steeps for up to 18 hours.*

---

## Tier 2 — Double Shot

- [x] **1. (S3)** About how long does caffeine take to reach peak effect?
  A) 5 minutes B) **45 minutes** ✅ C) 2 hours D) 4 hours
  *Its half-life is about 5 hours, so a 3pm cup is still half in your system at 8pm.*

- [x] **2. (S4)** For long-haul drivers, coffee is described in the deck as the closest thing to what?
  A) A performance enhancer B) **A safety device** ✅ C) A sleep aid D) A social lubricant
  *Drowsy driving is measurably as dangerous as drunk driving, and two cups cuts incident rates on long hauls.*

- [x] **3. (S6)** Coffeehouses in London earned what nickname in the 1600s?
  A) **Penny universities** ✅ B) Bean houses C) Steam parlors D) Java clubs
  *For the price of a coffee, anyone could sit in on the day's news and debate it.*

- [x] **4. (S7)** Robusta accounts for roughly what share of the world's coffee crop?
  A) 10% B) 25% C) **40%** ✅ D) 60%
  *It's bold, rubbery, has roughly double Arabica's caffeine, and makes a great crema.*

- [x] **5. (S8)** What ended the Philippines' run as a top coffee exporter in the 1880s?
  A) A price crash B) **Leaf rust** ✅ C) A trade embargo D) A hurricane season
  *The Philippines was the world's 4th largest coffee exporter until leaf rust wiped out the crop by 1889 — the crown never came back.*

- [ ] **6. (S10)** About how much roasted coffee does a single coffee tree produce in a year?
  A) **450 g** ✅ B) 2 kg C) 50 g D) 5 kg
  *Roughly one retail bag — the bag on your kitchen counter is a whole tree's annual output.*

- [x] **7. (S11)** Which processing method dries the whole cherry in the sun, fruit still on, for weeks?
  A) Washed B) **Natural** ✅ C) Honey D) Wet-hulled
  *It's the riskier method to get right, but it produces heavy, sweet, berry-and-wine notes.*

- [x] **8. (S12)** Which roast level sits at the lowest temperature and highest acidity?
  A) Dark B) Medium-dark C) Medium D) **Light** ✅
  *Light roast isn't under-roasted — it's roasted to keep the origin's own flavour, which is where specialty coffee lives.*

- [x] **9. (S16)** In the standard espresso shot recipe, how many grams of coffee go in?
  A) 7 g B) 12 g C) **18 g** ✅ D) 25 g
  *18 g in, 36 g out, in about 27 seconds — those three numbers are 90% of pulling a shot.*

- [x] **10. (S17)** Which drink is built "upside down," with syrup and milk poured before the espresso shots?
  A) Cappuccino B) Americano C) **Caramel macchiato** ✅ D) Latte
  *Vanilla, milk, then shots poured on top, caramel drizzle to finish — which is why it's "marked," or macchiato.*

- [ ] **11. (S18)** What makes cold brew different from iced coffee?
  A) It uses more milk B) **It never meets heat** ✅ C) It's brewed under pressure D) It uses instant coffee
  *Coarse grounds steep in cold water for 12–18 hours with no heat at all — sweet, smooth, and about two-thirds less acidic.*

- [ ] **12. (S19)** In the deck's ratio cheat sheet, what's the coffee-to-water ratio for filter coffee?
  A) 1:8 B) 1:12 C) **1:16** ✅ D) 1:20
  *That works out to about 30 g of coffee for 480 ml of water.*

- [x] **13. (S4)** The 2–4pm energy slump many office workers feel is described in the deck as what?
  A) A sign of poor sleep B) **A real circadian dip** ✅ C) A caffeine withdrawal symptom D) A myth
  *It's a real dip in the body clock, not weak will — coffee flattens it rather than fixing anything broken.*

---

## Tier 3 — Crunch Time

- [x] **1. (S3)** Roughly what daily caffeine amount is considered the safe adult limit?
  A) 100 mg B) 250 mg C) **400 mg** ✅ D) 600 mg
  *That's roughly four cups a day.*

- [x] **2. (S3)** Caffeine was on the Olympic Committee's banned substance list until what year?
  A) 1988 B) 1996 C) **2004** ✅ D) 2012
  *Research links caffeine to a 2–4% endurance boost — enough that it was once treated as performance-enhancing.*

- [ ] **3. (S5)** By the 1400s, which group was brewing "qahwa" to stay awake through night prayers?
  A) **Sufi monks in Yemen** ✅ B) Ottoman soldiers C) Ethiopian farmers D) Venetian traders
  *Coffee was a religious stimulant long before it was a breakfast drink.*

- [x] **4. (S6)** Coffee reached which three regions as smuggled seedlings in the 1700s, becoming plantations?
  A) **Java, Caribbean, Brazil** ✅ B) Kenya, India, Vietnam C) Mexico, Cuba, Hawaii D) China, Korea, Japan
  *Every coffee-producing country today traces its first seedlings to somebody's colonial project.*

- [x] **5. (S7)** Excelsa, the rarest of the four commercial coffee species, makes up about what share of the world crop?
  A) **Under 1%** ✅ B) About 5% C) About 15% D) About 25%
  *It's tart and dark-fruited; in the Philippines it's grown in Sulu and Basilan.*

- [x] **6. (S13)** What actually determines how coarse or fine a coffee grind should be?
  A) The roast level B) **How long the water stays in contact with it** ✅ C) The bean's species D) The altitude it was grown at
  *Espresso has about 25 seconds of contact time, so it needs a fine grind; cold brew steeps for 16 hours, so it needs a coarse one.*

- [x] **7. (S12)** Which of these is true about dark roast coffee, according to the deck?
  A) It has more caffeine than light roast B) **It has slightly less caffeine than light roast** ✅ C) It has no caffeine D) It has exactly the same caffeine as any roast
  *Roasting burns off a small amount of caffeine, so dark roast is not "stronger" in caffeine — a common myth the deck sets out to kill.*

- [ ] **8. (S15)** About how many bars of pressure does a moka pot use, compared to an espresso machine's 9 bars?
  A) **About 1.5 bars** ✅ B) About 4 bars C) About 6 bars D) 9 bars, same as espresso
  *Steam pushes water through the grounds at low pressure — strong and syrupy, but not technically espresso.*

- [x] **9. (S16)** According to the deck's milk-steaming rule, what temperature should steamed milk stop at?
  A) 45–50°C B) **60–65°C** ✅ C) 75–80°C D) 85–90°C
  *Past 70°C, milk tastes scalded and won't foam again — the jug itself becomes too hot to hold at the right stopping point.*

- [x] **10. (S21)** How many separate historical attempts to ban coffee does the deck list — all of which failed?
  A) 2 B) **4** ✅ C) 6 D) 8
  *Mecca in 1511, Ottoman Istanbul, Sweden in 1746, and Prussia under Frederick the Great all tried and failed to outlaw it.*

- [x] **11. (S21)** In what year did the phrase "coffee break" enter the language?
  A) 1929 B) **1952** ✅ C) 1968 D) 1975
  *It started as an advertising slogan, not a workers' right.*

- [x] **12. (S22)** Kapeng alamid is coffee made from beans that passed through which animal?
  A) **A civet** ✅ B) A goat C) An elephant D) A monkey
  *The beans are eaten and passed by a wild civet, then washed, dried, and sold for thousands a kilo.*

- [ ] **13. (S6)** Coffeehouses appeared in Mecca and Cairo in the 1500s and were met with what?
  A) Immediate royal endorsement B) **Banned, twice** ✅ C) Taxed heavily but tolerated D) Ignored entirely
  *Coffeehouses were banned twice in the 1500s before the drink won out anyway.*

---

## Tier 4 — Final Boss

- [x] **1. (S4)** Beyond the chemistry, what does the deck call coffee's most honest social function?
  A) **The most socially acceptable excuse to stop working and talk to someone** ✅ B) A status signal C) A substitute for alcohol at work events D) A productivity requirement
  *Chemistry explains attention and mood — it doesn't explain why "let's grab coffee" is the easiest excuse there is to talk to someone.*

- [x] **2. (S6)** Coffee first appeared as food, not a drink — how was it consumed in the 800s in the Ethiopian highlands?
  A) Boiled into a broth B) **Chewed** ✅ C) Ground into flour for bread D) Fermented into wine
  *Coffee started as food, chewed rather than brewed, centuries before Yemen's roasting and brewing.*

- [ ] **3. (S7)** Which coffee species is described in the deck as "smoky, woody, jackfruit-floral" with enormous beans?
  A) Arabica B) Robusta C) **Liberica (barako)** ✅ D) Excelsa
  *Liberica beans are dramatically larger than Arabica or Robusta — barako's size is part of its identity.*

- [ ] **4. (S10)** A coffee cherry with only one round seed instead of two flat-sided ones is called what?
  A) A husk bean B) **A peaberry** ✅ C) A flat bean D) A hull cherry
  *Normally two seeds sit flat-side-to-flat-side inside a cherry; a peaberry forms when only one seed develops.*

- [x] **5. (S17)** How is an Americano built, according to the deck's recipe?
  A) **Two shots plus 180 ml hot water** ✅ B) One shot plus 120 ml hot water C) Two shots plus 240 ml hot water D) Three shots plus 90 ml hot water
  *Pouring the water first, under the crema, is how you keep the crema — if that matters to you.*

- [x] **6. (S18)** How is a frappe built, according to the deck's recipe?
  A) **Two shots, 120 ml milk, a full cup of ice and sauce, blended** ✅ B) One shot, 60 ml milk, blended with sugar C) Three shots poured over crushed ice D) Two shots, no milk, shaken with ice
  *It's the best-selling drink in most Philippine cafés — cold drinks are where local cafés make their money.*

- [x] **7. (S21)** About how many kilograms of coffee does the average person in Finland drink per year?
  A) 4 kg B) 8 kg C) **12 kg** ✅ D) 16 kg
  *That's roughly four cups a day for every person, including babies — the Philippines drinks roughly 1 kg per person by comparison.*

- [x] **8. (S21)** What everyday piece of technology was invented so researchers wouldn't climb the stairs to an empty coffee pot?
  A) The vending machine B) **The webcam** ✅ C) The smart fridge D) The electric kettle
  *In 1991, the first webcam ever built was pointed at a coffee pot in Cambridge.*

- [x] **9. (S21)** Composer Ludwig van Beethoven reportedly counted out exactly how many coffee beans per cup, every morning?
  A) 40 B) 50 C) **60** ✅ D) 100
  *The deck calls him "the first documented coffee snob."*

- [x] **10. (S22)** Coffee is the world's second most-traded commodity, after which one?
  A) Gold B) **Oil** ✅ C) Wheat D) Cotton
  *Around 2.25 billion cups of coffee are drunk every day worldwide.*

- [ ] **11. (S21)** Roughly how many smallholder families grow most of the world's coffee, mostly on under two hectares of land?
  A) 2 million B) 10 million C) **25 million** ✅ D) 50 million
  *Most of the world's coffee comes from small family farms, not large plantations.*

- [x] **12. (S21)** Decaf coffee is not caffeine-free — about how much caffeine does a cup still carry?
  A) 0 mg B) **2–5 mg** ✅ C) 20–25 mg D) 50 mg
  *"Decaffeinated" is not the same claim as "caffeine-free."*

- [x] **13. (S16)** What's the correct way to judge when steamed milk is ready, according to the deck?
  A) **Swirl it so it pours glossy, like wet paint, not stiff bubbles** ✅ B) Spoon off the foam to check thickness C) Time it to exactly 10 seconds regardless of sound D) Heat until it stops steaming
  *Stiff bubbles mean the milk was stretched too long — good microfoam pours like wet paint.*

---

## Not used

A few slide beats didn't turn into questions — mostly because they're not
factual/quiz-shaped (the deck's personal framing on S1/S23, the "why coffee
matters to four kinds of people" narrative on S4 beyond the driver/circadian
facts already used, and the closing thank-you). Say if you want any of those
worked in anyway.

## Next step

Once you've marked your picks:

1. I'll add a `coffee-is-life` (or whatever key you prefer) entry to
   `CATEGORY_KEYS`/`CATEGORY_LABELS` in `scripts/questionRules.mjs` and to
   `CATEGORIES` in `lib/rank.ts` (both must match — a test pins them equal).
2. Write the chosen questions into a new `supabase/questions/coffee-is-life.json`,
   matching the exact schema above (`tier`, `prompt`, `options`, `correctIndex`, `funFact`).
3. Run the bank's own validator/report (`node scripts/build-questions-sql.mjs` /
   whatever `pretest` runs) to check the 200/80/240-char limits, the
   10-per-(category,tier) floor, and the correct-answer balance rules in
   `scripts/questionRules.mjs` — option order above was picked for readability,
   not for those balance rules, so a few may get reordered at that stage.
4. Regenerate `supabase/seed.sql` from the JSON (never hand-edited, per ADR-0053).
