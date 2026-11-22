# Builder audit (2026-11-22)

A working document, not the spec. Every screen and option of the tracker builder, with a verdict: **cut**, **move**, **rename** or **keep**. The rule behind it: headlines carry the meaning (no subtext), cards stay short, defaults cover most people, and the front of the builder shows only what most people change.

**Status (2026-11-22):** the subtext sweep, the renames and these cuts are built: caption lines, subtext on every option and switch, "What it calls things", "Plus and minus move by", "Past entries are kept", Only for a while (now shown only where a limit already exists), Build your own moved below the presets, Take turns renamed Choose each time, Timer renamed Stopwatch. The summary re-layout is also built (You log, It shows, Tools, Options; Units and Extras screens removed; Calculations surfaced under It shows; copy buttons moved to Options). Housekeeping (dead code from the old Days and Units screens) is done.

Counts: about 35 pieces of subtext in the builder (23 option lines, 12 toggles/notes). Nothing here is built yet unless marked.

## 1. Start picker ("What do you want to track?")

| Item | Verdict |
|---|---|
| "Build your own / Start blank and shape it your way." sits above the presets | **Move** below the presets, or make it a plain link at the end. Presets are the main path. Drop the subtext. |
| "Pick a starting point. You can change everything afterwards." | **Cut.** |
| Search, preset cards with a one-line blurb | **Keep.** The blurb is the only description a preset has. |

## 2. Summary (the screen most people stop on)

| Item | Verdict |
|---|---|
| Name and icon card | **Keep.** |
| Days card (How often, Lists, Only for a while) | See section 3. |
| Logging row | **Keep.** It opens the Logging screen. |
| **Units row** with three inline chips | **Move off the front.** Settings holds the default. Show a per-tracker choice only on the Extras screen, and only for a tracker with unit-bearing numbers (weight, distance). Engine and imported data unchanged. |
| Extras row ("None on" / list of what is on) | **Keep**, but rename the row to what it holds (see section 5). |
| Manage: "Copy structure (to share or edit)", "Copy data for AI review" | **Move to Settings** (or the tracker's own menu). Two clipboard buttons on every summary are noise, and "for AI review" conflicts with "no AI in the product". Rename to "Copy tracker to share". |
| Delete (two taps, "You can restore it from Settings.") | **Keep.** |

## 3. Days card

| Item | Verdict |
|---|---|
| How often dropdown | **Keep.** |
| Certain days toggles, a count for times a week | **Keep.** |
| **Only for a while** | **Cut from the card.** Almost nobody sets a time limit; only the 30-day challenge preset uses it. Show the row only on a tracker that already has a limit (so the challenge stays editable), and nowhere else. |
| Every few days, Once a month | **Keep** in the dropdown; rare but harmless there. |
| **Lists: "Take turns"** | **Rename.** It does not say what happens. Proposal: **The same list / A list per weekday / Choose each time.** The suggested next list stays on the tracker page. |
| Count of lists for the rotation | **Keep.** |

## 4. Logging screen

| Item | Verdict |
|---|---|
| "How do you log it?" three buttons: Tap once / Tap to count / Enter details | **Keep.** |
| Caption line under the buttons ("Mark it done. Good for habits.") | **Cut.** |
| Tap to count: "Each tap adds" stepper | **Keep.** |
| "What it counts (optional)" label plus a box whose placeholder says "Unit, if any" | **Trim** to one box: placeholder "Unit (optional)". |
| Daily target: None / At most / At least, and a stepper | **Keep** (headline only). |
| "Track something I'm avoiding" + its subtext; "Show a streak" + subtext | **Cut the subtext.** Keep both switches. |
| **"How entries work"**: Add as you go / One value a day / **A list for each day** | **Rename the third** to **A planned list**. It clashes with the Days card's "A list per weekday" (a different thing). Cut the three subtexts. |
| Plan mode: "Items work as": Repeats you fill in / One tick, set numbers | **Rename** to **Sets you log / Items you tick.** Cut subtext. |
| **"What it calls things"** (three text boxes: Each entry is a / Each repeat is a / The target is called) | **Cut.** Presets set these words; nobody needs to rename "repeat" while building. |
| "Name each entry" switch, plus a box "What each entry is called" | **Keep the switch,** drop the subtext. |
| "What do you enter?" field cards | **Keep.** |
| **Field editor:** Name | **Keep.** |
| Field editor: **"Measures"** dropdown (a dozen options with a subtext each) | **Rename** to **Unit** and cut the subtexts. |
| Field editor: **"Plus and minus move by"** stepper | **Cut** from the editor. Defaults come from the unit; it is the kind of thing found by wanting it later. (Can come back as an advanced row.) |
| Field editor: "More than once a day: Add them up / Keep the latest" plus an explanation line | **Keep** the choice, **rename** to **Several a day: Add up / Latest**, cut the explanation. |
| Field editor: rating scale (1 to 5 / 1 to 10), choice options, "Pick more than one" + subtext | **Keep**, cut the subtext. |
| Field editor: Move up / Move down | **Keep.** |
| Field editor: "Past entries are kept." note | **Cut.** |
| Add something: six types, each with a subtext | **Cut the subtexts.** Rename **Hours and minutes** to **Duration**. |
| **Calculations**: header, explanation, five operations with a subtext each, two pickers, a name box | **Collapse to one button,** "+ Add a calculation", shown only with two or more numbers. Cut the header and explanation, cut the subtexts, auto-name the result ("Weight × Reps"). |

## 5. Extras screen

| Item | Verdict |
|---|---|
| Show previous numbers (numbers trackers) | **Keep.** Rename **Previous numbers.** Cut subtext. |
| 3-day average (readings only) | **Keep,** cut subtext. |
| **Countdown** and **Timer** | **Rename Timer to Stopwatch** so the two do not sound alike. Cut subtexts. |
| "When the countdown finishes, its set time goes in here." / "When you stop the timer, its time goes in here." pickers | **Replace** with a short labelled picker, **Fills:** [field], shown only when there is a time field. |
| Lock past days | **Keep,** cut subtext. |
| Row title "Extras" | **Rename** if it also carries Units: **Options**. |

## 6. Units screen

**Cut the screen and its summary row.** The per-tracker choice moves to Extras (see section 2).

## 7. Housekeeping

- Remove dead code: the `days` and `units` steps and their question text, `DaysSummary`, `DaysScreen`.
- Step headings: "Extras" becomes "Options" if renamed; the rest are fine.
- A live preview of the logging form on the summary ("this is what you will log") would help people like the friend who removed weight, but it adds length. Not recommended now.
- Plug-and-play versus editable presets still look the same. Worth a small marker later.

## Proposed order

1. **Subtext sweep** (about 35 pieces) and the renames above. Low risk, big effect on length.
2. **Cuts:** Only for a while (conditional), Units row and screen, "What it calls things", plus-and-minus step, the Calculations header.
3. **Moves:** Build your own below the presets, Manage buttons to Settings, Units choice to Extras.
4. **Housekeeping** and tests.
