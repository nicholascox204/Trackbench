// Goal presets: a few sensible goals for the tracker in front of you, so setting a goal starts from something
// close to what you want and teaches what a good one looks like. Like tracker templates they are only
// configuration: each is built from the tracker's own fields, shape and history (never from what it was
// started from), pre-fills the goal builder, and every part can be changed before saving.

import { dayKey, DAYS_MEASURE, itemNames, slotNames } from './goals';
import { planFor } from './plan';
import { addDays, startOfDay } from './time';
import { defaultStep, formatFieldValue, fromDisplay } from './units';
import type { Entry, Field, GoalDef, Settings, Tracker } from './types';

export interface GoalSuggestion {
  key: string;
  why: string; // one line on why this is a good goal
  goal: GoalDef; // the title is describeGoal(goal), the same sentence shown everywhere else
}

const readingField = (f: Field) => f.type === 'number' && f.reading === true;
const sumField = (f: Field) => f.type === 'number' && f.reading !== true;

function values(t: Tracker, f: Field, entries: Entry[]): number[] {
  return entries
    .filter((e) => e.trackerId === t.id && e.done)
    .sort((a, b) => a.at - b.at)
    .map((e) => e.values[f.id])
    .filter((v) => v !== undefined && v !== '')
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

// How many rows or items a normal week of the plan asks for.
function plannedPerWeek(t: Tracker, today: number): number {
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const pd = planFor(t, addDays(today, i));
    if (!pd) continue;
    for (const s of pd.slots) total += (s.sets ?? 0) > 0 ? (s.sets as number) : 1;
  }
  return total;
}

export function suggestGoals(t: Tracker, entries: Entry[], settings: Settings, now: number = Date.now()): GoalSuggestion[] {
  const today = startOfDay(now);
  const from = dayKey(today);
  const base = { id: 'preset', from } as const;
  const out: GoalSuggestion[] = [];
  const add = (key: string, why: string, goal: Omit<GoalDef, 'id' | 'from'>) => out.push({ key, why, goal: { ...base, ...goal } });

  // Avoiding something: short windows feel winnable.
  if (t.avoid) {
    add('slips-week', 'Short windows feel winnable. Stack weeks into a month.', { measure: 'count', agg: 'count', how: 'week', cmp: 'max', value: 0 });
    add('slips-month', 'A clean month is a real result you can point to.', { measure: 'count', agg: 'count', how: 'month', cmp: 'max', value: 0 });
    add('slips-30', 'Thirty days is long enough to feel different and short enough to finish.', {
      measure: 'count', agg: 'count', how: 'total', cmp: 'max', value: 0, until: dayKey(addDays(today, 30)),
    });
    return out;
  }

  // Showing up.
  const days = t.input === 'check' || t.input === 'tap' ? 5 : 3;
  add('show-up', days === 5 ? 'Most days beats every day: it survives a bad week.' : 'A steady rhythm beats occasional big efforts. Three days a week is enough to build a habit.',
    { measure: DAYS_MEASURE, agg: 'days', how: 'week', cmp: 'min', value: days });

  // Following a plan.
  if (t.input === 'plan') {
    const n = plannedPerWeek(t, today);
    if (n > 0) add('finish-plan', 'Doing the plan you wrote each week is the whole point of having one.', { measure: 'count', agg: 'count', how: 'week', cmp: 'min', value: n });
  }

  // A counter: scale its daily target up to a week.
  if (t.input === 'tap') {
    const daily = t.targets.find((x) => x.measure === 'count' && x.min !== undefined)?.min ?? 8;
    add('count-week', 'A weekly total forgives one slow day.', { measure: 'count', agg: 'count', how: 'week', cmp: 'min', value: daily * 7 });
  }

  const fields = t.fields.filter((f) => f.type === 'number' || f.type === 'rating');

  // Things that add up (minutes, distance, amounts): a weekly total from a typical entry.
  if (t.input === 'form') {
    for (const f of fields.filter(sumField).slice(0, 2)) {
      const typical = typeof f.default === 'number' && f.default > 0 ? f.default : 1;
      add(`sum-${f.id}`, 'A weekly total is easy to adjust: raise it when it feels easy.', { measure: f.id, field: f.id, agg: 'sum', how: 'week', cmp: 'min', value: typical * 5 });
    }
  }

  // Readings (a weight, a measurement): move it a little over two months.
  for (const f of fields.filter(readingField).slice(0, 1)) {
    const seen = values(t, f, entries);
    const last = seen.length ? seen[seen.length - 1] : typeof f.default === 'number' ? f.default : 0;
    const delta = fromDisplay(f, defaultStep(f, settings), settings);
    const until = dayKey(addDays(today, 56));
    const basis = seen.length ? `Starts from your last entry, ${formatFieldValue(f, last, settings)}. ` : '';
    add(`down-${f.id}`, `${basis}A small, steady change over two months is realistic and easier to keep than a crash.`, {
      measure: f.id, field: f.id, agg: 'latest', how: 'total', cmp: 'reach', value: last - delta, start: last, until,
    });
    add(`up-${f.id}`, `${basis}A small, steady change over two months is realistic and easier to keep than a crash.`, {
      measure: f.id, field: f.id, agg: 'latest', how: 'total', cmp: 'reach', value: last + delta, start: last, until,
    });
  }

  // Times (a bedtime, a wake time): a steady window beats a single exact time.
  for (const f of t.fields.filter((x) => x.type === 'time').slice(0, 1)) {
    const seen = values(t, f, entries);
    const mid = seen.length ? Math.round(seen.reduce((x, y) => x + y, 0) / seen.length) : typeof f.default === 'number' ? f.default : 480;
    add(`window-${f.id}`, `${seen.length ? 'Centred on your usual time. ' : ''}A steady time matters more than an exact one. Move the window to suit you.`, {
      measure: f.id, field: f.id, agg: 'avg', how: 'week', cmp: 'range', value: mid - 30, value2: mid + 30,
    });
  }

  // Choices (a type of day, a kind of session): count the days you pick one option.
  for (const f of t.fields.filter((x) => x.type === 'choice' && (x.options ?? []).length > 0).slice(0, 1)) {
    add(`choice-${f.id}`, 'Counts the days you log this option. Change it to the one you want more of.', {
      measure: DAYS_MEASURE, agg: 'days', how: 'week', cmp: 'min', value: 3, where: { field: f.id, equals: (f.options as string[])[0] },
    });
  }

  // Ratings: watch the week, not the dip.
  for (const f of fields.filter((x) => x.type === 'rating').slice(0, 1)) {
    add(`avg-${f.id}`, 'Trends matter more than single days. Watch the week, not the dip.', {
      measure: f.id, field: f.id, agg: 'avg', how: 'week', cmp: 'min', value: Math.ceil((f.max ?? 5) * 0.7),
    });
  }

  // Beat your best, for a planned tracker with a number to push: one suggestion for each item you actually
  // do most (a lift, a route), from that item's own history; without history, one for the tracker as a whole.
  if (t.input === 'plan') {
    const f = fields.find((x) => x.type === 'number');
    if (f) {
      const step = fromDisplay(f, defaultStep(f, settings), settings);
      const until = dayKey(addDays(today, 84));
      const names = slotNames(t);
      const byItem = new Map<string, { nums: number[]; recent: number; last: number }>();
      const since = addDays(today, -56);
      for (const e of entries) {
        if (e.trackerId !== t.id || !e.done || !e.slotId) continue;
        const n = Number(e.values[f.id]);
        const name = names.get(e.slotId);
        if (!name || Number.isNaN(n) || e.values[f.id] === undefined || e.values[f.id] === '') continue;
        const cur = byItem.get(name) ?? { nums: [], recent: 0, last: 0 };
        byItem.set(name, { nums: [...cur.nums, n], recent: cur.recent + (e.at >= since ? 1 : 0), last: Math.max(cur.last, e.at) });
      }
      const shown = new Map(itemNames(t).map((n) => [n.toLowerCase(), n]));
      // The items you actually train now: most logged in the last eight weeks, then most recent. An item whose
      // number never rises above zero (a bodyweight hold, say) has nothing to beat, so it is left out.
      const top = [...byItem.entries()]
        .filter(([, v]) => Math.max(...v.nums) > 0)
        .sort((a, b) => b[1].recent - a[1].recent || b[1].last - a[1].last)
        .slice(0, 2);
      for (const [lower, { nums }] of top) {
        const best = Math.max(...nums);
        add(`best-${lower}`, `Your best so far is ${formatFieldValue(f, best, settings)}, from ${nums.length} logged. Aim a step past it.`, {
          measure: f.id, field: f.id, item: shown.get(lower) ?? lower, agg: 'max', how: 'total', cmp: 'min', value: best + step, until,
        });
      }
      if (top.length === 0) {
        const seen = values(t, f, entries);
        const best = seen.length ? Math.max(...seen) : typeof f.default === 'number' ? f.default : 0;
        add(`best-${f.id}`, 'A specific number to beat keeps your effort pointed somewhere. You can aim it at one item.', {
          measure: f.id, field: f.id, agg: 'max', how: 'total', cmp: 'min', value: best + step, until,
        });
      }
    }
  }

  return out.slice(0, 6);
}
