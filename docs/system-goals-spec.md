# System goals and gamification: spec (draft, 2026-11-17)

Decision: **trackers capture, the system motivates.** A tracker records what you do and says when it is expected. Everything that makes a day, a week or a month count for more (goals, quests, points, streaks, hearts, levels) belongs to the system, outside the trackers. Goals are optional and are never part of making a tracker.

## 1. What changed in the product now

- Tracker creation has no goal setting: no Goals row on the summary, no goals screen in the flow, and no starting point carries a goal or a daily target. A day on a new tracker counts when it is logged (or, for an avoid tracker, when nothing was).
- The tracker page no longer shows a goals card.
- Goals are made and managed in Progress: **Quests** (across trackers, system-owned) and **Goals by tracker** (a tracker's own, edited from Progress; kept so nothing already set is lost).
- Editing an existing tracker keeps any goals it already has.
- Only one goal-like thing still comes from setup: a rhythm of "N times a week or month" implies that goal (a rhythm with no particular days has nothing else to be judged by).

## 2. One shape for every goal

A goal is **scope + measure + period + aim**, optionally with a window.

| Part | Choices |
|---|---|
| Scope | one tracker, chosen trackers, or all |
| Measure | behaviour: trackers completed, perfect days, entries, days logged. A tracker's own number: a thing you enter or a calculation, combined as total, highest, lowest, average or latest |
| Period | each day, each week, each month, in total (optionally by a date) |
| Aim | at least, at most, within a range, or reach a value from where you started |

Today these exist as two types: `Quest` (system, behaviour measures, many trackers) and `GoalDef` (stored on a tracker, a tracker's own measures). They should become one list on the system. A `GoalDef` is a goal whose scope is a single tracker. Migration: on load, move each `tracker.goals` entry into the system's goals with that tracker as scope; keep the tracker's daily targets working until they are moved too (see 4).

## 3. Setting a goal (the one builder)

- Progress, Goals, "Add a goal". A pinned sentence shows the goal in words as it is built.
- First row is **About**: one tracker, several, or all. One tracker opens that tracker's own numbers; several or all offer the behaviour measures (and, later, totals of a number that trackers share).
- Then compact rows: Count, Combine, Over, Aim, amount, By when.
- **No preset cards.** The builder opens on the likeliest goal, and beside the amount it shows what your own history says ("you usually log 4 days a week; you would have met this in 3 of the last 6 weeks"). Goals are evaluated from entries, so every goal can be tried against the past before it is saved. That is honest guidance with no model behind it.

## 4. What makes a day good

- Default: logged (or clean, for avoid). This is all a tracker knows.
- A goal with period **each day** on one tracker (for example 8 glasses) becomes that tracker's definition of a good day. Streaks, hearts, points and quests read it, so the "good day" is a system choice made in the system.
- Open: how a tracker page hints at it while logging (a quiet read-only "6 of 8" fed from the system), without any setting on the tracker.

## 5. How goals interact across trackers

Built:
- Quests over trackers completed, perfect days and entries, for chosen trackers or all.

Opportunities this approach opens, roughly in order of value for effort:
1. **Groups.** Label trackers (Health, Learning). Aim a goal at a group, so a new tracker joins it automatically ("two Health trackers a day").
2. **Shared totals.** Add one number across trackers that share a unit (minutes across Study, Reading and Practice as "Learning time"), with a per-tracker weight.
3. **History preview** in the builder (see 3). Possible only because goals live outside the data.
4. **Variety and balance:** "touch four different trackers this week", "no tracker idle for three days".
5. **Challenges and seasons:** a goal or a pack of goals with a window ("30 days, five trackers a day"). The window already exists on trackers; it applies to goals too.
6. **Pause:** a vacation or sick mode that suspends goals and hearts without breaking streaks.
7. **Weights and rewards:** let the person say what a goal is worth, instead of fixed points by period. Achievements for firsts (first perfect week).
8. **Goal streaks:** weeks in a row a goal was met, alongside the daily streak.
9. **Sharing (needs the backend, always free):** share a whole system setup (trackers plus goals), shared quests with a friend ("three of us complete a tracker today"), later a quiet leaderboard.

Not planned: goals that depend on another tracker's value ("only count Reading on days I trained") until there is a clear need, since they make history hard to read.

## 6. Data model target

```
Goal {
  id
  scope: { trackers: string[] | 'all' } | { group: string }
  measure: { kind: 'done' | 'perfect' | 'entries' | 'days' }
         | { kind: 'field', trackerId, fieldOrMeasure, combine }
  period: 'day' | 'week' | 'month' | 'total'
  aim: { cmp: 'min' | 'max' | 'range' | 'reach', value, value2?, start? }
  from, until?
  weight?            // what it is worth (phase 3)
}
System { ...config, goals: Goal[], groups?: Group[] }
```
A day goal on a single tracker feeds that tracker's good day. Everything else is judged by the engine as events (points on a finished week, month, or when a by-date goal is met), as quests already are.

## 7. Phasing

1. **Done:** creation without goals; goals managed in Progress; quests.
2. **Next:** one builder with a scope row; migrate tracker goals into the system; history preview; remove the per-tracker goals screen in favour of the builder.
3. Groups, shared totals, challenges with windows, weights, pause.
4. Sharing and social, on the backend.

## 7b. The whole gamification layer is the person's own (decided 2026-11-18)

- **One system for all trackers.** Not a game layer per tracker. One system keeps it readable and lets goals span trackers. Trackers stay capture-only.
- **Three currencies, fixed:** points, hearts, levels. Each does something different (points: a running score; hearts: a limited buffer you can lose; levels: slow progress that never goes down). They are not extended with user-made currencies for now.
- **What is customisable is how they interact with progress:** what counts as losing a heart, how fast points come, how fast levels come, what breaks a streak. Names and on/off too. All opt in.
- **Payout per goal, with a blanket default.** Each goal can set its own reward and its own cost of missing (points, a heart, or nothing). A system-wide default covers every goal that does not set one, so most goals need no choice.
- **Presets share the same bones.** Off, Light and Full are just saved settings of the same rule fields, like the tracker starting points. Pick one, or edit it; there is no separate "simple mode" with different machinery.
- **Guards against unreadable rules:** every goal shows its full rule as one sentence ("each week: +20 points; miss it and lose a heart"), and the builder previews what the rule would have paid on past data.
- **Build order:** the single goal builder first (scope, measure, period, aim, payout), then the currency and milestone rules, then presets.

## 8. Open questions

- Should a new person get any goal at all? Today only points for logging. A single gentle prompt after three days, or after the third tracker, offering a first quest (not a card list), seems enough.
- Is a read-only progress hint on the tracker page worth it, or does it pull the goals back into the tracker?
- Do a tracker's daily targets live on the tracker's data in the engine (as now) or only as system goals read by the engine? The second is cleaner; the first is the smaller change.
