# Parked: goals and motivation screens

Taken out of the running app on 2026-11-18 so work can focus on the trackers themselves. Nothing was deleted.

- The screens here keep their original paths under `src/`. To bring them back, copy `src/` over the app's `src/`, then undo the edits listed below.
- The engine, types, store functions and tests for motivation (`core/motivation.ts`, `core/goals.ts`, `core/quests.ts`, `core/engine.ts`, `core/derive.ts`, `core/store.ts`) were left in place and still run. Saved data is untouched.
- Edits made to live files: `App.tsx` (nav states goals, quest, motivation, game and their screens), `ui/TrackerBar.tsx` (Motivation and Settings row replaced by a Settings tile at the end of the tracker row), `screens/SetupFlow.tsx` ("Counts toward motivation" toggle), `tsconfig.json` (excludes this folder).
- Design notes: DESIGN.md (Motivation section) and CASE_STUDY.md (entries from 2026-11).
