# Spec: Tools (timers and small helpers) — DRAFT for Nick to mark up

Status (2026-11-18, second pass): **two tools built, named by what they do: Countdown and Timer.** Verified in the browser preview only; the notification and the vibration need the phone. Not built: filling a field from the Timer, the live ticking notification (layer 2), and everything under "Not now".

**Countdown** (was "rest timer"): one slim line: the time in a quiet bordered box (the cue that it can be changed), the name "Countdown" to its right, then reset and play. Tap the time and all of it is selected, so typing replaces it, using the phone's own keyboard; the bars lift above the keyboard while you type and the navigation steps aside. Digits are read like a microwave (1, 3, 0 is 1:30; 90 is ninety seconds), with colons shown as you type, up to six digits (h:mm:ss), maximum 24 hours. Leaving the box (done, or the keyboard closing) sets it. **Changing the time at any point, even mid-run, resets the countdown to the new time, stopped**; tapping in and out without changing it does nothing. It remembers the time you set, default 2:00. Alert at zero through a scheduled local notification (dropped if you reset or retype), plus one vibration if you are looking at it. Switch: Extras, "Countdown" (on for Gym split and Full body).
**Timer** (was "stopwatch"): the same single line, the time as plain text (it is not editable), the name "Timer" to its right, then reset and play. Counts up from 0:00, hours shown past the hour. Switch: Extras, "Timer" (off everywhere for now). A tracker can have both; the bars stack above the navigation.
Changed from the first spec: no +/- buttons (typing replaces them), no Tools row (the switches live on Extras), no auto-start, and the Timer no longer fills the Minutes field (that is a later add, so a hold or a session can be just timed).
Proposed, not decided: Timer on by default for Running, Stretching, Meditate, Reading, Study time, Practice, Language, Time log.

## The idea

A **tool** is a small live helper on a tracker page. It is not tracking data: it helps you do the tracking. A rest timer is the clearest case. Tools are switched on per tracker, and presets turn on the ones that fit. A tool never needs a new kind of entry: at most it fills in a field the tracker already has.

Neutral wording: a tracker has a "Tools" row on its setup summary (value: "None" or the names on). A custom tracker can turn on any tool; no preset gets a tool a custom one cannot have.

## Tools considered

| Tool | What it does | Stock on | Slice |
|---|---|---|---|
| **Timer** | Counts up; pause, reset (filling a Minutes field is a later add) | Running, Stretching, Meditate, Reading, Study time, Practice, Language, Time log | 1 |
| **Countdown** | Counts down from a time you type; alert at zero | Gym split, Full body, Workout log | 2 |
| **Time since last** | Shows "last one 3 h ago" from the latest entry | Medication, Vitamins, Caffeine, Meals, Pet care, Plants, Fasting | 3, later |
| **Plate calculator** | Target weight and bar weight give plates per side | Gym split, Full body, Workout log | later |
| **Interval timer** | Work and rest rounds | Stretching, Meditate | later |

Slice 1 and 2 are the two Nick named. The rest wait until those feel right.

## Slice 1: Stopwatch

- Appears as a Start button beside the Minutes field on the log card. Running shows elapsed time and a Stop button.
- **Stop fills the Minutes box** (rounded to the nearest minute, at least 1). You still press the normal Log button, so there is one way to log and you can correct the number first.
- Survives leaving the screen, switching trackers and closing the app, because it stores the start time, not a running counter. Elapsed = now minus start.
- One running stopwatch per tracker. A small marker on that tracker's tile in the bottom bar while it runs.
- Discard (stop without filling) is one tap behind Stop.

## Slice 2: Rest timer (answers from Nick, 2026-11-18)

- A small timer on the tracker page, always within reach, not buried in setup. Set what it counts down from, press play. **It remembers the length you last set** (starts at 2:00 the first time). The length is set on the timer itself; there is no setup screen for it.
- **Manual start only.** No auto-start when a set is ticked, since that removes a choice and does the wrong thing after the last set of an exercise. An auto-start switch may come later; if it does, it must not fire after the final set of an exercise.
- Pause, reset and add or remove 15 seconds are on the timer.
- **Notification panel.** Starting the timer schedules a local notification for the moment it ends ("Rest over"), so it reaches you when you have switched to another app or locked the phone. It is cancelled if you stop or reset it. Not saved as data.
- At zero with the app open: vibration and a sound too.
- What is verified and what is not: local scheduled notifications are available in Expo Go ([Expo docs](https://docs.expo.dev/versions/latest/sdk/notifications.md), found by search), and on Android 13 and later need the notification permission, asked the first time you start the timer. **Not verified:** a notification that sits in the panel and ticks down live, like a stopwatch. I found nothing confirming it for Expo Go; it likely needs native code, so it may mean a development build. Slice 2 promises the alert at zero, not a live count in the panel. Testing is on the phone only; the browser preview cannot show it.

## Decisions so far

- Rest timer is manual, remembers its length, lives on the tracker page, and is set on the page (Nick).
- Stopwatch rounds to the nearest minute, at least 1 (Nick).
- Background alert for the rest timer ships in slice 2 as a scheduled notification (Nick wants it for reading between sets); a live ticking panel is an open question for a development build.

## Slice 2 placement and notification plan (Nick, 2026-11-18)

- **Placement:** a slim bar pinned just above the bottom navigation, not inside the scrolling page, so it is always one tap away. Shown only on trackers that switch the rest timer on. The wider layout of the tracker page is still to be settled; the bar can move without changing anything else.
- **Notifications in two layers behind one small interface** (start with an end time, cancel):
  1. *Alert at zero:* a scheduled local notification through `expo-notifications` (first-party Expo; works in Expo Go, so testable on the phone now).
  2. *Live countdown in the panel:* an Android notification that ticks down by itself (a chronometer set to count down, which the notification library [Notifee documents](https://docs.page/invertase/notifee/react-native/android/timers)). Needs native code, so it only runs in a development build. In Expo Go the app falls back to layer 1 without crashing.
- **Library choice (needs Nick's OK before installing).** Notifee itself was last published December 2024, which is old for React Native 0.88. A maintained fork, `react-native-notify-kit` (Apache-2.0, last published 2026-11-13, supports Expo development builds), is the likely pick. It is one maintainer's fork, so it is a trust and longevity risk, which is why it comes after layer 1 and sits behind the interface so it can be swapped.
- **Development builds.** A dev build only has to be rebuilt when native packages change, not for normal code changes, so the limited number goes further if native packages are chosen together. The free cloud plan reportedly allows about 30 builds a month (sources differ on the Android and iOS split), and local Android builds on your own PC should not count against it, though that needs the Android SDK set up (searched; confirm on expo.dev before relying on it). Native packages we may want in the first build: notifications (this), haptics, and anything else the next features need.

## Open questions

1. OK to use `react-native-notify-kit` for layer 2, after layer 1 works?
2. Build order: layer 1 first (testable now in Expo Go), then layer 2 for the first dev build.

## Data and code touch points

- `Tracker.tools?`: `{ stopwatch?: { field: string }, rest?: boolean }`, saved with the tracker. Old trackers have none. The rest length is the last value set, kept per tracker (not in setup).
- A running timer is saved separately from the tracker: `{ trackerId, kind, startedAt | endsAt }`, so it survives a reload. Cleared on Stop or at zero.
- Templates set `tools` defaults; the setup summary gets one "Tools" row opening a screen of switches.
- A tool is part of the exported structure, so a shared tracker brings its tools.

## How we will know it works

Tests first (logic): elapsed time from a stored start across a reload; rounding to minutes with a minimum of 1; only one running per tracker; stop fills the field; rest end time, pause and restart; the scheduled notification is created on start and cancelled on stop; old trackers without `tools` load unchanged; every preset's tools exist as options for a custom tracker.
By eye in the preview, then on the phone: start, leave, return, stop, log; tick a set and watch the countdown.

## Not now

Interval timer, plate calculator, time since last, a live ticking notification, auto-start, sounds you pick, a countdown that fills Minutes when done, GPS or any sensor, charts of timed sessions (analytics pass).
