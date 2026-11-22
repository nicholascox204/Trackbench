# The hub: spec (draft, 2026-11-22)

Builds on `docs/system-goals-spec.md` (one goal shape, trackers capture and the system motivates). This doc says where all of that is *seen*. Nothing here is built.

## 0. Why it exists, and the bar it is held to (decided 2026-11-22)

**Thesis.** Trackbench exists to tie different trackers into one coherent system, and the Overview is where that shows. (Whether any other app already does this is unchecked; see the competitor check in the case study before it is used as a claim.) **Motivation is intrinsic first:** the strongest push is seeing your own progress reflected back clearly, because the stakes are yours. Autonomy (you choose goals, streak rule and how hard the app pushes), mastery (clear progress) and purpose (your own stakes) are the frame, after *Drive*. **Light gamification:** streaks and levels only, built on the replay engine; heavier mechanics (quests, parties, as in Habitica) are a possible later direction, not now.

**Tone dial.** Some people need a coach, or a bully. That is a setting the person chooses for nudges and result lines: Quiet (default), Supportive, Firm. It changes wording and how hard reminders push, nothing else, and the person is the one who picks it. A human coach is a later social feature (shared by code).

**Design quality is a requirement, not polish.** Every shape on the Overview gets a design pass (type, spacing, theme colours), and the share card meets the same bar, because pride in how your data looks is a product goal and the card is how the app is seen. Test: open each of the six example people's Overviews and ask whether they would show it to someone.

## 1. What the hub is

A tab beside the trackers, not the home screen. The app still opens on the first tracker you have not finished today. The hub is where you look at yourself across trackers: how things are going, what you are working toward, and how it compares with earlier weeks. It replaces the parked Motivation tab and Progress as the one overview place.

It does three jobs, in this order of importance:
1. **Show progress** across trackers over a period you choose.
2. **Hold goals, streaks, points and levels** (one system, section 4).
3. **Be yours and shareable**: you choose what is on it, and a layout can be passed to someone else (section 7).

## 2. A panel is source + shape + period

Every block on the hub is a panel with three choices, nothing else.

| Part | Choices |
|---|---|
| Source | a tracker's number (a field combined as total, highest, lowest, average, latest), a tracker's behaviour (entries, days logged, good days), a goal, a streak, points or level, or a comparison of two sources (section 6) |
| Shape | a single big number, a bar over time, a line over time, a day grid (one square per day), a progress bar (goals), a ranked list (the trackers, by days logged) |
| Period | this week, this month, last 30 days, last 90 days, this year, all time. Weeks start on the day chosen in Settings |

Each source offers only the shapes that make sense for it (a streak is a number or a day grid, not a line). Every panel also shows the previous period beside the current one as one plain line ("12 days, 9 before"). Charts are drawn from entries each time, so a panel on an old history works the moment it is added; nothing is stored for the hub except the layout.

A panel is one card: a headline that carries the meaning ("You logged 5 days this week") with the chart under it. No subtext, short cards.

## 3. The starting hub is built, not empty

A new hub is filled from what exists, so nobody opens a blank page:
- Always: **This week** (days logged per tracker, as a day grid) and **Streak** (current and best, across trackers).
- If any tracker has a number you enter regularly: one **line** panel for the tracker logged on most days (last 90 days, or all time if shorter).
- If any goals exist: **Goals** (progress bars, closest to done first).
- At 3 or more trackers with 30 or more days: **Where you log most** (ranked list).

Rules are about what data exists, never about what a tracker is for (the neutral-by-default rule). Add panel, remove, reorder (press and hold, as the tracker bar does), and a change to source, shape or period are all on the panel. "Start over" rebuilds the starting hub.

## 4. Goals, streaks, points and levels: one engine

Use the goal shape already specified (scope + measure + period + aim; one list on the system; `GoalDef` becomes a single-tracker goal). The addition here is that **everything is derived by replaying history**, never stored as a running total:
- A goal is judged per period (each day, week, month, or your own dates) from entries.
- A **streak** is consecutive periods a goal (or the good day) was met. Pause (vacation, sick) skips periods without breaking it.
- **Points** are earned when a period is met; the amount comes from the period length (day 1, week 3, month 8, one-time 10 times base, as built), and a person may later weight a goal.
- **Levels** are a function of total points (step size in the system config).
- Because it is a replay, editing or deleting an entry, importing history or changing a goal gives the correct totals at once, and a new goal can show how it *would* have gone ("met in 3 of the last 6 weeks") before it is saved.

Gamification is switchable per element (points, levels, streaks) and defaults to **streaks only** for new people; points and levels are offered, not imposed. A miss costs nothing but a streak.

### Goals start from the data (decided 2026-11-22)

Setting goals tracker by tracker in setup was too much, because people had to invent targets blind. Instead, goals are made from a panel: every numeric panel has "Make this a goal", offering a few bounded options built from that panel's own history: **keep this up** (match the last period), **beat last period** (a small step above), **stay in your range** (a band around your usual values), **reach a number** (latest, lowest or highest). Each shows how it would have gone on the past before it is saved. The goal shape underneath is unchanged. A "Goals" list on the Overview is still there for managing and for goals not started from a panel.

### Which trackers count

A "Counts toward" list on the Overview names the trackers that feed streaks, points and levels. Default: all. Switching one off removes it from the engine, not from the Overview's charts. This replaces the old per-tracker setting in setup. A person who sets no goals and changes nothing still has the full Overview.

### Naming and defaults (decided 2026-11-22)

User-facing name: **Overview** (the spec's "hub" is internal). Streaks on by default with no first-run question; points and levels offered later. Comparison starts only from the Overview (Add panel, Compare two things). The image card has a fixed layout in the person's own theme. Reminders attach to a tracker or a goal (optional "remind me" with a time or a cue like "after I wake"); a reminder needs no goal ("read for a bit today"). One global quiet-hours setting; everything off until the person turns a reminder on. Social is built on codes and arrives as another panel source.

## 5. Trackers show a thin strip, nothing more

- A read-only line under the week strip listing the goals that concern this tracker ("Run 3 times a week: 2 of 3"). Tap opens that goal in the hub. No settings on the tracker.
- After logging, one line of result ("Good day. Streak: 12"). Shown once, not kept.
- Goals are created in the hub, never in tracker setup (as decided 2026-11-17).

## 6. Comparison across trackers

Pick two sources and a period; the hub shows them on shared days and says one of four things in plain words: **tends to rise together**, **tends to move opposite**, **no clear link**, or **not enough days yet**.
- Pair by calendar day. Optional lag of one day ("sleep last night vs mood today").
- Numeric sources: Spearman rank correlation (robust to odd days). Only days where both have a value count. Needs 20 paired days (or 8 weeks for weekly sources) before it says anything but "not enough days yet".
- Wording is "tends to" and always shows the number of days used and a scatter or paired line. Never "causes", never advice. No model, no AI: arithmetic on the person's own entries.
- Compared sources must be numeric; a behaviour (logged or not) is treated as 1 or 0.

## 7. Sharing

Two separate things, both free.

1. **Image card** (no account needed by the viewer): the hub rendered as a picture with name, period, and chosen panels. Redaction first: each panel has a "hide values" option (shows the shape, hides the numbers) and the card never includes tracker notes.
2. **Importable layout**: panels, shapes, periods and goal *definitions*, no entries. Bound **by role, not tracker id**: a panel stores "the tracker with a time field I log most" or a named slot, and the importer maps each slot to one of their own trackers (suggested by shape, confirmed by them) or leaves it empty. Panels with an empty slot are skipped, not broken. The layout travels as a code (people are linked by codes, no usernames) through the cloud.

Not in this version: live shared hubs, leaderboards, shared goals with friends. Those need the code-linking system and come after.

## 8. Data

- `hub_layout` (one row per person, synced like settings): ordered list of panels `{ id, source, shape, period, hideValues }`.
- Goals: one list on the system (per `system-goals-spec` section 6).
- Derived (never saved): streaks, points, levels, comparisons, panel series.
- Performance: panel series are computed from SQLite on open; a 540-day, 18-tracker person is about 10k entries, so no caching until measured.

## 9. Checked on paper against the six example people

| Person | What the starting hub shows | Verdict |
|---|---|---|
| Just started (2 trackers, 5 days) | This week grid, a streak of a few days. Line and ranked list rules do not fire. Comparison says "not enough days yet" | Works, but is thin. Fine and honest: add a one-line "more shows up as you log" in place of an empty section. Streak and this-week are the reward at this stage |
| A few for a few months (4, 75 days) | Week grid, streak, one line over 75 days, goals if any | Good |
| Regular (7, 300 days) | All starting panels; year and 90-day views are meaningful; comparison becomes possible | Good, the target case |
| Tracks everything (18, 540 days) | Ranked list matters here; week grid with 18 rows is too tall | **Gap:** the grid must collapse to the six most active trackers with "all 18" opening the full grid. Add as a rule: any panel over 8 rows shows the top 6 |
| Many for one month (24, 28 days) | Ranked list, week grid (top 6). Year and all-time add nothing; 90 days is mostly empty | **Gap:** a period longer than the history clamps to the history and says "all 28 days". Comparison reaches 20 days only for a few pairs |
| Few for years (3, 3 years) | Line panels over years are the strength; month and year bars; streaks across long lapses | Good. The lapse shows as a gap in the grid, a streak reset, and best streak stays. Shows why "best" is kept beside "current" |

Two rules came out of the check: panels collapse past 8 rows, and a period clamps to the available history.

## 10. Open questions (for Nick)

1. **Name:** "Hub" is the working name. Does it want a plainer word in the app (Overview, Progress)?
2. **Streak default:** is "streaks only" right for new people, or should the first-run ask once?
3. **Comparison entry point:** only from a panel ("Compare with...") or also a button on each tracker?
4. **Image card:** one fixed look, or the hub's own theme and colours?

## 11. Build order (once the spec is accepted)

1. Goals unification and the replay engine (tested on the six example people first, no screens).
2. Hub screen with panels, the starting hub and the three or four basic shapes.
3. Tracker strip and one-line result.
4. Comparison.
5. Image card, then importable layouts (needs the cloud and codes).
