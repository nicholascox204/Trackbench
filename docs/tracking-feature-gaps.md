# Tracking features we lack (competitor check, 2026-11-18)

Scope: the tracking itself, per kind of thing people track. No social features, no motivation layer (parked). Goal: find what the best single-purpose apps do that our presets do not yet cover.

**How solid this is.** I ran web searches per category, but the results were mostly SEO comparison blogs and vendor pages, with no reliable feature tables. Where a claim below comes from those searches it is marked (searched). Everything else is my general knowledge of these apps and is marked (to verify). Before building any item, open the real app and confirm. Treat the ranking as a hypothesis from a desk check, not research.

## What we have today (for the comparison)

Field types: number, note, rating, choice (one), time of day. Planned lists with sets, previous values, a 3-day average, a week strip and month calendar, schedules (weekdays, N per week, whenever), avoid mode with days clean, daily value mode, units with per-field overrides, totals, text export and import. Not built (from DESIGN.md): per-exercise history charts. There are no charts anywhere, no records, no timers, no reminders delivery, no multi-select, no photos.

## Gaps by what people track

**Workouts** (Hevy, Strong; to verify, searches did not confirm details)
- Rest timer between sets; set types (warm-up, drop, failure); supersets
- Personal records detected automatically; estimated one-rep max
- Per-exercise history chart (weight and volume over time)
- Plate calculator; exercise library with muscle groups
- We have: previous values, planned sets. Missing: everything above.

**Cardio** (Strava, Runmeter, Cyclemeter)
- (searched) Splits, pace and heart-rate zones, routes, segments; much of it is paid even in Strava.
- Needs GPS, sensors and native background work, so out of reach in Expo Go. Deferred.
- Doable manually: pace (we have it), intervals as sets, personal bests per distance, weekly distance chart, a stopwatch.

**Body measures** (weight, blood pressure, blood sugar, pain)
- Trend line over the raw points (we have a rolling average number, no chart)
- Value zones: blood pressure categories, in-range share for glucose, shown in colour (to verify)
- Morning and evening readings, and a summary to show a doctor (to verify)
- Unit variants such as mmol/L (we have unit overrides, check coverage)

**Intake** (water, food, caffeine, vitamins, medication, fasting)
- (searched) Cronometer and MacroFactor lead on a verified food database, barcode scanning, micronutrients and trend-based targets. A database is a large separate project; custom foods with your own macros are the realistic version.
- Medication: dose times, missed-dose, refill count (to verify)
- Fasting: a live running timer (to verify)

**Mood, sleep, symptoms** (Daylio, Bearable)
- (searched) Daylio is fastest: one tap of five faces plus activity tags. Bearable's pull is correlations, such as mood against short sleep, with unlimited metrics free.
- Missing for us: a year-in-pixels or heatmap view and statistics by tag (multi-select tags themselves exist).

**Habits** (Loop, Streaks, Habitify)
- (searched) Streaks, completion rates, stats; Loop is free and fully offline.
- (to verify) Heatmap, a habit score, frequency targets, home-screen widgets.
- We have schedules and days clean. Missing: heatmap and completion stats.

**Money** (spending, savings, bills)
- (to verify) Categories, monthly totals, a chart by category, recurring items, a budget line.

**Study and life** (study, practice, chores, time log)
- A running stopwatch for time entries (Toggl-style), session totals per week.

## Cross-cutting gaps, ranked by pull and cost

1. **Charts and history views per tracker.** Line for readings, bars for totals, 7 / 30 / 90 days / all. A calendar heatmap for yes/no trackers. Every category above wants it, it needs no new data, and it is the clearest gap against every specialist. Cost: medium.
2. **Personal records and bests.** Pure computation from entries: best weight per exercise, longest run, best week. Cost: low to medium, and it makes charts feel alive.
3. **Timers.** Stopwatch to fill a duration field, a rest timer for sets, a fasting clock. Covers running, meditation, study, workouts and fasting. Cost: medium (needs a field type or a button on a field).
4. **Multi-select tags and notes on an entry.** Correction 2026-11-18: this already exists (a choice field with Pick more than one, and note fields), so it is not a gap. What is missing is using tags later in analytics.
5. **Zones and reference ranges.** Colour a reading by range (blood pressure, glucose, a 1-10 scale). Cost: low once charts exist.
6. **Cross-tracker view.** Two trackers on one chart. No single-purpose app can do this, so it is the real argument for one app. Needs charts first. Cost: medium.
7. **Backup and CSV export.** Data ownership, supports free sharing. Cost: low.
8. **Reminders that actually fire.** Table stakes for habits and medication. Needs notification permission and scheduling; settings exist but nothing is delivered. Cost: medium.
9. **Photos on entries, widgets and quick-log.** Native work; later.

## Suggested order

Charts first (1), with records (2) and zones (5) riding on the same data, then the timer (3) and multi-select tags (4). Then the cross-tracker chart (6). The live preview in tracker creation and the editor rework sit beside these.

## Sources searched

[Hevy vs Strong comparison](https://setgraph.app/articles/hevy-vs-strong-app-comparison-2026) · [Habit tracker roundup](https://toggl.com/blog/best-habit-tracker-apps) · [MacroFactor vs Cronometer](https://macrofactor.com/macrofactor-vs-cronometer/) · [Bearable vs Daylio](https://bearable.app/?p=3082) · [Strava review](https://www.tomsguide.com/reviews/strava-review) · [Cyclemeter features](https://cyclemeter.com/features). Most are vendor or affiliate pages, so they are directional only.
