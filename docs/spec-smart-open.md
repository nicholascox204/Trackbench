# Spec: opening on the tracker you want. DRAFT for Nick to mark up

Status (2026-11-19, later): **built** as recommended (signals 1, 2 and 5, with the Open on setting, default smart); sequence learning left out. Logic in `core/startPick.ts`, tested. Not yet seen over real days on the phone.

## What happens today
`startNav` in `App.tsx` opens the first tracker, in bar order, that is **due today and not yet successful**; if everything is done it opens the first tracker. A tracker page itself opens on today (or, for an empty plan, the first scheduled day). So "open to today" and "open to the one still waiting" already exist; what is missing is choosing between several that are waiting.

## Signals we could use (all local, simple statistics on your own entries, no AI)
1. **Due and unfinished today** (have it). Strongest; a finished tracker should never win over an unfinished one that is due.
2. **Time of day.** For each tracker, when you usually log (the typical clock time of its past entries, once there are enough, say five). Among the unfinished ones, open the one whose usual time is nearest now. A morning check-in opens in the morning, the gym tracker in the evening.
3. **Sequence.** "After I finish X I usually open Y." Needs more history and gives less than 2; I would leave it out until 2 is proven.
4. **Day of the week.** A gym split that lives on Mon, Wed, Fri is already handled by "due today".
5. **Last used.** If you reopen the app within a short time (say 30 minutes), go back to the tracker you were just on, since you likely left mid-task.

## Recommendation
Build 1 + 2 + 5 as one small, explainable rule, with a setting "Open on: the one I'm likely to need (default) / the one I was last on / always this one" so nothing is a surprise. Do not build 3 yet. Show nothing magical: no "learning" language; the setting's own sub-line says what it does ("uses when you usually log, and what is still due today").

Why it is cheap: the inputs already exist (entry timestamps, due-today logic). A pure function `pickStart(trackers, entries, now, lastUsed)` can be tested with plain data.

## Honest limits
- It needs history: a new tracker has no usual time, so it falls back to bar order.
- Times are noisy (a run at 6 am one week, 8 pm the next); use the median of recent entries, ignore trackers with a wide spread, and fall back.
- It cannot know intent; a wrong guess costs one tap on the bottom bar. That is why it must fall back rather than guess hard.

## Open questions
1. Is "last used within 30 minutes" the right short memory, or should a reopen always go to the last tracker?
2. Should the setting be per app (one rule) or can a tracker say "never pick me automatically"?
3. Reminders at a tracker's usual time are a natural next step but belong with notifications; keep separate?

## How we will know it works
Logic tests first: unfinished beats finished; the nearest usual time wins among unfinished; too little history falls back to bar order; a wide spread falls back; a recent reopen returns to the last tracker; the setting's three modes. Then by eye on the phone over a few days, which no preview can show.
