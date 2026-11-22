# Feature ideas and open design talks

Working notes for discussion, not the current spec (DESIGN.md is that). Nothing here is built unless marked done. Dated 2026-11-21. Library details below come from memory of the Expo and Android ecosystem and have not been checked against Expo SDK 58; confirm before committing to any of it.

## Where this came from

- A friend uses Map My Run and could be won over with: pacing, elevation, map and route, a step counter.
- He has no Fitbit or similar. The phone has to be the source.
- Interest in fitness trackers and other tools as accurate data sources, and in steps counted through the day with no lock-in.

## Done in this round

- A running timer decides which tracker opens (not when pinned).
- Live timers show in the notification area (Android build).
- A front-facing schedule on the summary and a Take turns layout (Push Pull Legs preset); blocks of days folded into it.
- Pace reads as minutes and seconds; a GPX reader (distance, time, elevation, splits, route) exists as tested code, with no screen yet.
- A tracker running every day says "Every day" on the summary instead of showing seven filled days.

## Open: setup framing (needs a design talk first)

Someone removed a field in the first setup, thinking setup was where she entered her own data. Setup is really designing the tracker. Ideas, not decided:
- A small preview of what the logging screen will look like.
- Each field shown as a card marked "You'll log this".
- For plug-and-play presets, "Use as is" as the main button, customising behind it.
- Plug-and-play versus editable presets should look different. Right now they look the same.

One person is thin evidence, so watch for it in more first-time users before a large redesign.

## Open: running features (Map My Run precedent)

**Fits the current design, no native code**
- Pace and speed from distance and time; per-km or per-mile splits using the lap timer.
- Personal records, weekly and monthly totals, a calendar of runs.
- Shoe or gear mileage as a running counter.
- GPX import (document picker works in Expo Go): gives route shape, elevation and pace from a past run. Most running apps export GPX, so this is also a way in for someone leaving another app.
- Route drawn as a plain line with no map tiles (no tile cost).

**Needs a development build**
- Background GPS while the screen is off. Google Play reviews the background-location permission closely.
- Steps and distance read from Health Connect (Android) or HealthKit (iOS). Steps would be a daily-total tracker whose value is filled by the phone, read when the app opens, so it needs no lock-in and no background service of our own.
- Reminders (already on the list) need the same build.

**Costs to think about**
- Map tiles are not free at scale: Google needs a key, and the free OpenStreetMap servers prohibit heavy use. A basemap belongs in the monetization design.
- GPS elevation is noisy. The barometer or Health Connect data is better.
- Social features (challenges, leaderboards) conflict with solo-first and are the largest scope.

## Open: outside devices and services

Health Connect and HealthKit are the aggregators: a Fitbit, Garmin, Samsung or Apple watch usually writes to them, so one integration covers many devices. Direct connections (for example a Fitbit account through its own web API, or Strava) need an account sign-in, a server to hold keys, and each provider's terms. That conflicts with local-first and no-server for now, so the aggregator route comes first. Check current provider API status before planning any direct connection.

Design idea: a field gets a source. Manual entry, the timer (already works this way through `timerInto`), a GPX import, or a Health Connect read all fill the same kind of field. This keeps the neutral bones, with no special tracker code.

## Suggested order

1. Pacing and splits, GPX import, route line, PRs and totals (Expo Go).
2. Build a development build; add Health Connect steps and imported runs.
3. Live GPS and a basemap last, after the tile cost is decided.

Before any of this: ask the friend which three Map My Run features he would actually miss, then audit each tracker type the same way, starting with Running.

## Decisions so far (2026-11-21)

- **Recording a run is its own "Record a run" screen**, not an extra on the timer. It copies the functional tracking (time, distance, pace, route, elevation), not Map My Run's look. On stop it fills the tracker's fields for review and saving. Same tracker, same data.
- **Development build:** not decided. Open question was whether it means reinstalling all the time. See the notes below once settled.
- **Basemap:** undecided. Start with the route drawn as a line; revisit when someone asks for a real map.

## Open

- What the first release of Record a run contains (live time and pace, splits, route line, elevation gain).
- Whether GPX import goes first, since it works without the development build.

## Open: irregular schedules with a rotation of workouts (from a friend, 2026-11-21)

A friend has set workout types (push, pull, legs) but trains on irregular days because of his work schedule. A gym split tied to days of the week (or blocks of days in a row) serves him badly: the day's list is chosen by the calendar, not by him. What he wants: choose today's workout from a short list of presets instead of the usual reset.

Ideas, not decided:
- A plan with several named lists that are not tied to weekdays ("a list for each workout"), with the schedule left as "times a week" or "whenever".
- On opening, a row of chips for today: Push, Pull, Legs. One tap picks the list for the day.
- A suggested next one: the workout done least recently, or the next in your own order, shown first or marked.
- Keep the existing weekday and block layouts for people whose days are fixed. This is a third way to lay a plan out.
- Questions to settle: what counts as "today's workout" when two are done in one day, and whether the unpicked ones read as missed (they should not).

## Idea (2026-11-22): connected data as a builder tool
Under Tools, an option to collect a field from a connected source (Health Connect): steps first, then heart rate and other biometrics. A tracker that opts in gets the same "Allow Trackbench to read ..." card at the top of its page, and the field fills itself. Today the card appears on any tracker with a number called Steps; this would make it a general per-field setting.

## Decision (2026-11-22): connected data lives on the tracker, not behind a blanket setting
The tracker knows which field a reading fills, so the opt-in is a Tools row ("Fill automatically"), shown only when a tracker has a matching field. Off by default for readings that need gear (heart rate); on by default for steps. No global gate: an off switch costs nothing. Settings gets one small "Connected data" list later for status and taking permissions back, not for opting in.
