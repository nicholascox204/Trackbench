// Schedules: when a tracker is expected. Every tracker has one (every day unless it says otherwise). The rest of the
// app asks one question, "is this due on this day", and this file is the only place that knows how each kind answers.
//
// Kinds: every day; certain weekdays; every N days counted from a date; a number of times a week or month on any days;
// once a month (a date, or the last day); or whenever (no schedule). "Times" and "whenever" have no particular due day,
// so no single day is expected for them; a weekly or monthly goal carries "times".

import { WEEK_ORDER, versionFor } from './plan';
import { startOfDay } from './time';
import type { Schedule, ScheduleWindow, Tracker } from './types';

const DAY_MS = 86400000;
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DAILY: Schedule = { kind: 'daily' };

// "2026-11-18" to local midnight, and back.
export function keyToDay(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}

export function daysBetween(from: number, to: number): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
}

export function lastDayOfMonth(day: number): number {
  const d = new Date(day);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// The weekdays (0 = Sunday) that have something on them in the plan that applied on a day.
export function listDays(t: Tracker, day: number = Date.now()): number[] {
  const v = t.plan.length > 0 ? versionFor(t.plan, day) : null;
  return v ? v.days.map((d, i) => (d.slots.length > 0 ? i : -1)).filter((i) => i >= 0) : [];
}

// A tracker's schedule (every day if none is stored). The days are the schedule and the lists hang off them: a plan with its own list on each
// weekday still runs on the days chosen, and a list on a day that is not chosen is just there if you open that day (nothing is due on it).
export function scheduleOf(t: Tracker, day: number = Date.now()): Schedule {
  if (t.schedule) return t.schedule;
  // A tracker saved before schedules existed: a plan with its own list on each weekday trained the weekdays that had a list.
  const v = t.input === 'plan' && t.plan.length > 0 ? versionFor(t.plan, day) : null;
  if (v && !v.same) {
    const days = listDays(t, day);
    return days.length >= 7 ? DAILY : { kind: 'weekdays', days };
  }
  return DAILY;
}

// The weekdays (0 = Sunday) a schedule lands on, for the parts that need to know: the days of a plan. Kinds that are not
// tied to a weekday count as every day.
export function weekdaysOf(s: Schedule): number[] {
  if (s.kind === 'blocks') return Array.from({ length: s.n }, (_, i) => i); // a block's lists, not weekdays
  return s.kind === 'weekdays' ? [...s.days] : [0, 1, 2, 3, 4, 5, 6];
}

// Choosing seven weekdays means every day, so store it as that; and keep the list tidy.
export const MAX_BLOCK = 7; // a plan holds seven lists

export function normalizeSchedule(s: Schedule): Schedule {
  if (s.kind === 'blocks') return { kind: 'blocks', n: Math.min(MAX_BLOCK, Math.max(2, Math.round(s.n))) };
  if (s.kind !== 'weekdays') return s;
  const days = [...new Set(s.days)].sort((a, b) => a - b);
  return days.length >= 7 ? DAILY : { kind: 'weekdays', days };
}

// What each kind starts as when chosen from the list.
export function startingSchedule(kind: Schedule['kind'], previous: Schedule, todayKey: string): Schedule {
  switch (kind) {
    case 'daily': return DAILY;
    case 'weekdays': return previous.kind === 'weekdays' || previous.kind === 'daily' ? previous : { kind: 'weekdays', days: [1, 3, 5] };
    case 'interval': return { kind: 'interval', n: 2, from: todayKey };
    case 'times': return { kind: 'times', n: 3, per: 'week' };
    case 'monthly': return { kind: 'monthly', day: 1 };
    case 'blocks': return { kind: 'blocks', n: 3 };
    default: return { kind: 'whenever' };
  }
}

// "Times" and "whenever" are not tied to particular days; neither are blocks, which start when you do.
export function isFlexible(s: Schedule): boolean {
  return s.kind === 'times' || s.kind === 'whenever' || s.kind === 'blocks';
}

// Where a day falls in a block of n days: 1 to n, or null when it is outside every block. A block opens on the first
// day you log that is not already inside one, and runs n days whether or not you log on each of them.
export function blockPosition(n: number, loggedDays: number[], day: number): number | null {
  const d = startOfDay(day);
  const span = Math.max(1, Math.round(n));
  let start: number | null = null;
  for (const l of [...new Set(loggedDays.map(startOfDay))].sort((a, b) => a - b)) {
    if (l > d) break;
    if (start === null || daysBetween(start, l) >= span) start = l;
  }
  if (start === null) return null;
  const pos = daysBetween(start, d) + 1;
  return pos >= 1 && pos <= span ? pos : null;
}

export function inWindow(w: ScheduleWindow | undefined, day: number): boolean {
  if (!w) return true;
  if (w.from && day < keyToDay(w.from)) return false;
  if (w.until && day > keyToDay(w.until)) return false;
  return true;
}

// Is this day one the schedule asks for? (Ignores the window and plans; see expectedOn.)
export function isDueOn(s: Schedule, day: number): boolean {
  const d = startOfDay(day);
  switch (s.kind) {
    case 'daily': return true;
    case 'weekdays': return s.days.includes(new Date(d).getDay());
    case 'interval': {
      const gap = daysBetween(keyToDay(s.from), d);
      return gap >= 0 && gap % Math.max(1, s.n) === 0;
    }
    case 'monthly': {
      const last = lastDayOfMonth(d);
      const want = s.day === 'last' ? last : Math.min(s.day, last); // the 31st means the last day in shorter months
      return new Date(d).getDate() === want;
    }
    default: return false; // times, whenever
  }
}

const ordinal = (n: number): string => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

export function daysText(days: number[]): string {
  const sorted = WEEK_ORDER.filter((d) => days.includes(d));
  if (sorted.length === 0) return 'No days chosen';
  if (sorted.length === 7) return 'Every day';
  if (sorted.length === 5 && !days.includes(0) && !days.includes(6)) return 'Weekdays';
  if (sorted.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
  if (sorted.length === 1) return `Every ${LONG[sorted[0]]}`;
  return sorted.map((d) => SHORT[d]).join(', ');
}

const shortDate = (key: string): string => {
  const d = new Date(keyToDay(key));
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

// A line for the tracker page when it only runs for a while: where it is, or that it has finished.
export function windowNote(w: ScheduleWindow | undefined, today: number): string {
  if (!w || (!w.from && !w.until)) return '';
  const start = w.from ? keyToDay(w.from) : undefined;
  const end = w.until ? keyToDay(w.until) : undefined;
  if (end !== undefined && today > end) return `Finished on ${shortDate(w.until as string)}.`;
  if (start !== undefined && today < start) return `Starts on ${shortDate(w.from as string)}.`;
  if (end !== undefined) {
    const left = daysBetween(today, end);
    return `Runs until ${shortDate(w.until as string)}. ${left === 0 ? 'Last day.' : `${left} day${left === 1 ? '' : 's'} left.`}`;
  }
  return `Started on ${shortDate(w.from as string)}.`;
}

// The schedule as a plain sentence, for the summary and the days screen.
export function scheduleText(s: Schedule, w?: ScheduleWindow): string {
  let text: string;
  switch (s.kind) {
    case 'daily': text = 'Every day'; break;
    case 'weekdays': text = daysText(s.days); break;
    case 'interval': text = s.n <= 1 ? 'Every day' : s.n === 2 ? 'Every other day' : `Every ${s.n} days`; break;
    case 'times': text = s.n === 1 ? `Once a ${s.per}` : `${s.n} times a ${s.per}`; break;
    case 'monthly': text = s.day === 'last' ? 'Last day of each month' : `On the ${ordinal(s.day)} of each month`; break;
    case 'blocks': text = `Blocks of ${s.n} days, whenever you start`; break;
    default: text = 'Whenever it happens';
  }
  if (w?.from && w?.until) text += `, ${shortDate(w.from)} to ${shortDate(w.until)}`;
  else if (w?.from) text += `, from ${shortDate(w.from)}`;
  else if (w?.until) text += `, until ${shortDate(w.until)}`;
  return text;
}
