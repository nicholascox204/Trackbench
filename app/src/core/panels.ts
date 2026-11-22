// The Overview's panels (see docs/hub-spec.md, section 20). Each tracker speaks in its own shape on one page, so nothing has to be
// squeezed onto a shared scale. Four kinds of panel, chosen from the tracker's setup (or by "watch", when the person says so):
//   habit   a good day is defined (any entry, finish the plan, a number): a grid of days, drawn in progress toward the target
//   limit   a good day is staying within a number (coffee at most 4): bars with the limit drawn across them
//   reading a number you watch (weight, heart rate): its line, with the change over the period
//   plan    a planned tracker (lifting): sessions kept, and a staircase of your best
// Pure functions over a DayIndex; nothing is saved.

import { addDays } from './time';
import { DayIndex, buckets, type Bucket, type Point, type Range } from './overview';
import type { Field, Measure, Tracker } from './types';

export type PanelKind = 'habit' | 'limit' | 'reading' | 'plan';

const isNumber = (f: Field): boolean => f.type === 'number';

// The number a reading panel draws: a field marked as a reading, else the first number.
export function mainField(t: Tracker): Field | undefined {
  return t.fields.find((f) => isNumber(f) && f.reading) ?? t.fields.find(isNumber);
}

// The limit a tracker is held to, when its whole target is "at most".
export function limitOf(t: Tracker): { measure: Measure; max: number } | undefined {
  if (t.success.mode !== 'target') return undefined;
  const id = t.success.targetId;
  const target = t.targets.find((x) => x.id === id);
  const measure = target && t.measures.find((m) => m.id === target.measure);
  return target && measure && target.max !== undefined && target.min === undefined ? { measure, max: target.max } : undefined;
}

export function panelKind(t: Tracker): PanelKind {
  if (t.watch) return 'reading';
  if (t.input === 'plan') return 'plan';
  if (limitOf(t)) return 'limit';
  // A number you take as a reading, with nothing asked of it, is something you watch rather than a habit to keep.
  if (t.success.mode === 'logged' && t.fields.some((f) => isNumber(f) && f.reading)) return 'reading';
  return 'habit';
}

// ---------- trend ----------

export interface Trend { first: number; last: number; change: number; since: number; until: number }

// How a reading moved across a stretch: the first value to the latest, with the span they cover. Slices with no reading are skipped.
export function trendOf(points: Point[]): Trend | undefined {
  const have = points.filter((p) => p.value !== undefined && !p.future);
  if (have.length < 2) return undefined;
  const a = have[0]; const b = have[have.length - 1];
  return { first: a.value as number, last: b.value as number, change: (b.value as number) - (a.value as number), since: a.start, until: b.end };
}

// ---------- records ----------

// The number a planned tracker's best is judged on: its heaviest-lift style measure ('max' of a field), else a volume.
export function bestMeasure(t: Tracker): Measure | undefined {
  return t.measures.find((m) => m.calc.op === 'max') ?? t.measures.find((m) => m.calc.op === 'sumProduct');
}

export interface Records { points: Point[]; days: number[]; best: number | undefined }

// A running best, bucket by bucket: it can only stay level or step up. `days` are the days a new best was set (not the first value,
// which is just where you began).
export function records(t: Tracker, ix: DayIndex, range: Range, bucket: Bucket, today: number, weekStart: 'mon' | 'sun' | 'sat'): Records {
  const m = bestMeasure(t);
  if (!m) return { points: [], days: [], best: undefined };
  const slices = buckets(range, bucket, weekStart as never);
  const days: number[] = [];
  let best: number | undefined;
  const points: Point[] = slices.map((s) => {
    if (s.start > today) return { start: s.start, end: s.end, value: undefined, future: true };
    for (let d = s.start; d <= Math.min(s.end, today); d = addDays(d, 1)) {
      const v = ix.result(t, d).measures[m.id];
      if (v === undefined || v <= 0) continue;
      if (best !== undefined && v > best) days.push(d);
      if (best === undefined || v > best) best = v;
    }
    return { start: s.start, end: s.end, value: best, future: false };
  });
  return { points, days, best };
}

// ---------- the daily numbers of a limit ----------

export function dailyValues(t: Tracker, ix: DayIndex, measureId: string, start: number, end: number, today: number): Point[] {
  const out: Point[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const v = d > today ? undefined : ix.result(t, d).measures[measureId];
    out.push({ start: d, end: d, value: v, future: d > today });
  }
  return out;
}

// ---------- the page ----------

export interface PanelSpec { id: string; kind: PanelKind; tracker: Tracker; logged: number }

// One panel per tracker with history, most logged first, so the page opens with what a person actually uses.
export function pagePanels(ix: DayIndex, today: number, since: number): PanelSpec[] {
  const out: PanelSpec[] = [];
  for (const t of ix.trackers) {
    let n = 0;
    for (const e of ix.of(t.id)) if (e.done && e.at >= since && e.at < addDays(today, 1)) n++;
    if (n > 0) out.push({ id: t.id, kind: panelKind(t), tracker: t, logged: n });
  }
  return out.sort((a, b) => b.logged - a.logged || a.tracker.name.localeCompare(b.tracker.name));
}
