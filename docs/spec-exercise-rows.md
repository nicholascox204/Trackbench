# Spec: the Add exercise card and the set row. DRAFT for Nick to mark up

Status (2026-11-19): findings from reading the code, a proposal, and questions. Nothing built.

## How it works today (read from the code)

**"Exercise" is only a word.** Nothing in the logic knows what an exercise is. A planned tracker's words come from `Tracker.terms` (`core/terms.ts`): the neutral default is Item, Round, Target; the gym starting points set Exercise, Set, Range (`SETS_TERMS`). The word is also applied to older trackers that have a "sets" measure (`core/store.ts`, on load). It is editable in setup under Logging, "What it calls things". So the label is not hardcoded; one migration is keyed to a measure id.

**The row layout is fixed.** A planned item with repeats (a "row slot": `sets` > 0) draws a header (name, "3 sets · range", done count) and then, per repeat, these columns in this order: the repeat label (S1), PREV, **every number field of the tracker**, and a done tick (`RowSlot` in `screens/TrackerScreen.tsx`).

- The number fields come from setup (Logging, "what you enter"), so weight and reps are the tracker's own fields. That part is customizable.
- But the same fields appear on every exercise. A plank (time, no weight) or a pull-up (reps, no weight) cannot differ from a bench press.
- Only number fields appear. A text, choice or time field is skipped in a set row.
- PREV joins the number fields with " × " ("80 × 6"), which reads as weight times reps and is wrong for other fields.
- The done tick is always there and cannot be turned off.

**The range is free text on the exercise.** `Slot.range` ("6-8", "30-60s") is a string. It is shown once in the header and means nothing to the app: it is not tied to the reps field, not compared with what you log, and not shown in the column it describes.

**Add exercise** (`AddSlot` in `screens/PlanEditor.tsx`): a name, a sets stepper and the range text. Which of the two shapes it builds depends on the tracker's item style (Entered each time vs Ticked off), chosen once for the tracker.

## What is hardcoded, in order of how much it limits you

1. One set of fields for every exercise (no bodyweight or timed exercise next to a barbell one).
2. The range is text, not a target on a field.
3. Set rows show only number fields, in tracker order, always with a done tick.
4. PREV is "a × b" whatever the fields are.
5. Every set is identical; no per-set target (a warm-up, a top set, a drop set).

Items 1 and 2 are what make "weight and reps alongside the range" feel arbitrary.

## Proposal (small steps, each testable on its own)

1. **Per-exercise fields.** An exercise may turn off tracker fields that do not apply to it (default: all on, so nothing changes). A plank turns off weight; a pull-up turns off weight. The Add exercise card gets a quiet "What you log" row listing the fields as small chips, all on.
2. **Targets belong to a field.** A target goes on a field of the exercise ("Reps 6-8", "Time 30-60s"), shown in that column (the placeholder when there is nothing previous, plus the header line). The old free-text range is kept as the first field's target on migration, or as a note if there is no clear match. Nothing is compared or judged yet; that is an analytics question.
3. **PREV follows the fields.** Show each logged field with its own unit, in column order ("80 lb · 6"), only for the fields the exercise uses.
4. **Done tick stays** (it is the part that makes a row a set), but is not a field.
5. Not now: per-set targets, text or choice fields inside a set row, auto-progression.

## Open questions

1. **Per-exercise fields (step 1): worth it?** The alternative is that all exercises share the tracker's fields and the answer to "a plank has no weight" is "leave it empty" (what you do now).
2. **Target on a field (step 2)** versus keeping one free-text range that you read yourself. The first is more structured; the second is simpler and costs nothing. Which fits how you look at the card in the gym?
3. **The word "Add exercise".** It reads from the tracker's wording already. Is the issue the word, or that the card assumes sets and a range?
4. **Where does the card get its fields from** when someone builds a tracker with no number fields (a language list, say)? Today it falls back to the ticked-off shape. That is a separate shape choice and could be a switch on the card.

## How we will know it works

Logic tests first: an exercise with a field turned off hides it and keeps its entries; old exercises and ranges load unchanged; PREV with other fields; the from-scratch tracker equals the template. Then by eye in the preview, then the phone.
