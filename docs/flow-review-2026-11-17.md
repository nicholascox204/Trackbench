# Flow review, 2026-11-17

A walk through the app from first launch to daily use, looking for friction, confusion and bugs, with most attention on tracker creation. Nothing here has been fixed yet; this is a list to decide from.

**How this was done, and its limits.** Part of it was driven live in the web preview (New, the template picker, the summary, the goal step, the goal editor), and part is from reading the code. The preview is slow and drops clicks, so it was not a smooth walkthrough. The "Scratch" path (Start from scratch), the plan editor, icon picking and units were read in code, not run. Nothing was tried on a phone. Each item says how it was found: **seen** (in the preview), **code** (read in the code), or **inferred**.

## What works well

- Getting a first tracker from a template is short: New, pick, Start logging is three taps (seen).
- The summary screen is a good hub: everything is one line you can tap to change (seen).
- The goal editor's pinned sentence and folded "Measured as" line keep a suggested goal to a one-number change (seen).
- Opening on the first unfinished tracker puts the thing you most likely need under your thumb (code).

## Priority 1: likely to hurt real use

1. **A points-and-streaks questionnaire comes before the first tracker (code).** On first launch the app shows the system flow ("Build my system" is pre-selected, followed by several screens on intensity, consistency and so on) and only then the tracker picker. That is the opposite of the stated bar of reaching a first logged tracker in under a minute. *Fix idea:* start at the template picker, give the system sensible defaults or leave it off, and offer "Add points and streaks" later from Progress.
2. **No Android back handling (code).** There is no hardware or gesture back handler. On a Galaxy A53 the back gesture will close the app from any screen, including in the middle of creating a tracker and losing it. *Fix idea:* handle the system back so it behaves like the on-screen back button, with a confirm when a setup would be lost.
3. **Adding a suggested goal moves the list under your finger (seen).** Tapping a suggestion moves it into "Your goals" above, which pushes everything down. A second tap in the same spot then lands on a different card and opens the editor for the goal just added (this happened while testing). There is also no immediate feedback that the first tap did anything. *Fix idea:* keep the card where it is and turn it into a checked state, or confirm with a brief message and keep the layout stable.
4. **Two different "back" actions on one screen, and Cancel loses everything silently (seen and code).** The top button says "Cancel" and exits the flow; the bottom "Back" goes to the previous step. Cancel has no confirmation, and a half-made tracker is held only in memory. *Fix idea:* confirm cancel when anything was changed, and consider one clear pattern.

## Priority 2: confusing or inconsistent

5. **Progress dots show the wrong count at the first step (seen).** On the picker the dots show about six steps, but choosing a template makes it two. *Fix idea:* hide the dots on the picker and show them once the path is known.
6. **"Show up" appears twice with two meanings (seen).** "Show up each day" is the daily rule and stays selected when you add "At least 3 days a week", which is a different kind of goal. Both read as show-up. *Fix idea:* clearer section wording, or hide the weekly show-up suggestion when it only restates the daily rule.
7. **Suggested numbers are arbitrary (seen).** "15.5 mi a week" comes from a default of 3.1 mi times five. Two suggestions share the same reason text. *Fix idea:* round to friendly steps (5, 10, 25), and give each kind of suggestion its own reason.
8. **The avoid tracker shows a green tick from midnight (code).** For "stay clean" trackers a day counts as met whenever nothing is logged, so the bottom bar shows a done tick all day, before anything has happened, and the app never opens on it. *Fix idea:* use a different mark (or none) until the day ends.
9. **Editing a saved tracker, then opening Goals from its summary, discards unsaved edits without warning (code).** The warning text that used to say "save first" went away when the Goals card was folded into the summary line. *Fix idea:* save before navigating, or warn.
10. **Wording in the goal editor (seen).** "Measured as: Minutes · total · This week · At least" uses "total" and a dot-separated list; fine for the author, opaque to a newcomer. *Fix idea:* a plain sentence ("Add up your minutes each week, at least").
11. **Long press in the bar is undiscoverable (inferred).** Edit, delete and move live only behind a long press with no first-run hint. *Fix idea:* a one-time hint, or a visible edit control in the tracker's Setup.
12. **Delete exists in two places with different confirmations (code).** The bar asks twice; the setup screen has its own. Neither offers an export or undo before data is removed.

## Priority 3: smaller things and gaps

13. The footer partly covers the last suggestion card ("Build my own") on the goal step (seen). Scroll padding may need to grow.
14. The goal for "entries per day" on a form tracker is no longer possible, since daily goals need a daily measure (code). Show up covers most of it.
15. No duplicate-name check when creating a tracker (code).
16. After logging one tracker there is no nudge to the next unfinished one (inferred). A natural place to cut taps for people with many check-ins.
17. Setup stores daily goals and over-time goals in two lists in different units and converts at the edge (code). It works and is tested, but is the likeliest place for a future bug.

## Not yet reviewed

- **Start from scratch** (up to seven steps, including a long "what you record" screen with fields, combined numbers and plan options). This is the heaviest path and the one most likely to overwhelm. It needs a timed, on-device run.
- The plan editor during creation, icon search, the units screen.
- Everything on a real phone: touch drag, the scrolling bar, keyboard behavior in the name and field screens.
- Reminders and notifications do not exist yet.

## Suggested order

1. Remove the system gate from first launch.
2. Handle Android back, with a confirm when setup would be lost.
3. Fix the suggestion card reflow.
4. Do a timed on-device pass of Start from scratch and record where people hesitate.
5. Then the Priority 2 items, starting with the avoid-tracker tick and suggestion numbers.

## Status

The four Priority 1 items were fixed the same day (checked by type-check and the existing tests; not yet on a device):

1. **First-run gate removed.** First launch goes straight to making a tracker. The points and streaks system is created with its defaults and can be changed from Progress.
2. **Android back handled.** The system back button or gesture acts like the on-screen back on Progress, Settings, the system builder, Goals (closes the editor first) and setup (steps back through detours and steps). From a tracker it leaves the app.
3. **Suggested goals no longer move.** A suggestion stays where it is and is marked as chosen; a Change button (which keeps its space) appears on chosen ones. Goals that did not come from a suggestion are listed separately above.
4. **Leaving setup asks first.** If anything was changed, Cancel, the footer Back at the first step, and the system back all show "Discard this tracker?" with Keep editing and Discard.
