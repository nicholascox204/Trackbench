// A tracker's setup is dated, the way its plan is: an edit applies from today on, and every earlier day keeps the setup it
// had, so looking back shows each day as it was logged and judged. Editing while looking at a past day changes nothing
// about that day or the days after it up to today; edits always take effect from today.

import { dayKeyOf } from './plan';
import type { SetupVersion, Tracker } from './types';

// The parts of a tracker that decide what a day holds and how it is judged. Name, icon, tools and goals are not dated:
// those are about the tracker now (goals carry their own start date).
export const DATED_KEYS = ['input', 'fields', 'measures', 'primaryMeasure', 'targets', 'derived', 'success', 'schedule', 'window', 'planStyle', 'daily', 'avoid', 'terms'] as const;

export function setupOf(t: Tracker): Omit<SetupVersion, 'until'> {
  const out: Record<string, unknown> = {};
  for (const k of DATED_KEYS) if (t[k] !== undefined) out[k] = JSON.parse(JSON.stringify(t[k]));
  return out as Omit<SetupVersion, 'until'>;
}

const same = (x: unknown, y: unknown): boolean => JSON.stringify(x) === JSON.stringify(y);

// The tracker as it was set up on a given day.
export function trackerOn(t: Tracker, day: number): Tracker {
  if (!t.past?.length) return t;
  const key = dayKeyOf(day);
  const v = t.past.find((p) => key < p.until);
  if (!v) return t;
  const { until: _u, ...setup } = v;
  // Keys a version did not have are cleared, so an old setup is not mixed with a newer one.
  const cleared = Object.fromEntries(DATED_KEYS.map((k) => [k, undefined]));
  return { ...t, ...cleared, ...setup } as Tracker;
}

// Saving an edit: when the setup really changed and the tracker had days before today, the old setup is kept for them.
// Several edits on one day keep only the setup from before the first, since today follows the newest.
export function withHistory(before: Tracker, after: Tracker, now = Date.now()): Tracker {
  const today = dayKeyOf(now);
  const old = setupOf(before);
  const next = setupOf(after);
  if (same(old, next)) return { ...after, past: before.past };
  const past = [...(before.past ?? [])];
  const startedBefore = dayKeyOf(before.createdAt) < today;
  if (startedBefore && past[past.length - 1]?.until !== today) past.push({ ...old, until: today });
  return { ...after, ...(past.length ? { past } : {}) };
}
