// Plans: weekly slots with effective-dated versions, and previous-value lookup.

import { addDays, startOfDay } from './time';
import { blockPosition, scheduleOf } from './schedule';
import type { Entry, PlanDay, PlanVersion, Slot, Tracker } from './types';

export function dayKeyOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

export function emptyPlanDays(): PlanDay[] {
  return WEEKDAYS.map(() => ({ label: '', slots: [] }));
}

// The plan version that was active on a given day (the first version if none predates it).
export function versionFor(plan: PlanVersion[], dayStart: number): PlanVersion | null {
  if (plan.length === 0) return null;
  const key = dayKeyOf(dayStart);
  let found: PlanVersion | null = null;
  for (const v of plan) {
    if (v.from <= key && (!found || v.from >= found.from)) found = v;
  }
  return found ?? plan[0];
}

// Which plan a day is viewed through. A past day shows the plan it had, so history stays as it was; but a past day that had
// nothing planned shows the plan of today instead, so you can build it from there (what you add applies from today on, and
// it is what you then see). Nothing can be lost by this: there was no list to change. The same goes for a past day viewed
// through a plan that was itself made today: edits go into that very plan, so what you change is what the past day shows.
export function viewVersion(plan: PlanVersion[], day: number, today: number, index: number): { version: PlanVersion | null; fromToday: boolean } {
  const then = versionFor(plan, day);
  const had = (then?.days[index]?.slots.length ?? 0) > 0;
  const madeToday = !!then && then.from === dayKeyOf(today);
  if (day < today && (!had || madeToday)) return { version: versionFor(plan, today), fromToday: true };
  return { version: then, fromToday: false };
}

// Which list a day uses: the weekday's, or for blocks of days the day's position in the block (outside a block, the first
// list, ready for the next one). Blocks need the tracker's entries to know where a block began.
export const MAX_LISTS = 7; // a plan holds seven lists

// A rotation takes its lists in turn. Which list a slot belongs to, by position.
const listOfSlot = (v: PlanVersion, slotId: string | undefined): number => (slotId ? v.days.findIndex((d) => d.slots.some((s) => s.id === slotId)) : -1);

// The list trained most recently before a moment, or -1.
function lastTrainedBefore(v: PlanVersion, t: Tracker, all: Entry[], before: number): number {
  let best: Entry | null = null;
  for (const e of all) {
    if (e.trackerId !== t.id || !e.done || e.at >= before || listOfSlot(v, e.slotId) < 0) continue;
    if (!best || e.at > best.at) best = e;
  }
  return best ? listOfSlot(v, best.slotId) : -1;
}

// The list that comes next: the one after the last you trained (counting what is logged on this day), wrapping round. Days you
// skip do not move it.
export function nextList(t: Tracker, dayStart: number, all: Entry[]): number {
  const v = versionFor(t.plan, dayStart);
  const n = v?.days.length ?? 0;
  if (!v?.rotation || n === 0) return 0;
  const last = lastTrainedBefore(v, t, all, dayStart + 86400000);
  return last < 0 ? 0 : (last + 1) % n;
}

// Which list a day uses when picking from a set of lists: the one chosen for the day, else the latest one logged on it, else
// the one used last.
function rotationIndex(t: Tracker, dayStart: number, all: Entry[]): number {
  const v = versionFor(t.plan, dayStart);
  const n = v?.days.length ?? 0;
  if (!v || n === 0) return 0;
  if (t.rotationPick && t.rotationPick.day === dayStart && t.rotationPick.index < n) return t.rotationPick.index;
  let latest: Entry | null = null;
  for (const e of all) {
    if (e.trackerId !== t.id || !e.done || startOfDay(e.at) !== dayStart || listOfSlot(v, e.slotId) < 0) continue;
    if (!latest || e.at > latest.at) latest = e;
  }
  if (latest) return listOfSlot(v, latest.slotId);
  // Nothing chosen or logged today: the list used last, never an automatic next one (shifts and odd days make a fixed order
  // wrong); before anything is logged, the list last picked by hand, else the first.
  const last = lastTrainedBefore(v, t, all, dayStart);
  if (last >= 0) return last;
  return t.rotationPick && t.rotationPick.index < n ? t.rotationPick.index : 0;
}

export function planIndexFor(t: Tracker, dayStart: number, all?: Entry[]): number {
  if (versionFor(t.plan, dayStart)?.rotation) return rotationIndex(t, dayStart, all ?? []);
  const sc = scheduleOf(t, dayStart);
  if (sc.kind !== 'blocks') return new Date(dayStart).getDay();
  const days = (all ?? []).filter((e) => e.trackerId === t.id && e.done).map((e) => startOfDay(e.at));
  return (blockPosition(sc.n, days, dayStart) ?? 1) - 1;
}

export function planFor(t: Tracker, dayStart: number, all?: Entry[]): PlanDay | null {
  const v = versionFor(t.plan, dayStart);
  if (!v) return null;
  return v.days[planIndexFor(t, dayStart, all)] ?? null;
}

// Plans saved before rest days were dropped: the flag and the "Rest" label go; nothing else changes.
export function stripRest(days: PlanDay[]): PlanDay[] {
  return days.map((d) => {
    const { rest: _rest, ...day } = d as PlanDay & { rest?: boolean };
    return day.label === 'Rest' ? { ...day, label: '' } : day;
  });
}

export function isRowSlot(slot: Slot): boolean {
  return (slot.sets ?? 0) > 0;
}

export function slotCount(slot: Slot): number {
  return isRowSlot(slot) ? (slot.sets as number) : 1;
}

// The most recent earlier done entry for the same exercise and set, whatever weekday it was on (so doing another day's
// list on a different day still finds its numbers).
export function previousRow(entries: Entry[], slotId: string, row: number | undefined, dayStart: number): Entry | null {
  let best: Entry | null = null;
  for (const e of entries) {
    if (e.slotId !== slotId || e.row !== row || !e.done || Object.keys(e.values).length === 0) continue;
    if (startOfDay(e.at) >= dayStart) continue;
    if (!best || e.at > best.at) best = e;
  }
  return best;
}

// "Same list every day": copy the source day's list onto every other day the tracker is scheduled on.
export function syncSame(days: PlanDay[], src: number, active: number[]): void {
  const list = days[src]?.slots ?? [];
  days.forEach((d, i) => {
    if (i !== src && active.includes(i)) d.slots = JSON.parse(JSON.stringify(list));
  });
}
