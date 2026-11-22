import { isRowSlot, planFor, slotCount } from './plan';
import { blockPosition, inWindow, isDueOn, scheduleOf } from './schedule';
import type { Entry, Measure, PlanDay, Target, Tracker } from './types';

export function num(v: number | string | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const p = parseFloat(String(v ?? ''));
  return Number.isNaN(p) ? 0 : p;
}

export function computeMeasure(m: Measure, done: Entry[]): number {
  const c = m.calc;
  switch (c.op) {
    case 'done':
      return done.length > 0 ? 1 : 0;
    case 'count':
      return done.length;
    case 'sum':
      return done.reduce((s, e) => s + num(e.values[c.field]), 0);
    case 'max':
      return done.reduce((x, e) => Math.max(x, num(e.values[c.field])), 0);
    case 'latest': {
      if (done.length === 0) return 0;
      const last = [...done].sort((a, b) => a.at - b.at)[done.length - 1];
      return num(last.values[c.field]);
    }
    case 'sumProduct':
      return done.reduce((s, e) => s + num(e.values[c.a]) * num(e.values[c.b]), 0);
    case 'sumExpr':
      return done.reduce((s, e) => {
        const av = e.values[c.a];
        const bv = e.values[c.b];
        if (av === undefined || av === '' || bv === undefined || bv === '') return s; // an entry missing either is left out
        const x = num(av);
        const y = num(bv);
        if (c.fn === 'add') return s + x + y;
        if (c.fn === 'sub') return s + (x - y);
        return s + ((((y - x) % 1440) + 1440) % 1440) / 60; // time to time, across midnight, in hours
      }, 0);
    case 'ratio': {
      const top = done.reduce((s, e) => s + num(e.values[c.a]), 0);
      const bottom = done.reduce((s, e) => s + num(e.values[c.b]), 0);
      return bottom === 0 ? 0 : top / bottom;
    }
    case 'completion':
      return 0; // needs the plan; computed in computeDay
  }
}

// A number worked out from two others (a product, a sum, a difference, a ratio, the time between two times).
export const isCalculated = (m: Measure): boolean => m.calc.op === 'sumProduct' || m.calc.op === 'sumExpr' || m.calc.op === 'ratio';

export function completionPct(planDay: PlanDay | null, done: Entry[]): number {
  if (!planDay) return 0;
  let total = 0;
  const keys = new Set<string>();
  for (const slot of planDay.slots) {
    total += slotCount(slot);
    for (const e of done) {
      if (e.slotId !== slot.id) continue;
      if (isRowSlot(slot)) {
        if ((e.row ?? 0) < slotCount(slot)) keys.add(`${slot.id}|${e.row ?? 0}`);
      } else {
        keys.add(`${slot.id}|-`);
      }
    }
  }
  return total === 0 ? 0 : Math.round((keys.size / total) * 100);
}

// All measures for one tracker on one day. Built-ins: done, count, completion.
export function computeDay(t: Tracker, dayEntries: Entry[], planDay: PlanDay | null): Record<string, number> {
  const done = dayEntries.filter((e) => e.done);
  const out: Record<string, number> = { done: done.length > 0 ? 1 : 0, count: done.length };
  for (const m of t.measures) {
    if (m.calc.op !== 'completion') out[m.id] = computeMeasure(m, done);
  }
  out.completion = t.input === 'plan' ? completionPct(planDay, done)  : done.length > 0 ? 100 : 0;
  return out;
}

export function targetMet(target: Target, measures: Record<string, number>): boolean {
  const v = measures[target.measure] ?? 0;
  const logged = (measures.done ?? 0) > 0;
  if (target.min !== undefined && v < target.min) return false;
  if (target.max !== undefined && (!logged || v > target.max)) return false;
  return target.min !== undefined || target.max !== undefined ? true : false;
}

export function trackerSuccess(t: Tracker, measures: Record<string, number>): boolean {
  const rule = t.success;
  if (rule.mode === 'clean') return (measures.done ?? 0) === 0;
  if (rule.mode === 'logged') return (measures.done ?? 0) > 0;
  if (rule.mode === 'plan') return (measures.completion ?? 0) >= rule.minPct;
  if (rule.mode === 'targets') {
    const list = rule.targetIds.map((id) => t.targets.find((x) => x.id === id)).filter((x): x is Target => !!x);
    const planOk = rule.planMinPct === undefined || (measures.completion ?? 0) >= rule.planMinPct;
    return planOk && (list.length > 0 ? list.every((x) => targetMet(x, measures)) : (measures.done ?? 0) > 0);
  }
  const target = t.targets.find((x) => x.id === rule.targetId);
  return target ? targetMet(target, measures) : (measures.done ?? 0) > 0;
}

// Is this tracker expected on this day (a day the schedule leaves out, or an empty plan day, is not)? Blocks of days need
// the tracker's entries to know where a block began.
export function expectedOn(t: Tracker, dayStart: number, all?: Entry[]): boolean {
  if (dayStart < new Date(t.createdAt).setHours(0, 0, 0, 0)) return false;
  if (!inWindow(t.window, dayStart)) return false;
  const sched = scheduleOf(t, dayStart);
  if (sched.kind === 'blocks') {
    const logged = (all ?? []).filter((e) => e.trackerId === t.id && e.done).map((e) => e.at);
    if (blockPosition(sched.n, logged, dayStart) === null) return false;
  } else if (!isDueOn(sched, dayStart)) return false; // a day the schedule does not ask for, or a kind with no particular day
  if (t.input !== 'plan') return true;
  const pd = planFor(t, dayStart, all);
  return !!pd && pd.slots.length > 0;
}

// What the simulator needs to fake a successful day.
export function successSpec(t: Tracker): { measure: string; value: number } {
  const r = t.success;
  if (r.mode === 'clean') return { measure: 'done', value: 0 };
  if (r.mode === 'plan') return { measure: 'completion', value: r.minPct };
  if (r.mode === 'target' || r.mode === 'targets') {
    const target = t.targets.find((x) => x.id === (r.mode === 'target' ? r.targetId : r.targetIds[0]));
    if (target) return { measure: target.measure, value: target.min ?? target.max ?? 1 };
  }
  return { measure: 'done', value: 1 };
}
