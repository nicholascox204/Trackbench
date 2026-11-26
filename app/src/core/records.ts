// Personal records for planned sets, found while you log, the way lifting apps mark a PR on the set itself. A set is a record
// when it beats everything done for that exercise on earlier days: a heavier weight, or a higher estimated one-rep max (a
// heavier-for-its-reps set). The first time an exercise is done is not a record; it is where you start.

import { startOfDay } from './time';
import type { Entry, Field, Tracker } from './types';

// Estimated one-rep max (Epley): weight x (1 + reps / 30). One rep is the weight itself. Past about 12 reps it is a rough guide.
export function oneRepMax(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps > 0)) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export function liftFields(t: Tracker): { weight?: Field; reps?: Field } {
  const nums = t.fields.filter((f) => f.type === 'number');
  return {
    weight: nums.find((f) => f.unitKind === 'weight') ?? nums.find((f) => /weight/i.test(f.name)),
    reps: nums.find((f) => f.id === 'reps') ?? nums.find((f) => /rep/i.test(f.name)),
  };
}

// A warm-up set: marked by tapping its number. It is logged like any set but never counts as a record or toward one.
export const isWarmUp = (e: Entry | undefined): boolean => !!e && !!e.values.warm;

export interface Bests { weight: number; e1rm: number; seen: boolean }

// The best done before a day for one exercise (planned slot). Values are base units.
export function bestsBefore(t: Tracker, entries: Entry[], slotId: string, day: number): Bests {
  const { weight, reps } = liftFields(t);
  const out: Bests = { weight: 0, e1rm: 0, seen: false };
  if (!weight) return out;
  for (const e of entries) {
    if (e.slotId !== slotId || !e.done || isWarmUp(e) || startOfDay(e.at) >= day) continue;
    const w = Number(e.values[weight.id]); const r = reps ? Number(e.values[reps.id]) : 1;
    if (!(w > 0)) continue;
    out.seen = true;
    out.weight = Math.max(out.weight, w);
    out.e1rm = Math.max(out.e1rm, oneRepMax(w, r > 0 ? r : 1));
  }
  return out;
}

export type RecordKind = 'weight' | 'e1rm';

// Whether a done set beats the earlier bests: the heaviest weight first, else the estimated max.
export function recordOf(t: Tracker, e: Entry | undefined, bests: Bests): RecordKind | null {
  if (!e?.done || !bests.seen || isWarmUp(e)) return null;
  const { weight, reps } = liftFields(t);
  if (!weight) return null;
  const w = Number(e.values[weight.id]); const r = reps ? Number(e.values[reps.id]) : 1;
  if (!(w > 0)) return null;
  if (w > bests.weight) return 'weight';
  return oneRepMax(w, r > 0 ? r : 1) > bests.e1rm + 1e-9 ? 'e1rm' : null;
}

// ---------- plates ----------

export const PLATE_SETS = {
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
} as const;

// The plates to load on each side of the bar for a total, heaviest first, in the units shown. `left` is what cannot be made
// with the plates (0 when it loads exactly); a total under the bar loads nothing.
export function platesFor(total: number, unit: 'kg' | 'lb'): { perSide: number[]; left: number; bar: number } {
  const { bar, plates } = PLATE_SETS[unit];
  let side = Math.max(0, (total - bar) / 2);
  const perSide: number[] = [];
  for (const p of plates) while (side + 1e-9 >= p) { perSide.push(p); side -= p; }
  return { perSide, left: Math.round(side * 2 * 100) / 100, bar };
}
