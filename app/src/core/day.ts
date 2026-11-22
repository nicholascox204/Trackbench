// What a tracker did on one day: whether it was expected, whether it counted as done, and its numbers. Kept apart from
// derive.ts so that things which need only this (quests) do not depend on the whole replay.

import type { DayTrackerResult } from './engine';
import { computeDay, expectedOn, trackerSuccess } from './measures';
import { planFor } from './plan';
import { startOfDay } from './time';
import type { Entry, Tracker } from './types';

export function dayResult(t: Tracker, dayEntries: Entry[], day: number, all?: Entry[]): DayTrackerResult {
  const measures = computeDay(t, dayEntries, planFor(t, day, all));
  const expected = expectedOn(t, day, all);
  const ok = trackerSuccess(t, measures);
  // On a day the schedule does not ask for (a day left out, "whenever", between "every few days") nothing is owed, so a day
  // only shows as done when something was logged. It stays out of points and streaks, which only look at expected days.
  return { expected, success: expected ? ok : (measures.done ?? 0) > 0 && ok, measures };
}

export function entriesOnDay(entries: Entry[], trackerId: string, day: number): Entry[] {
  return entries.filter((e) => e.trackerId === trackerId && startOfDay(e.at) === day);
}
