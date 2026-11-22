# Spec: Tracker editor rework, starting with the planned (gym) tracker. DRAFT for Nick to mark up

Status (2026-11-18, later): **built**: no rest days, blocks of days, previous values by exercise, pick-a-list on an unscheduled day, Plan options removed from the page, wording moved to setup, Countdown and Timer on the starting points that fit. Not built: the cycle anchored on a date (superseded by blocks), duplicate, archive and undo of a tracker edit, a version history view. Everything below is the discussion that led here.

## What exists today (read from the code, not from memory)

Two separate places edit a planned tracker, and they do not talk about the same things:

- **Setup (the flow, also used to edit):** name, icon, what is recorded (fields), schedule (days), names of each day, **"Same list every day"** (Days screen), extras, units. It does not edit the exercises themselves.
- **The tracker page:** exercises (add, edit, reorder, remove), the day's name, **Rest day**, a second copy of **"Same every day / Different each day"** (under "Plan options"), and the wording (Exercise, Set, Range) buried inside an exercise's editor.

The plan is saved as dated versions ("from today"; past days keep what they had), but nothing in the UI shows or undoes a version.

## Findings: where it is hardcoded to the presets

1. **A plan is seven weekdays.** A day's list hangs off Sunday to Saturday. A rotation (Push, Pull, Legs, then repeat, whatever the weekday) cannot be built, and any schedule that is not set weekdays is forced to "one list for every day". A custom tracker can do no better than a preset here, but a common real gym split is out of reach for both.
2. **"Rest" is a magic word.** A rest day is a day whose label is the text "Rest" (PlanEditor, store, setup). Renaming a day "Rest" by hand changes behaviour.
3. **Two fixed shapes.** A plan item is either a set-style row (sets and a range) or an item with its own numbers (a meal), chosen once for the whole tracker. Nothing in between, and it cannot differ per exercise.
4. **Wording is tracker-wide but edited inside one exercise.** "Each entry is a / repeat is a / target is called" belongs in setup.
5. **Duplicate setting.** "Same list every day" is in setup and again in Plan options on the page. You said it should live in setup; it already does, so the page copy is the thing to remove.
6. **Editing is split.** Changing what you record is in setup; changing what you plan is on the page. A person building their own tracker has to know which door to use.

(Whether presets vs custom really differ in what they can reach is covered by the same-bones test, which passes. The limits above hit both. If you meant something I have not listed, say so.)

## Proposed order, smallest first

1. **Remove "Plan options" from the page.** The setup toggle stays the only home. Add the "plan from today" note to the setup toggle. Small, low risk. Tests: the page no longer offers it; the setup toggle still works for an existing tracker.
2. **Rest day stops being a word.** Add a real flag (the plan day already has `rest: boolean`; the label should never decide anything). Migrate old trackers. Tests first.
3. **Wording moves to setup.** One place for Exercise / Set / Range.
4. **One decision before more building: rotation vs weekdays.** See question 1.
5. **Tracker actions:** duplicate, archive, undo of the last change (not the plan versions, just the last edit). One spec each when we get there.

## Open questions

1. **Rotation.** Should a plan be able to be "Day A, Day B, Day C, repeating on the days you train" (not tied to weekdays)? It is the honest fix for finding 1 and the biggest change (data model, schedule, previous-value lookup all assume weekday). Alternative: keep weekdays and treat rotation as later.
2. **Where do exercises get edited?** Keep them on the tracker page (where you are when you notice it) and make setup point to it, or bring the list into setup too?
3. **Anything in "feels hardcoded" that I missed?** A concrete example from your own use is worth more than my reading.

## How we will know it works

Logic tests first for each slice (old trackers load unchanged; an edit never changes past entries; the plan versions keep working). Then by eye in the preview, then the phone. The rotation question needs its own spec before any code.

## Answers (Nick, 2026-11-18) and what follows

- **Where exercises are edited:** on the tracker page. Setup gives the tools and the shape; the page is where things are tracked and planned. Settled.
- **Rotation:** unsure it earns its place as random-time sets, but a repeating cycle that drifts against the calendar (3 days on, 1 off) is a real need, and weekdays cannot anchor it.
- **Parity check:** make sure no word or behaviour is reachable only through a preset. To be done as a read-only audit before the first build slice (every preset's wording and behaviour against what a custom tracker can set).

## Proposal: a cycle instead of a rotation (to agree before any code)

One idea covers weekly plans, drifting splits and alternating days: **a cycle** of N positions, counted from a start date. Each position is a day with its own name and list, or a rest. Today is position `(days since start) mod N`.

- Weekly plan = a cycle of 7 that starts on a Sunday (so nothing changes for existing trackers; they migrate to it).
- 3 on 1 off = a cycle of 4: Push, Pull, Legs, Rest. It drifts across weekdays, which is the point.
- Alternate days (A, B) = a cycle of 2.
- It builds on what exists: the schedule already has "every n days from a date", and the plan versions stay.

Open sub-question: when you skip a training day, does the cycle keep counting the calendar (strict, simple, predictable) or wait for you ("next workout")? Recommendation: calendar by default; "next workout" only if you ask for it later, since it changes what "missed" means for everything downstream.

Cost: the plan stops being indexed by weekday, so the editor header, rest-day switch, previous-value lookup (it walks back by weeks today) and the setup Days screen all change. Slices 1 to 3 above do not depend on it and can go first.

## Rest days, blocks and off-schedule days (Nick, 2026-11-18; direction, details to agree)

- **Rest stops being stored.** A day you did not pick in setup is simply not scheduled. Where the word comes from today: setup writes a day labelled "Rest" with `rest: true` for each unpicked weekday (`core/setup.ts`), the page has a "Rest day" chip (`PlanEditor.tsx`) and a "Rest day" card with "Train anyway" (`TrackerScreen.tsx`), the week strip prints "Rest", and the calendar has a rest dot. The setup toggles already express it; the stored flag and word are a second copy. Direction: remove the flag, the chip and the label sentinel (old trackers migrate), and show an unscheduled day with plain, neutral wording.
- **Blocks of X days.** Anchored on your first log instead of a date: logging a day opens a block (say 3 days); the next two days are expected to be the rest of it; between blocks nothing is expected. Position in the block picks the day's list (1 Push, 2 Pull, 3 Legs). This is the cycle idea with a different anchor, and it needs no "rest" entry at all.
- **Any day can be any list.** On a day with nothing scheduled, or when you swap days, offer "which day are you doing?" instead of a dead end. Previous values must then follow the exercise, not the weekday: today `previousRow` looks back exactly 7 days per step on the same weekday (`core/plan.ts`), so doing Tuesday's list on Wednesday would find no previous numbers. Fix to key on the exercise.
- Past days stay editable by default (the lock is an opt-in extra, off for the gym presets), which covers forced rest days and swapped days after the fact.
- Open: if a block is mid-way and you skip a day, does the block keep counting the calendar (recommended, consistent with the cycle) or pause until you log?

## Decided (Nick, 2026-11-18)

1. **Rest days are dropped as a concept.** No flag, no label, no chip, no card, no "Train anyway", no rest dot. A day left out of the schedule just has no expectation; it is shown like any other day with nothing due. Old trackers migrate (flag and the "Rest" label removed).
2. **Blocks keep counting the calendar.** Skip a day mid-block and the block carries on; the day is missed like any other.
3. **It all lives in the Days panel of setup, under the "How often" dropdown** (blocks of X days becomes one more entry in that list, next to days of the week, every few days, a number of times, once a month, whenever).

## First slice: remove rest days (to build after your go)

- Where it touches: `PlanDay.rest` in the types; the migration in `store.ts`; setup writing "Rest" (`setup.ts`); the page's chip, card and strip label (`PlanEditor.tsx`, `TrackerScreen.tsx`); the calendar dot; and four places that skip rest days when working out what is due (`schedule.ts`, `measures.ts`, `goalPresets.ts`, `store.ts`). Each must use "is it scheduled that day" (the schedule already answers it) instead.
- Tests first: an old tracker with rest days loads with the same scheduled days and no "Rest" label; a day not in the schedule is not due and not counted as missed; logging on such a day still works and counts; the same-bones test still passes.
- By eye: a gym tracker with Sunday off shows Sunday as an ordinary empty day.
- Not in this slice: blocks, "which day today", previous values by exercise. Each its own slice.
