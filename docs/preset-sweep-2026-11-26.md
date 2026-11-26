# Preset sweep, 2026-11-26

A full pass over all 40 presets in `app/src/core/templates.ts`, read from what each one actually builds (summary rows, days, fields). Nothing here is changed yet; it is a list for Nick to go over. Each line is a suggestion with the reason, not a decision.

## The big pattern

The Target row made one gap obvious: 33 of 40 presets start at "Any entry counts". For check-ins and journals that is right. For trackers with a natural number it under-sells them, and for trackers that are really readings (weight, blood pressure) "a good day is logging it" is the wrong idea entirely. Most suggestions below are one of three fixes:

1. **Give it a starting target** where there is a widely used number (8 glasses, 7 hours, 16 hours fasted).
2. **Mark it as watched** (no good day; drawn as a line on the Overview) when the number is a reading, not a habit.
3. **Finish the list** for checklists, where a good day is ticking off what you planned.

## New options that showed up

Ordered by how many presets they help.

| Option | Helps | Notes |
|---|---|---|
| **Watch it** in setup (the `watch` flag exists, no screen) | Weigh-in, Balance, Blood pressure, Blood sugar, Pain, Mood | The Target screen's first choice: "Something I do" or "Something I watch". Highest value, small build. |
| **Better when** on a watched number: higher, lower, or either | Same six, plus Steps, Running | Lets a trend say "improving" quietly. Defaults from the preset: BP and pain lower, balance higher, weight either. |
| **Finish all of it** next to "Finish most of the plan" | Medication, Vitamins, Pet care | Most (80%) is right for a workout, wrong for medicine: 4 of 5 pills is not a good day. |
| **A target over a week or month** ("at most $200 a week") | Spending, Caffeine, Savings, Running | The deferred period option. Spending has no sensible daily target, so it reads "Any entry" without it. |
| **A healthy range band** drawn on a watched line, not pass or fail | Blood pressure, Blood sugar, Weigh-in | Clinical ranges exist, but we should not hard-code medical numbers; the person types theirs. |
| **Items with their own cadence** in a list ("Fern every 3 days", "Rent on the 1st") | Plants, Bills, Pet care | Today a list item is due whenever the list is. Bigger build: an interval per item. |
| **Records for any number**, not only planned trackers | Running (longest, fastest pace), Steps, Reading | Needs Better when, so "best pace" knows lower is better. |
| **An events panel** on the Overview (how often, which kinds) | Symptoms, Cycle, Blood sugar notes | Whenever-logs are neither habits nor readings; a count and calendar of occurrences fits them. |
| **Sleep from bed and wake times** (like Fasting's hours) | Sleep | Most sleep apps ask times, not a duration; a stopwatch for sleep is odd. Offer as an alternative, keep duration. |

One tension to settle: **Food log** naturally wants two targets (calories at most, protein at least), which is the "add another target" we dropped. Options: allow two numbers on form trackers only, or start it with one (protein at least) and let people make a second tracker. I lean to one, protein, and revisit if people ask.

## Preset by preset

Format: what it is now → suggestion.

**Daily habits.** Tick list, any entry → target **Finish the list** (any entry makes one tick a full day).
**Gym split / Full body.** Finish most of the plan, Mon/Wed/Fri → good. The Overview's running best uses the heaviest-weight measure; fine.
**Water.** Counter in glasses, any entry → **at least 8 glasses** (the audit's earlier pick).
**Sleep.** Duration + quality, stopwatch into hours → **at least 7 h**; offer bed and wake times; the stopwatch tool is likely unused for sleep, consider dropping it.
**Mood.** Rating, activities, note; 3-day average → **watch** (higher better). "What was going on" starts empty; suggest starter options (Work, Exercise, Social, Outside, Rest) so the first entry is not a blank list.
**Weigh-in.** Weight reading, 3-day average → **watch**, better when either (the person sets it); optional range band.
**Steps.** Daily number, phone sensor → **at least 8,000** (or 10,000; 8,000 is the less punishing, evidence-backed figure).
**Reading.** Time read, stopwatch → **at least 20 min**.
**Running.** Time and distance, pace, 3 a week → keep any entry (a run is the habit); later records for longest and fastest.
**Workout log.** Named activity, time, effort, 3 a week → good as is.
**Meditate.** Time and feel, daily → **at least 10 min**.
**Spending.** Amount, category, note, whenever → needs a **weekly or monthly budget** to have a target; Category starts empty, suggest starters (Food, Transport, Bills, Fun, Other).
**Food log.** Named food, calories, protein, daily → **protein at least** a starting number (see the tension above).
**Study time.** Named subject and time → **at least 30 min**, or leave any entry; it overlaps with Practice and Time log (see below).
**Journal.** Note, daily → good as is.
**Meal plan.** Tick list with calories and protein → **Finish most of the plan** (any entry is wrong for a plan).
**Medication / Vitamins.** Tick lists → **Finish all of it** (new option). "It shows: Previous numbers" is on for lists with no numbers; switch it off. Reminders matter more here than anywhere.
**Stretching.** Named stretch and time → **at least 10 min**.
**No alcohol / Less scrolling / Quit smoking.** Avoid trackers, a day with nothing logged → good.
**Caffeine.** At most 4 cups a day → good; a weekly version needs the period option.
**Savings.** Amount saved, whenever → a **reach** line ("save $1,000") is the natural shape, plus a monthly target with the period option.
**Bills.** One tap on the 1st → becomes a **list of bills, each with its own due day** once items can have their own cadence; until then fine.
**Balance.** Reading, Sundays → **watch**, higher better.
**Time log.** Named project, time, note, whenever → good; it is a log, not a habit.
**Practice.** Named, time, note, daily → **at least 20 min**. Practice, Study and Time log are three versions of "time on a named thing"; consider whether Study and Practice should be one preset with different names suggested.
**Chores.** Tick list, daily → **Finish most of the plan**; chores are mostly not daily, so it is the second candidate for items with their own cadence (laundry weekly).
**Language.** List of Vocabulary, Listening, Speaking with minutes → **at least 15 min** total, or finish most of the plan.
**Pet care.** Tick list (feeds, walk, water) → **Finish all of it**; flea or vet items want their own cadence.
**Plants.** One tap, Sun and Wed → a **list of plants with their own intervals** once that exists.
**Blood pressure.** Systolic, diastolic, pulse readings, whenever → **watch**, lower better; range band typed by the person. Readings are often taken twice in a row; the day's average may suit better than latest.
**Blood sugar.** Level, when, note, whenever → **watch**; a range band; splitting by "When" (fasting vs after meal) would make the line honest, since mixing them is noise.
**Symptoms.** Several symptoms, severity, note → **events panel**; good as is in setup.
**Pain level.** Daily rating → **watch**, lower better.
**Cycle.** Flow, symptoms, note → **events panel**. Cycle prediction is a feature people expect from cycle apps; out of scope, worth saying so in the preset's blurb rather than implying it.
**Fasting.** Last and first meal, hours fasted → **at least 16 h fasted**.
**30-day challenge.** One tap, 30-day window → good; show "Day 12 of 30" if it does not already.

## Suggested order

1. Starting targets (no new options, just preset values): Daily habits, Water, Sleep, Steps, Reading, Meditate, Stretching, Practice, Language, Meal plan, Chores, Fasting, Food log protein. Small, testable, immediately visible on the Overview.
2. Watch it + Better when in setup, applied to the six reading presets.
3. Finish all of it (Medication, Vitamins, Pet care).
4. Small fixes: starter options for Mood and Spending; Previous numbers off for no-number lists; Sleep stopwatch.
5. Larger: target over a week or month; items with their own cadence; records for any number; events panel; range band; sleep from times.
