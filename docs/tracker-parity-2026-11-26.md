# Tracker parity: what a standalone app has that we don't (2026-11-26)

Scope: the tracking itself, per kind of tracker. Goals, the Overview and data views are set aside. The test is simple: would someone who relies on a single-purpose app lose something they use every week if they switched? Supersedes the tracking half of `tracking-feature-gaps.md` (2026-11-18), much of which has since been built.

**How solid this is.** This comes from my knowledge of the leading apps, not from opening them this session. Where I am unsure a feature is standard, it says (to verify). Before building any item, check the real app. Prices and paywalls change often; I left them out.

## What we already have

Timers (stopwatch into a field, countdown with an alert, a live timer in the notification panel), steps from the phone's counter and Health Connect with backfill, planned sets with previous values, readings, schedules, avoid trackers with clean streaks, units, multi-select tags, export and import, a GPX reader (distance, pace, splits, elevation; **not connected to any screen yet**).

Installed but unused: camera, photo picker, location, speech, calendar, audio, background tasks. So several phone features below cost no new dependency.

## Table stakes: people would not switch without these

These cut across trackers, so each one lifts many presets at once.

| Feature | Who relies on it | Cost | Notes |
|---|---|---|---|
| **Reminders that fire** | Medication, vitamins, habits, water, journal, plants, bills | Medium | Settings exist; nothing is delivered. Per tracker, at times you choose, plus "if not logged by 9pm". Medication without reminders is a non-starter. |
| **History per tracker** (past entries list, a chart of each number, a calendar of done days) | Every tracker | Medium | Specialists all have this on the tracker itself. We have a week strip and month calendar but no chart and no per-exercise history. |
| **Personal records** | Lifting, running, any number | Low to medium | Hevy and Strong mark a PR on the set as you log it; Strava marks a best effort. Records engine for plans exists from the Overview work; needs showing at the moment of logging. |
| **Home-screen widget and quick log** | Water, habits, caffeine, avoid trackers | High (native) | Loop, Streaks and water apps live on the home screen. A big reason people pick them. Android first. |
| **Backup that restores** | Everyone switching from a long-used app | Low | Sync exists via the account; also an import from the app they are leaving (below). |

## By tracker type

**Lifting (Gym split, Full body).** Compared with Hevy and Strong.
- Rest timer that starts itself when a set is ticked (we have a countdown; check it auto-starts).
- PR badge on the set; estimated one-rep max.
- Per-exercise history: last sessions and a chart.
- Set types: warm-up, drop set, to failure. Supersets (to verify how often used).
- Plate calculator (low cost, loved by barbell users).
- Exercise library with names and muscle groups, so a new exercise is a search, not typing.
- Bodyweight and assisted exercises (minus weight). Kg and lb per exercise exists.
- **Import from Strong/Hevy CSV.** The single biggest switching aid; both export CSV.

**Running and cardio (Running, Workout log).** Compared with Strava, Nike Run Club, Runkeeper.
- **Live GPS recording with a map**: route, distance, pace, splits, while the screen is off. Needs location in the background (installed). This is the feature people mean by "a running app". High cost, high pull.
- Audio cues every km or mile ("2 km, pace 5:30"). Speech is installed. Low cost once recording exists.
- Map of the route on the entry (we have the points from GPX; draw them with SVG, no map tiles, or use a map library).
- Import a GPX file now (the reader exists; it needs a button). Low cost, quick win.
- Health Connect exercise sessions (runs recorded by a watch arrive automatically). Medium.
- Bests per distance (fastest 5 km), weekly distance. Low.
- Activity types (run, ride, walk, swim) with the right units. Low.

**Steps.** Compared with Google Fit, Pedometer++.
- We have the counter and Health Connect. Missing: distance and calories estimates (to verify value), hourly breakdown (low).

**Water and caffeine.** Compared with WaterMinder, Plant Nanny.
- Reminders through the day (spread between wake and sleep times).
- Quick amounts in ml or oz with cup sizes, not only taps (partly there: tap step). Drinks with a type (coffee counts toward caffeine and water).
- Widget.

**Sleep.** Compared with Sleep Cycle, Sleep as Android.
- Bedtime and wake time with hours worked out (the alternative from the preset sweep).
- Health Connect sleep sessions (a watch or phone app already measures it). Medium; likely the most useful.
- Sound recording and smart alarms: out of scope.

**Weight and body.** Compared with Happy Scale, Libra.
- Health Connect weight (smart scales write there). Medium.
- Body measurements and body fat as optional fields (presets could offer them).
- Progress photos (camera and picker installed). Medium; private by default.

**Medication and vitamins.** Compared with Medisafe.
- Reminders per dose time, with "taken" right from the notification. Notification actions exist in notify-kit (to verify).
- Pill count and refill warning (a number that goes down per tap). Low to medium.
- As-needed doses (logged when taken, not scheduled).

**Mood and journal.** Compared with Daylio, Day One.
- Photos on an entry (camera installed). Medium.
- Voice note or dictation (speech-to-text is not what expo-speech does; that is text-to-speech. Dictation comes from the keyboard already.)
- PIN or fingerprint lock for the journal (to verify demand; Daylio and Day One both offer it). Low to medium.
- Mood with five faces as a one-tap input (we have a 1-5 rating; check it reads as faces).

**Food and meals.** Compared with MyFitnessPal, Cronometer.
- Barcode scanning (camera installed) against a food database. The database is the cost, not the scan; Open Food Facts is free and open. High cost, high pull for this audience.
- Saved foods and meals you reuse (named entries with suggestions partly cover this).
- Without a database, we should not pitch Food log against these apps.

**Money (Spending, Savings, Bills, Balance).** Compared with budgeting apps.
- Recurring items (rent monthly) and a bill list with due dates and reminders.
- Bank sync: out of scope (regulated, costly).
- Receipt photo (camera installed). Low to medium.

**Habits, chores, pet care, plants.** Compared with Loop, Streaks, Tody, Planta.
- Reminders, widget.
- Items with their own cadence (water the fern every 3 days; Tody and Planta are built on this).
- Plant identification by photo: out of scope.

**Health readings (Blood pressure, Blood sugar).**
- Health Connect read for both (meters write there). Medium.
- A report to share with a doctor (PDF or image). Medium.
- mmol/L for glucose (check the unit list).

**Fasting.** Compared with Zero.
- A live fasting clock (start fast, end fast) with the live notification we already have for timers. Low to medium; reuses the timer layer.

**Cycle.** Compared with Clue, Flo.
- Predictions of the next period and fertile window are the core of these apps. Without them we should not present Cycle as a replacement; a plain log is fine if said honestly. Data privacy is a big concern for this category.

## Phone features, in one place

| Phone feature | Installed? | Uses |
|---|---|---|
| Notifications | Yes, partly used | Reminders, dose taken from notification, fasting and run status |
| Location (incl. background) | Yes, unused | Live run recording and maps |
| Health Connect | Yes, steps only | Weight, sleep, heart rate, blood pressure, glucose, exercise sessions |
| Camera and photos | Yes, unused | Progress photos, journal photos, receipts, barcode |
| Speech (text to speech) | Yes, unused | Run audio cues, rest timer callouts |
| Haptics | Yes | Already used |
| Calendar | Yes, unused | Bills and appointments onto the calendar (low value; to verify) |
| Home-screen widgets | No | Quick log; needs native Android code |
| Biometrics lock | No | Journal and health privacy |

## Suggested order

Picked for pull per cost, cross-cutting first.

1. **Reminders that fire** (every daily tracker, and medication cannot ship without it).
2. **History on each tracker** (past entries, a chart per number, per-exercise history), with **PRs shown at the moment of logging**.
3. **Health Connect beyond steps**: weight, sleep, blood pressure, glucose, exercise sessions. One integration, five presets.
4. **GPX import button** (quick win), then **live run recording with a map and audio cues** (the big one for runners).
5. **Lifting extras**: auto rest timer check, plate calculator, exercise library, set types, Strong/Hevy CSV import.
6. **Fasting clock, refill count, items with their own cadence.**
7. **Photos on entries** (progress, journal, receipts).
8. **Widgets** (native; big pull but the costliest).
9. Barcode and food database, cycle predictions: only if we decide to compete in those categories; otherwise say plainly what those presets are and are not.
