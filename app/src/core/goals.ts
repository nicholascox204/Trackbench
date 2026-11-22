// Goals are quests with visible progress, and they count what the person actually tracks.
// A goal picks a thing you record (a field like Weight or Minutes, the number of entries, or the days you
// logged anything), how to combine it (total, highest, lowest, average, latest), and over what (a calendar
// week, a calendar month, or everything since the goal began), then what to aim for.
//   "Bench 225"            Weight · highest · all time · at least 225
//   "Lose to 180 by Mar 1" Weight · latest · all time · reach 180
//   "100 km this month"    Distance · total · this month · at least 100
//   "4 workouts a week"    Days logged · this week · at least 4
// Older goals saved before this used a measure and a "how"; they still read and show correctly.
// Progress is always computed from entries, so it never goes stale.

import { hasPick } from './choices';
import { computeDay } from './measures';
import { planFor } from './plan';
import { plural as pluralWord, termsOf } from './terms';
import { addDays, startOfDay } from './time';
import { formatFieldValue, formatNumber, fromDisplay, measureFromDisplay, measureToDisplay, measureUnit, round2, toDisplay } from './units';
import type { Entry, Field, GoalAgg, GoalDef, Settings, Target, Tracker } from './types';

export const DAYS_MEASURE = 'days'; // "days I log it"
export type WeekStart = 'mon' | 'sun';

const DAY = 86400000;
const keyOf = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const dayFromKey = (k: string): number => {
  const [y, m, d] = k.split('-').map(Number);
  return startOfDay(new Date(y, m - 1, d).getTime());
};
export const dayKey = keyOf;

export interface Period { start: number; end: number } // day starts, inclusive

export function periodOf(how: 'week' | 'month', day: number, weekStart: WeekStart): Period {
  const d = new Date(day);
  if (how === 'week') {
    const back = weekStart === 'mon' ? (d.getDay() + 6) % 7 : d.getDay();
    const start = addDays(day, -back);
    return { start, end: addDays(start, 6) };
  }
  return {
    start: startOfDay(new Date(d.getFullYear(), d.getMonth(), 1).getTime()),
    end: startOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime()),
  };
}

interface DayVal { day: number; m: Record<string, number>; active: boolean; entries: Entry[] }

// The names of the items in a planned tracker's plan (like exercises), in the order first seen.
export function itemNames(t: Tracker): string[] {
  const seen = new Map<string, string>();
  for (const v of t.plan) for (const d of v.days) for (const sl of d.slots) if (!seen.has(sl.name.toLowerCase())) seen.set(sl.name.toLowerCase(), sl.name);
  return [...seen.values()];
}

// Plan slots come and go as the plan is edited, so an item is matched by its name, not its slot id.
export function slotNames(t: Tracker): Map<string, string> {
  const m = new Map<string, string>();
  for (const v of t.plan) for (const d of v.days) for (const sl of d.slots) m.set(sl.id, sl.name.toLowerCase());
  return m;
}

function daysOf(t: Tracker, entries: Entry[], from: number, to: number, withMeasures: boolean, item?: string, where?: GoalDef['where']): DayVal[] {
  const byDay = new Map<number, Entry[]>();
  const names = item ? slotNames(t) : undefined;
  const want = item?.toLowerCase();
  for (const e of entries) {
    if (e.trackerId !== t.id) continue;
    if (names && names.get(e.slotId ?? '') !== want) continue;
    if (where && !hasPick(e.values[where.field], where.equals, t.fields.find((f) => f.id === where.field)?.multi)) continue; // names match whatever the capitals; with several picks, any of them
    const d = startOfDay(e.at);
    if (d < from || d > to) continue;
    const list = byDay.get(d);
    if (list) list.push(e);
    else byDay.set(d, [e]);
  }
  const out: DayVal[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const es = byDay.get(d) ?? [];
    const done = es.filter((e) => e.done).sort((a, b) => a.at - b.at);
    out.push({ day: d, m: withMeasures ? computeDay(t, es, planFor(t, d)) : {}, active: done.length > 0, entries: done });
  }
  return out;
}

const fieldOf = (t: Tracker, g: GoalDef): Field | undefined => (g.field ? t.fields.find((f) => f.id === g.field) : undefined);

// The values of one field across the days, oldest first.
function fieldValues(g: GoalDef, vals: DayVal[]): number[] {
  const id = g.field as string;
  return vals
    .flatMap((v) => v.entries)
    .map((e) => e.values[id])
    .filter((x) => x !== undefined && x !== '')
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

// One number for a goal over some days.
function aggregate(t: Tracker, g: GoalDef, vals: DayVal[]): number | undefined {
  const active = vals.filter((v) => v.active);
  if (g.agg) {
    if (g.agg === 'days') return active.length;
    if (g.agg === 'count') return active.reduce((n, v) => n + v.entries.length, 0);
    const nums = fieldValues(g, vals);
    if (nums.length === 0) return g.agg === 'sum' ? 0 : undefined;
    if (g.agg === 'sum') return nums.reduce((a, b) => a + b, 0);
    if (g.agg === 'max') return Math.max(...nums);
    if (g.agg === 'min') return Math.min(...nums);
    if (g.agg === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
    return nums[nums.length - 1]; // latest
  }
  // older goals: a measure and a "how"
  if (g.measure === DAYS_MEASURE) return active.length;
  const op = g.measure === 'count' ? 'count' : t.measures.find((m) => m.id === g.measure)?.calc.op ?? 'sum';
  const x = (v: DayVal) => v.m[g.measure] ?? 0;
  if (g.how === 'best' || op === 'max') return active.length ? Math.max(...active.map(x)) : 0;
  if (g.how === 'latest' || op === 'latest') return active.length ? x(active[active.length - 1]) : undefined;
  return vals.reduce((sum, v) => sum + x(v), 0);
}

function firstValue(g: GoalDef, vals: DayVal[]): number | undefined {
  if (g.agg) return g.field ? fieldValues(g, vals)[0] : undefined;
  return vals.find((v) => v.active)?.m[g.measure];
}

function isMet(g: GoalDef, value: number, start: number | undefined): boolean {
  if (g.cmp === 'min') return value >= g.value;
  if (g.cmp === 'max') return value <= g.value;
  if (g.cmp === 'range') return value >= g.value && value <= (g.value2 ?? g.value);
  const s = g.start ?? start ?? value;
  return s > g.value ? value <= g.value : value >= g.value; // reach: the direction comes from where you started
}

export interface GoalProgress {
  value: number; // base units
  target: number;
  fraction: number; // 0 to 1, for the bar
  status: 'active' | 'met' | 'over' | 'missed';
  headline: string; // "2 of 4 days"
  detail: string; // "2 to go · 3 days left"
  daysLeft?: number;
  onTrack?: boolean;
  period?: Period;
}

// A goal number ready to read, whatever it counts.
function valueText(t: Tracker, g: GoalDef, base: number, settings: Settings): string {
  const f = fieldOf(t, g);
  if (f && g.agg !== 'days' && g.agg !== 'count') return formatFieldValue(f, base, settings);
  if (g.agg || g.measure === DAYS_MEASURE || g.measure === 'count') return formatNumber(base);
  const m = t.measures.find((x) => x.id === g.measure);
  if (!m) return formatNumber(base);
  const u = measureUnit(t, m, settings);
  return `${formatNumber(round2(measureToDisplay(t, m, base, settings)))}${u ? ' ' + u : ''}`;
}

const plural = (n: number, w: string): string => `${formatNumber(n)} ${w}${n === 1 ? '' : 's'}`;
const isPeriodic = (g: GoalDef): boolean => g.how === 'day' || g.how === 'week' || g.how === 'month';

export function goalProgress(t: Tracker, g: GoalDef, entries: Entry[], today: number, settings: Settings, weekStart: WeekStart): GoalProgress {
  const periodic = isPeriodic(g);
  const period = g.how === 'day' ? { start: today, end: today } : periodic ? periodOf(g.how as 'week' | 'month', today, weekStart) : undefined;
  const from = periodic ? (period as Period).start : dayFromKey(g.from);
  const to = Math.min(today, periodic ? (period as Period).end : today);
  const vals = from <= to ? daysOf(t, entries, from, to, !g.agg, g.item, g.where) : [];
  const agg = aggregate(t, g, vals);
  const first = firstValue(g, vals);
  const value = agg ?? 0;
  const target = g.value;
  const met = agg !== undefined && isMet(g, value, first);
  const end = g.until ? dayFromKey(g.until) : period?.end;
  const daysLeft = end !== undefined && g.how !== 'day' ? Math.max(0, Math.round((end - today) / DAY)) : undefined;
  const pastDue = !periodic && g.until !== undefined && today > dayFromKey(g.until) && !met;

  let fraction: number;
  if (g.cmp === 'reach') {
    const s = g.start ?? first ?? value;
    const span = target - s;
    fraction = span === 0 ? (met ? 1 : 0) : Math.max(0, Math.min(1, (value - s) / span));
    if (met) fraction = 1;
  } else {
    fraction = target > 0 ? Math.max(0, Math.min(1, value / target)) : met ? 1 : 0;
  }
  const over = g.cmp === 'max' && value > target;
  const status: GoalProgress['status'] = over ? 'over' : met && g.cmp !== 'max' ? 'met' : pastDue ? 'missed' : 'active';

  const unitWord = g.agg === 'days' || g.measure === DAYS_MEASURE ? ' days' : '';
  const headline = g.cmp === 'max'
    ? `${valueText(t, g, value, settings)} of ${valueText(t, g, target, settings)} max`
    : g.cmp === 'reach'
      ? `${valueText(t, g, value, settings)} → ${valueText(t, g, target, settings)}`
      : `${valueText(t, g, value, settings)} of ${valueText(t, g, target, settings)}${unitWord}`;

  const parts: string[] = [];
  const left = (n: number) => valueText(t, g, n, settings);
  if (status === 'met') parts.push(g.cmp === 'reach' ? 'Reached' : 'Goal met');
  else if (status === 'over') parts.push(`${left(value - target)} over`);
  else if (status === 'missed') parts.push('Time ran out');
  else if (g.cmp === 'max') parts.push(`${left(target - value)} left`);
  else if (g.cmp === 'reach') parts.push(`${left(Math.abs(target - value))} to go`);
  else parts.push(`${left(Math.max(0, target - value))} to go`);
  if (daysLeft !== undefined && status !== 'met' && status !== 'missed') parts.push(daysLeft === 0 ? 'last day' : plural(daysLeft, 'day') + ' left');

  let onTrack: boolean | undefined;
  if (!periodic && g.until && status === 'active') {
    const total = Math.max(1, dayFromKey(g.until) - dayFromKey(g.from));
    const elapsed = Math.min(1, Math.max(0, (today - dayFromKey(g.from)) / total));
    onTrack = fraction + 0.05 >= elapsed;
    parts.push(onTrack ? 'on pace' : 'behind pace');
  }
  return { value, target, fraction, status, headline, detail: parts.join(' · '), daysLeft, onTrack, period };
}

export const AGG_WORD: Record<GoalAgg, string> = { sum: 'Total', max: 'Highest', min: 'Lowest', avg: 'Average', latest: 'Latest', count: 'Entries', days: 'Days logged' };

// A sentence for the goal, for lists and the builder.
export function describeGoal(t: Tracker, g: GoalDef, settings: Settings): string {
  const text = describeCore(t, g, settings);
  const lo = `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  const wf = g.where ? t.fields.find((f) => f.id === g.where?.field) : undefined;
  const when = g.where ? ` when ${(wf?.name ?? g.where.field).toLowerCase()} is ${g.where.equals}` : '';
  const body = g.item ? `${g.item}: ${lo}` : text;
  return `${body}${when}`;
}

function describeCore(t: Tracker, g: GoalDef, settings: Settings): string {
  const by = g.until ? ` by ${new Date(dayFromKey(g.until)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';
  const over = g.how === 'day' ? ' a day' : g.how === 'week' ? ' a week' : g.how === 'month' ? ' a month' : g.how === 'total' ? (g.until ? '' : ' in total') : '';
  const lo = (a: string) => a.charAt(0).toLowerCase() + a.slice(1);
  if (g.measure === DAYS_MEASURE || g.agg === 'days') return `${g.cmp === 'max' ? 'At most' : 'At least'} ${plural(g.value, 'day')}${over}${by}`;
  if (g.agg === 'count' || (!g.agg && (g.measure === 'count' || g.measure === 'sets'))) {
    const word = t.input === 'plan' ? ` ${pluralWord(termsOf(t).row.toLowerCase(), g.value)}` : t.input === 'tap' ? '' : ' entries';
    return `${g.cmp === 'max' ? 'At most' : 'At least'} ${formatNumber(g.value)}${word}${over}${by}`;
  }
  const f = fieldOf(t, g);
  const m = g.agg ? undefined : t.measures.find((x) => x.id === g.measure);
  const name = (f?.name ?? m?.name ?? g.measure).toLowerCase();
  const val = valueText(t, g, g.value, settings);
  const hasUnit = f ? !!(f.unit || f.unitKind) : !!(m && measureUnit(t, m, settings));
  if (g.cmp === 'reach') return `Reach ${val}${hasUnit ? '' : ' ' + name}${by}`;
  const aim = g.cmp === 'range' ? `${val} to ${valueText(t, g, g.value2 ?? g.value, settings)}` : `${g.cmp === 'max' ? 'at most' : 'at least'} ${val}`;
  if (g.agg === 'sum' || !g.agg) return `${g.cmp === 'range' ? name + ' ' : g.cmp === 'max' ? 'At most ' : 'At least '}${g.cmp === 'range' ? aim : val}${hasUnit ? '' : ' ' + name}${over}${g.how === 'best' ? ' in one day' : ''}${by}`;
  return `${AGG_WORD[g.agg]} ${name} ${aim}${over}${by}`;
}

// Moments the system can reward: a finished week or month, or a one-time goal reached.
export interface GoalEvent { day: number; trackerId: string; goalId: string; title: string; success: boolean; weight: number }
export const WEIGHT = { week: 3, month: 8, once: 10 };

// The blanket good-week rule: a finished week is judged per tracker on the days it was due. Weeks that were never due are skipped.
export function weekEvents(trackers: Tracker[], days: { day: number; closed: boolean; results: Record<string, { expected: boolean; success: boolean }> }[], minPct: number, weekStart: WeekStart): GoalEvent[] {
  const out: GoalEvent[] = [];
  const byWeek = new Map<number, typeof days>();
  for (const d of days) {
    const p = periodOf('week', d.day, weekStart);
    const list = byWeek.get(p.start);
    if (list) list.push(d); else byWeek.set(p.start, [d]);
  }
  for (const [start, list] of byWeek) {
    const end = addDays(start, 6);
    if (!list.some((d) => d.day === end && d.closed)) continue; // only a finished week
    if (list.length < 7) continue; // the first partial week is not judged
    for (const t of trackers) {
      let due = 0; let hit = 0;
      for (const d of list) { const r = d.results[t.id]; if (r?.expected) { due++; if (r.success) hit++; } }
      if (due === 0) continue;
      out.push({ day: end, trackerId: t.id, goalId: 'week', title: `${t.name}: a good week`, success: hit / due >= minPct / 100, weight: WEIGHT.week });
    }
  }
  return out.sort((a, b) => a.day - b.day);
}

export function goalEvents(trackers: Tracker[], entries: Entry[], today: number, settings: Settings, weekStart: WeekStart): GoalEvent[] {
  const out: GoalEvent[] = [];
  for (const t of trackers) {
    for (const g of t.goals ?? []) {
      if (g.how === 'day') continue; // daily goals are judged by the tracker's daily rule, not here
      const title = `${t.name}: ${describeGoal(t, g, settings)}`;
      const from = dayFromKey(g.from);
      if (g.how === 'week' || g.how === 'month') {
        let p = periodOf(g.how, from, weekStart);
        if (p.start < from) p = periodOf(g.how, addDays(p.end, 1), weekStart); // the first partial period is not judged
        for (let i = 0; i < 120 && p.end < today; i++) {
          const agg = aggregate(t, g, daysOf(t, entries, p.start, p.end, !g.agg, g.item, g.where));
          out.push({ day: p.end, trackerId: t.id, goalId: g.id, title, success: agg !== undefined && isMet(g, agg, undefined), weight: WEIGHT[g.how] });
          p = periodOf(g.how, addDays(p.end, 1), weekStart);
        }
      } else {
        const last = g.until ? Math.min(today, dayFromKey(g.until)) : today;
        const vals = from <= last ? daysOf(t, entries, from, last, !g.agg, g.item, g.where) : [];
        let metOn: number | undefined;
        // At most / within: staying under a limit is only a result once the time is up, so judge it at the end.
        const endJudged = g.cmp === 'max' || g.cmp === 'range';
        if (endJudged) {
          if (g.until && dayFromKey(g.until) < today) {
            const agg = aggregate(t, g, vals);
            out.push({ day: dayFromKey(g.until), trackerId: t.id, goalId: g.id, title, success: agg !== undefined ? isMet(g, agg, undefined) : g.cmp === 'max', weight: WEIGHT.once });
          }
          continue;
        }
        for (let i = 0; i < vals.length && metOn === undefined; i++) {
          const upTo = vals.slice(0, i + 1);
          const agg = aggregate(t, g, upTo);
          if (agg !== undefined && vals[i].active && isMet(g, agg, firstValue(g, vals))) metOn = vals[i].day;
        }
        if (metOn !== undefined) out.push({ day: metOn, trackerId: t.id, goalId: g.id, title, success: true, weight: WEIGHT.once });
        else if (g.until && dayFromKey(g.until) < today) out.push({ day: dayFromKey(g.until), trackerId: t.id, goalId: g.id, title, success: false, weight: WEIGHT.once });
      }
    }
  }
  return out.sort((a, b) => a.day - b.day);
}

// Goal numbers are typed in display units; they are stored in base units.
export function goalToBase(t: Tracker, ref: { field?: string; measure?: string }, shown: number, settings: Settings): number {
  const f = ref.field ? t.fields.find((x) => x.id === ref.field) : undefined;
  if (f) return fromDisplay(f, shown, settings);
  const m = ref.measure ? t.measures.find((x) => x.id === ref.measure) : undefined;
  return m ? measureFromDisplay(t, m, shown, settings) : shown;
}
export function goalToDisplay(t: Tracker, ref: { field?: string; measure?: string }, base: number, settings: Settings): number {
  const f = ref.field ? t.fields.find((x) => x.id === ref.field) : undefined;
  if (f) return round2(toDisplay(f, base, settings));
  const m = ref.measure ? t.measures.find((x) => x.id === ref.measure) : undefined;
  return m ? round2(measureToDisplay(t, m, base, settings)) : base;
}

// ---------- daily goals ----------
// A daily goal is one of the tracker's daily targets, shown and edited like any other goal (how: 'day'). It stays
// a target because that is what the daily rule, streaks and points already read; these functions are the bridge.

export function dailyGoals(t: Tracker): GoalDef[] {
  if (t.success.mode !== 'target' && t.success.mode !== 'targets') return [];
  return t.targets.map((tg) => ({
    id: tg.id, measure: tg.measure, how: 'day' as const,
    cmp: tg.min !== undefined && tg.max !== undefined ? ('range' as const) : tg.max !== undefined ? ('max' as const) : ('min' as const),
    value: (tg.min ?? tg.max) as number, ...(tg.min !== undefined && tg.max !== undefined ? { value2: tg.max } : {}), from: '1970-01-01',
  }));
}

// The tracker's daily rule after adding or changing one daily goal.
export function withDailyGoal(t: Tracker, g: GoalDef): Pick<Tracker, 'targets' | 'success'> {
  const target: Target = {
    id: g.id, measure: g.measure,
    ...(g.cmp === 'max' ? { max: g.value } : g.cmp === 'range' ? { min: g.value, max: g.value2 ?? g.value } : { min: g.value }),
  };
  const targets = t.targets.some((x) => x.id === g.id) ? t.targets.map((x) => (x.id === g.id ? target : x)) : [...t.targets, target];
  const ids = goalIds(t);
  return rule(t, targets, ids.includes(g.id) ? ids : [...ids, g.id]);
}

export function withoutDailyGoal(t: Tracker, id: string): Pick<Tracker, 'targets' | 'success'> {
  return rule(t, t.targets.filter((x) => x.id !== id), goalIds(t).filter((x) => x !== id));
}

const goalIds = (t: Tracker): string[] => (t.success.mode === 'target' ? [t.success.targetId] : t.success.mode === 'targets' ? t.success.targetIds : []);
const planPct = (t: Tracker): number | undefined => (t.success.mode === 'plan' ? t.success.minPct : t.success.mode === 'targets' ? t.success.planMinPct : undefined);

function rule(t: Tracker, targets: Target[], ids: string[]): Pick<Tracker, 'targets' | 'success'> {
  const pct = planPct(t);
  if (ids.length === 0) return { targets, success: pct !== undefined ? { mode: 'plan', minPct: pct } : { mode: 'logged' } };
  if (ids.length === 1 && pct === undefined) return { targets, success: { mode: 'target', targetId: ids[0] } };
  return { targets, success: { mode: 'targets', targetIds: ids, ...(pct !== undefined ? { planMinPct: pct } : {}) } };
}
