// The Overview's engine (see docs/hub-spec.md). Pure functions over trackers and entries; nothing here is saved, so it
// works the moment it is pointed at any history. Four jobs:
//   1. one list of goals (a tracker's own and the system's quests) and how each one went, period by period;
//   2. series: any source over a period, in day, week or month buckets, clamped to the history a person really has;
//   3. which shapes suit a source over a period (so a week and "all time" can look different);
//   4. the starting panels, built from the data that exists, never from what a tracker is for.

import { dayResult } from './day';
import type { DayTrackerResult } from './engine';
import { aggregate, daysOf, isMet, periodOf, dayKey, dayFromKey, type DayVal, type WeekStart } from './goals';
import { scheduleOf } from './schedule';
import { addDays, startOfDay } from './time';
import type { Entry, GoalAgg, GoalDef, Quest, Tracker } from './types';

const DAY = 86400000;

// ---------- the history a person has ----------

// Entries grouped by tracker and day, built once, so a long history is not searched again for every day.
export class DayIndex {
  private byKey = new Map<string, Entry[]>();
  private results = new Map<string, DayTrackerResult>();
  private perTracker = new Map<string, Entry[]>();
  readonly first: number | undefined; // the first day anything was logged

  constructor(readonly trackers: Tracker[], readonly entries: Entry[]) {
    let first: number | undefined;
    for (const e of entries) {
      const d = startOfDay(e.at);
      const k = `${e.trackerId}|${d}`;
      const l = this.byKey.get(k);
      if (l) l.push(e); else this.byKey.set(k, [e]);
      const p = this.perTracker.get(e.trackerId);
      if (p) p.push(e); else this.perTracker.set(e.trackerId, [e]);
      if (e.done && (first === undefined || d < first)) first = d;
    }
    this.first = first;
  }

  on(trackerId: string, day: number): Entry[] { return this.byKey.get(`${trackerId}|${day}`) ?? []; }
  of(trackerId: string): Entry[] { return this.perTracker.get(trackerId) ?? []; }

  firstOf(trackerId: string): number | undefined {
    let f: number | undefined;
    for (const e of this.of(trackerId)) if (e.done) { const d = startOfDay(e.at); if (f === undefined || d < f) f = d; }
    return f;
  }

  result(t: Tracker, day: number): DayTrackerResult {
    const k = `${t.id}|${day}`;
    let r = this.results.get(k);
    if (!r) { r = dayResult(t, this.on(t.id, day), day, this.of(t.id)); this.results.set(k, r); }
    return r;
  }
}

// ---------- periods ----------

export type PeriodChoice = 'week' | 'month' | '30d' | '90d' | 'year' | 'all';
export const PERIOD_CHOICES: PeriodChoice[] = ['week', 'month', '30d', '90d', 'year', 'all'];

export interface Range { start: number; end: number; days: number; clamped: boolean; label: string }

const FIXED: Record<'30d' | '90d' | 'year', { n: number; label: string }> = {
  '30d': { n: 30, label: 'Last 30 days' }, '90d': { n: 90, label: 'Last 90 days' }, year: { n: 365, label: 'Last year' },
};
const daysIn = (a: number, b: number): number => Math.round((b - a) / DAY) + 1;

// A period turned into dates. A period longer than the history is cut back to it and says so ("All 28 days"), so a person
// with a month of data never sees a mostly empty year. Week and month are the calendar ones (they may end in the future).
export function rangeFor(choice: PeriodChoice, today: number, weekStart: WeekStart, first: number | undefined): Range {
  const f = first ?? today;
  if (choice === 'week' || choice === 'month') {
    const p = periodOf(choice, today, weekStart);
    return { start: p.start, end: p.end, days: daysIn(p.start, p.end), clamped: false, label: choice === 'week' ? 'This week' : 'This month' };
  }
  if (choice === 'all') {
    const start = Math.min(f, today);
    const n = daysIn(start, today);
    return { start, end: today, days: n, clamped: false, label: `All ${n} day${n === 1 ? '' : 's'}` };
  }
  const { n, label } = FIXED[choice];
  const want = addDays(today, -(n - 1));
  if (want >= f) return { start: want, end: today, days: n, clamped: false, label };
  const start = Math.min(f, today);
  const have = daysIn(start, today);
  return { start, end: today, days: have, clamped: true, label: `All ${have} day${have === 1 ? '' : 's'}` };
}

export type Bucket = 'day' | 'week' | 'month';

export interface Slice { start: number; end: number }

export function buckets(range: Range, bucket: Bucket, weekStart: WeekStart): Slice[] {
  const out: Slice[] = [];
  if (bucket === 'day') {
    for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push({ start: d, end: d });
    return out;
  }
  let d = range.start;
  while (d <= range.end) {
    const p = periodOf(bucket, d, weekStart);
    out.push({ start: Math.max(p.start, range.start), end: Math.min(p.end, range.end) });
    d = addDays(p.end, 1);
  }
  return out;
}

// The grain a range reads best at when nobody chose: days for about a month, weeks to about four months, months beyond.
export function bucketFor(range: Range): Bucket {
  return range.days <= 35 ? 'day' : range.days <= 120 ? 'week' : 'month';
}

// The grains offered as a toggle: enough points to read as a picture, not so many it is noise.
export function bucketChoices(range: Range, weekStart: WeekStart): Bucket[] {
  return (['day', 'week', 'month'] as Bucket[]).filter((b) => {
    const n = buckets(range, b, weekStart).length;
    return n >= 3 && n <= 120;
  });
}

// ---------- sources ----------

export type Source =
  | { kind: 'field'; trackerId: string; field: string; agg: Exclude<GoalAgg, 'count' | 'days'> } // a number a tracker records, combined
  | { kind: 'entries'; trackerId: string }
  | { kind: 'daysLogged'; trackerId: string }
  | { kind: 'goodDays'; trackerId: string } // days that counted as good, by the tracker's own rule
  | { kind: 'trackersDone' } // across all trackers: how many had a good day
  | { kind: 'activeDays' }; // across all trackers: days when any tracker had a good day

export interface Point { start: number; end: number; value: number | undefined; future: boolean }

const asGoal = (t: Tracker, field: string | undefined, agg: GoalAgg): GoalDef => ({
  id: 'series', measure: field ?? agg, field, agg, how: 'total', cmp: 'min', value: 0, from: '1970-01-01',
});

// One number per slice of time. A slice with nothing to say (a reading never taken) is undefined, not zero, so a line can
// skip it instead of falling to the floor; counts are zero. Slices wholly in the future are marked.
export function series(source: Source, ix: DayIndex, range: Range, bucket: Bucket, today: number, weekStart: WeekStart): Point[] {
  const slices = buckets(range, bucket, weekStart);
  const tracker = 'trackerId' in source ? ix.trackers.find((t) => t.id === source.trackerId) : undefined;
  const out = (s: Slice, value: number | undefined): Point => ({ start: s.start, end: s.end, value, future: s.start > today });

  if ('trackerId' in source) {
    if (!tracker) return slices.map((s) => out(s, undefined));
    if (source.kind === 'goodDays') {
      return slices.map((s) => {
        if (s.start > today) return out(s, undefined);
        let n = 0;
        for (let d = s.start; d <= Math.min(s.end, today); d = addDays(d, 1)) if (ix.result(tracker, d).success) n++;
        return out(s, n);
      });
    }
    const last = Math.min(range.end, today);
    const vals = range.start <= last ? daysOf(tracker, ix.of(tracker.id), range.start, last, false) : [];
    const g = source.kind === 'field' ? asGoal(tracker, source.field, source.agg) : asGoal(tracker, undefined, source.kind === 'entries' ? 'count' : 'days');
    return slices.map((s) => {
      if (s.start > today) return out(s, undefined);
      const part = vals.filter((v: DayVal) => v.day >= s.start && v.day <= s.end);
      return out(s, aggregate(tracker, g, part));
    });
  }

  return slices.map((s) => {
    if (s.start > today) return out(s, undefined);
    let n = 0;
    for (let d = s.start; d <= Math.min(s.end, today); d = addDays(d, 1)) {
      const good = ix.trackers.filter((t) => ix.result(t, d).success).length;
      n += source.kind === 'trackersDone' ? good : good > 0 ? 1 : 0;
    }
    return out(s, n);
  });
}

// ---------- shapes ----------

export type Shape = 'number' | 'bar' | 'line' | 'grid' | 'progress' | 'ranked';

// The shapes that make sense for a source over a range, best first. A week and "all time" do not want the same picture:
// a week is a handful of days (a grid or bars), a long stretch is a trend (a line, bars by month).
export function shapesFor(source: Source | { kind: 'goal' } | { kind: 'ranking' }, range: Range): Shape[] {
  if (source.kind === 'goal') return ['progress', 'number'];
  if (source.kind === 'ranking') return ['ranked'];
  const long = range.days > 60;
  const reading = source.kind === 'field' && (source.agg === 'latest' || source.agg === 'avg' || source.agg === 'min' || source.agg === 'max');
  const dayLevel = source.kind === 'daysLogged' || source.kind === 'goodDays' || source.kind === 'activeDays';
  const out: Shape[] = [];
  if (reading) out.push(long ? 'line' : 'bar', long ? 'bar' : 'line');
  else if (dayLevel) out.push(range.days <= 400 ? 'grid' : 'bar', 'bar');
  else out.push('bar', 'line');
  out.push('number');
  return [...new Set(out)];
}

// ---------- goals and how they went ----------

export type Goal = { kind: 'tracker'; tracker: Tracker; def: GoalDef } | { kind: 'quest'; quest: Quest };

// One list: every tracker's own goals and the system's quests.
export function allGoals(trackers: Tracker[], quests: Quest[]): Goal[] {
  const own: Goal[] = trackers.flatMap((tracker) => (tracker.goals ?? []).map((def): Goal => ({ kind: 'tracker', tracker, def })));
  return [...own, ...quests.map((quest): Goal => ({ kind: 'quest', quest }))];
}

export interface PeriodResult { start: number; end: number; value: number | undefined; met: boolean }
export interface GoalHistory {
  periods: PeriodResult[]; // finished periods only, oldest first
  met: number;
  current: number; // finished periods in a row that were met, up to the latest
  best: number;
}

function summarise(periods: PeriodResult[]): GoalHistory {
  let best = 0; let run = 0;
  for (const p of periods) { run = p.met ? run + 1 : 0; best = Math.max(best, run); }
  return { periods, met: periods.filter((p) => p.met).length, current: run, best };
}

const stepOf = (how: 'day' | 'week' | 'month') => (how === 'day' ? 'day' : how) as Bucket;

// A goal's result for each finished period since it began, and how many in a row were met. The first partial period and
// anything before the person started logging are not judged. A goal with no repeating period (by a date, or overall) has no
// history of this kind.
export function goalHistory(goal: Goal, ix: DayIndex, today: number, weekStart: WeekStart): GoalHistory | undefined {
  if (goal.kind === 'tracker') {
    const { tracker: t, def: g } = goal;
    if (g.how !== 'day' && g.how !== 'week' && g.how !== 'month') return undefined;
    const first = ix.firstOf(t.id);
    if (first === undefined) return { periods: [], met: 0, current: 0, best: 0 };
    const begin = Math.max(dayFromKey(g.from), first);
    const periods: PeriodResult[] = [];
    const entries = ix.of(t.id);
    const slices = buckets({ start: begin, end: addDays(today, -1), days: 0, clamped: false, label: '' }, stepOf(g.how), weekStart);
    const vals = begin <= addDays(today, -1) ? daysOf(t, entries, begin, addDays(today, -1), !g.agg, g.item, g.where) : [];
    for (const s of slices) {
      if (g.how !== 'day') {
        const full = periodOf(g.how, s.start, weekStart);
        if (full.start < begin || full.end >= today) continue; // partial at the start, unfinished at the end
      }
      const part = vals.filter((v) => v.day >= s.start && v.day <= s.end);
      const value = aggregate(t, g, part);
      periods.push({ start: s.start, end: s.end, value, met: value !== undefined && isMet(g, value, undefined) });
    }
    return summarise(periods);
  }
  const q = goal.quest;
  if (q.how !== 'day' && q.how !== 'week' && q.how !== 'month') return undefined;
  const chosen = q.trackers === 'all' ? ix.trackers : ix.trackers.filter((t) => (q.trackers as string[]).includes(t.id));
  const begin = Math.max(dayFromKey(q.from), ix.first ?? today);
  const slices = buckets({ start: begin, end: addDays(today, -1), days: 0, clamped: false, label: '' }, stepOf(q.how), weekStart);
  const dayValue = (d: number): number => {
    if (chosen.length === 0) return 0;
    if (q.metric === 'entries') return chosen.reduce((n, t) => n + ix.on(t.id, d).filter((e) => e.done).length, 0);
    const rs = chosen.map((t) => ix.result(t, d));
    if (q.metric === 'trackersDone') return rs.filter((r) => r.success).length;
    const due = rs.filter((r) => r.expected);
    return due.length > 0 && due.every((r) => r.success) ? 1 : 0;
  };
  const periods: PeriodResult[] = [];
  for (const s of slices) {
    if (q.how !== 'day') {
      const full = periodOf(q.how, s.start, weekStart);
      if (full.start < begin || full.end >= today) continue;
    }
    let sum = 0;
    for (let d = s.start; d <= s.end; d = addDays(d, 1)) sum += dayValue(d);
    periods.push({ start: s.start, end: s.end, value: sum, met: sum >= q.value });
  }
  return summarise(periods);
}

export interface Preview { met: number; of: number; periods: PeriodResult[] }

// "How would this have gone?": a goal not yet saved, tried on the last n finished periods of the person's own history.
export function previewGoal(t: Tracker, def: GoalDef, ix: DayIndex, today: number, weekStart: WeekStart, n = 6): Preview | undefined {
  if (def.how !== 'day' && def.how !== 'week' && def.how !== 'month') return undefined;
  // n finished periods back: the start of the current period, stepped back n times
  let from = def.how === 'day' ? today : periodOf(def.how, today, weekStart).start;
  for (let i = 0; i < n; i++) from = def.how === 'day' ? addDays(from, -1) : periodOf(def.how, addDays(from, -1), weekStart).start;
  const h = goalHistory({ kind: 'tracker', tracker: t, def: { ...def, from: dayKey(from) } }, ix, today, weekStart);
  if (!h) return undefined;
  const periods = h.periods.slice(-n);
  return { met: periods.filter((p) => p.met).length, of: periods.length, periods };
}

// ---------- the streak across trackers ----------

// Days in a row (up to today) when at least half of what was in play got done (see systemShare). Counting any single tracker was tried first and
// made the streak meaningless (300 days for someone who skips most of their trackers). Today may still be on its way, so it does not break the run.
export const STREAK_SHARE = 0.5; // a day keeps the streak when at least this share of the system was done

export function activeStreak(ix: DayIndex, today: number): { current: number; best: number } {
  const first = ix.first;
  if (first === undefined) return { current: 0, best: 0 };
  let best = 0; let run = 0;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const v = systemShare(ix, d);
    if (v === undefined) continue; // a rest day (nothing due, nothing logged) neither breaks the streak nor extends it
    run = v >= STREAK_SHARE ? run + 1 : d === today ? run : 0;
    best = Math.max(best, run);
  }
  return { current: run, best };
}

// ---------- the starting Overview ----------

export interface Panel {
  id: string;
  title: string; // a headline that carries the meaning
  source: Source | { kind: 'goal' } | { kind: 'ranking' } | { kind: 'streak' };
  shape: Shape | 'streak';
  period: PeriodChoice;
  rows?: number; // for panels with one row per tracker: how many are shown (the most active first)
}

export const MAX_ROWS = 6; // a panel with more than this many rows shows its most active, and opens to all

// What a new Overview holds, from the data that exists. Never decided by what a tracker is for.
export function startingPanels(ix: DayIndex, today: number, goals: Goal[]): Panel[] {
  const panels: Panel[] = [];
  const trackers = ix.trackers;
  if (trackers.length === 0) return panels;
  const first = ix.first;
  const history = first === undefined ? 0 : daysIn(first, today);

  panels.push({ id: 'week', title: 'This week', source: { kind: 'activeDays' }, shape: 'grid', period: 'week', rows: Math.min(trackers.length, MAX_ROWS) });
  panels.push({ id: 'streak', title: 'Streak', source: { kind: 'streak' }, shape: 'streak', period: 'all' });

  // The tracker logged on the most days that has a number worth drawing, over 90 days (or all it has, if shorter).
  const logged = (t: Tracker): number => new Set(ix.of(t.id).filter((e) => e.done).map((e) => startOfDay(e.at))).size;
  const numeric = trackers
    .map((t) => ({ t, f: t.fields.find((x) => x.type === 'number' && x.reading) ?? t.fields.find((x) => x.type === 'number'), n: logged(t) }))
    .filter((x) => x.f && x.n >= 5)
    .sort((a, b) => b.n - a.n)[0];
  if (numeric?.f) {
    panels.push({
      id: 'line', title: `${numeric.t.name}: ${numeric.f.name}`,
      source: { kind: 'field', trackerId: numeric.t.id, field: numeric.f.id, agg: numeric.f.reading ? 'latest' : 'sum' }, shape: 'line', period: history >= 90 ? '90d' : 'all',
    });
  }

  if (goals.length > 0) panels.push({ id: 'goals', title: 'Goals', source: { kind: 'goal' }, shape: 'progress', period: 'week' });
  // A ranking needs some history to mean anything, unless there are so many trackers that it is the only way to read them.
  if ((trackers.length >= 3 && history >= 30) || trackers.length >= 8) {
    panels.push({ id: 'ranked', title: 'Where you log most', source: { kind: 'ranking' }, shape: 'ranked', period: history >= 90 ? '90d' : 'all', rows: Math.min(trackers.length, MAX_ROWS) });
  }
  return panels;
}

// Trackers ranked by days logged in a range, most first. Used by the ranked list and by "top six" panels.
export function rankTrackers(ix: DayIndex, range: Range, today: number): { tracker: Tracker; days: number }[] {
  const last = Math.min(range.end, today);
  return ix.trackers
    .map((tracker) => {
      const seen = new Set<number>();
      for (const e of ix.of(tracker.id)) { const d = startOfDay(e.at); if (e.done && d >= range.start && d <= last) seen.add(d); }
      return { tracker, days: seen.size };
    })
    .sort((a, b) => b.days - a.days || a.tracker.name.localeCompare(b.tracker.name));
}

// ---------- how much of your system you did ----------
// The rule (decided 2026-11-22): nothing is judged by how often you log, only by what a tracker was set up to ask and how well you
// kept to it. Each tracker is judged at its own cadence: day by day when it is due on particular days, week by week or month by month
// for "n times a week or month", and not at all for "whenever". A week of once-a-week tasks done is a full week, not one day in seven.

const meanOf = (a: number[]): number => a.reduce((s, x) => s + x, 0) / a.length;

// Whether anything was logged on a day, on any tracker.
function anyLogged(ix: DayIndex, day: number): boolean {
  return ix.trackers.some((t) => ix.on(t.id, day).some((e) => e.done));
}

// One tracker, one stretch (start to last, a bucket that ends at end): how well it kept to what it was set up to ask, 0 to 1, or
// undefined when it asked nothing in that stretch. Day-specific schedules are judged on their due days; "n times a week or month" on
// each calendar week or month that fits wholly inside the stretch and is finished; "whenever" and blocks are never judged.
export function attainment(ix: DayIndex, t: Tracker, start: number, last: number, end: number, today: number, weekStart: WeekStart): number | undefined {
  const first = ix.firstOf(t.id);
  if (first === undefined) return undefined;
  const sched = scheduleOf(t, last);
  if (sched.kind === 'times') {
    const how = sched.per;
    const got: number[] = [];
    let d = start;
    while (d <= last) {
      const p = periodOf(how, d, weekStart);
      if (p.start >= start && p.end <= end && p.end < today && p.start >= first) {
        const days = new Set<number>();
        for (let x = p.start; x <= p.end; x = addDays(x, 1)) if (ix.on(t.id, x).some((e) => e.done)) days.add(x);
        got.push(Math.min(1, days.size / Math.max(1, sched.n)));
      }
      d = addDays(p.end, 1);
    }
    return got.length ? meanOf(got) : undefined;
  }
  if (sched.kind === 'whenever' || sched.kind === 'blocks') return undefined;
  let due = 0; let good = 0;
  for (let d = Math.max(start, first); d <= last; d = addDays(d, 1)) {
    const r = ix.result(t, d);
    if (r.expected) { due++; if (r.success) good++; }
  }
  return due === 0 ? undefined : good / due;
}

// One day, across the system: the average of each tracker due that day. A day where nothing was due is a rest day (undefined), and
// if something was logged on it anyway that counts as a full day of showing up. Never a low day for logging less.
export function systemShare(ix: DayIndex, day: number): number | undefined {
  const per: number[] = [];
  for (const t of ix.trackers) {
    const first = ix.firstOf(t.id);
    if (first === undefined || day < first) continue;
    const r = ix.result(t, day);
    if (r.expected) per.push(r.success ? 1 : 0);
  }
  if (per.length > 0) return meanOf(per);
  return anyLogged(ix, day) ? 1 : undefined;
}

// A week, a month or any stretch: the average of each tracker's attainment over it, so a once-a-week tracker counts as much as a
// daily one. If nothing was owed in the stretch, logging anything is a full showing-up and logging nothing is nothing to judge.
export function periodShare(ix: DayIndex, start: number, end: number, today: number, weekStart: WeekStart): number | undefined {
  const last = Math.min(end, today);
  if (start > last) return undefined;
  const per: number[] = [];
  for (const t of ix.trackers) { const a = attainment(ix, t, start, last, end, today, weekStart); if (a !== undefined) per.push(a); }
  if (per.length > 0) return meanOf(per);
  for (let d = start; d <= last; d = addDays(d, 1)) if (anyLogged(ix, d)) return 1;
  return undefined;
}

// The share per slice of time. Days use the day rule; weeks and months judge each tracker at its own cadence. Future slices are marked.
export function shareSeries(ix: DayIndex, range: Range, bucket: Bucket, today: number, weekStart: WeekStart): Point[] {
  return buckets(range, bucket, weekStart).map((s) => {
    if (s.start > today) return { start: s.start, end: s.end, value: undefined, future: true };
    const value = bucket === 'day' ? systemShare(ix, s.start) : periodShare(ix, s.start, s.end, today, weekStart);
    return { start: s.start, end: s.end, value, future: false };
  });
}
