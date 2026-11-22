// Quests: goals that belong to the system, not to one tracker. They span the trackers you choose (or all of them):
// "complete three trackers today", "have five perfect days this week", "log twenty entries this month". Each is judged
// from what the trackers already say about a day (did it count as done, was it expected), so a quest never needs its own
// logging. Meeting one over a week, a month or by a date feeds points, like a tracker's goals do.

import { dayResult, entriesOnDay } from './day';
import { WEIGHT, periodOf, type GoalEvent, type WeekStart } from './goals';
import { daysBetween, keyToDay } from './schedule';
import { addDays, startOfDay } from './time';
import type { Entry, Quest, QuestMetric, Tracker } from './types';

export const METRIC_LABEL: Record<QuestMetric, string> = { trackersDone: 'Trackers completed', perfectDays: 'Perfect days', entries: 'Entries logged' };
export const METRIC_HINT: Record<QuestMetric, string> = {
  trackersDone: 'Each tracker that has a good day counts once for that day.',
  perfectDays: 'A day when every chosen tracker that was due had a good day.',
  entries: 'Every entry you log on the chosen trackers.',
};

const DAY = 86400000;
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (key: string): string => { const d = new Date(keyToDay(key)); return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`; };

// The trackers a quest applies to: the chosen ones that still exist.
export function questTrackers(q: Quest, trackers: Tracker[]): Tracker[] {
  return q.trackers === 'all' ? trackers : trackers.filter((t) => (q.trackers as string[]).includes(t.id));
}

// What one day adds to a quest.
export function valueOn(q: Quest, chosen: Tracker[], entries: Entry[], day: number): number {
  if (chosen.length === 0) return 0;
  if (q.metric === 'entries') return chosen.reduce((n, t) => n + entriesOnDay(entries, t.id, day).filter((e) => e.done).length, 0);
  const results = chosen.map((t) => dayResult(t, entriesOnDay(entries, t.id, day), day, entries));
  if (q.metric === 'trackersDone') return results.filter((r) => r.success).length;
  const due = results.filter((r) => r.expected);
  return due.length > 0 && due.every((r) => r.success) ? 1 : 0; // perfect day
}

export function valueInRange(q: Quest, chosen: Tracker[], entries: Entry[], from: number, to: number): number {
  let sum = 0;
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) sum += valueOn(q, chosen, entries, d);
  return sum;
}

export interface QuestProgress { value: number; target: number; fraction: number; status: 'active' | 'met' | 'over' | 'missed'; headline: string; detail: string }

export function questProgress(q: Quest, trackers: Tracker[], entries: Entry[], today: number, weekStart: WeekStart): QuestProgress {
  const chosen = questTrackers(q, trackers);
  let start = today;
  let end = today;
  if (q.how === 'week' || q.how === 'month') { const p = periodOf(q.how, today, weekStart); start = p.start; end = p.end; }
  else if (q.how === 'total') { start = keyToDay(q.from); end = q.until ? keyToDay(q.until) : today; }
  const value = valueInRange(q, chosen, entries, start, Math.min(end, today));
  const met = value >= q.value;
  const left = Math.max(0, daysBetween(today, end));
  const pastDue = q.how === 'total' && !!q.until && today > keyToDay(q.until) && !met;
  const unit = q.metric === 'entries' ? 'entries' : q.metric === 'perfectDays' ? 'perfect days' : 'trackers';
  let detail = '';
  if (met) detail = '';
  else if (pastDue) detail = 'The date passed';
  else if (q.how === 'day') detail = `${q.value - value} more today`;
  else if (q.how === 'total' && !q.until) detail = `${q.value - value} to go`;
  else detail = `${q.value - value} to go · ${left} day${left === 1 ? '' : 's'} left`;
  return {
    value, target: q.value, fraction: q.value > 0 ? Math.min(1, value / q.value) : 0,
    status: met ? 'met' : pastDue ? 'missed' : 'active',
    headline: `${value} of ${q.value}${q.how === 'day' ? ` ${unit}` : ''}`, detail,
  };
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export function describeQuest(q: Quest, trackers: Tracker[]): string {
  const n = q.value;
  const what =
    q.metric === 'trackersDone' ? `Complete ${n} ${plural(n, 'tracker', 'trackers')}`
    : q.metric === 'perfectDays' ? `Have ${n} perfect ${plural(n, 'day', 'days')}`
    : `Log ${n} ${plural(n, 'entry', 'entries')}`;
  const when = q.how === 'day' ? ' today' : q.how === 'week' ? ' this week' : q.how === 'month' ? ' this month' : q.until ? ` by ${shortDate(q.until)}` : '';
  const chosen = questTrackers(q, trackers);
  const scope = q.trackers === 'all' ? '' : chosen.length === 0 ? ' (no trackers left)' : chosen.length <= 2 ? ` · ${chosen.map((t) => t.name).join(', ')}` : ` · ${chosen.length} trackers`;
  return `${what}${when}${scope}`;
}

// Meeting a quest over a finished week or month, or by a date, is a result worth points, like a tracker's own goal.
export function questEvents(quests: Quest[], trackers: Tracker[], entries: Entry[], today: number, weekStart: WeekStart): GoalEvent[] {
  const out: GoalEvent[] = [];
  for (const q of quests) {
    if (q.how === 'day') continue; // a good day already earns its points
    const chosen = questTrackers(q, trackers);
    const title = `Quest: ${describeQuest(q, trackers)}`;
    const from = keyToDay(q.from);
    if (q.how === 'week' || q.how === 'month') {
      let p = periodOf(q.how, from, weekStart);
      if (p.start < from) p = periodOf(q.how, addDays(p.end, 1), weekStart); // the first partial period is not judged
      for (let i = 0; i < 120 && p.end < today; i++) {
        out.push({ day: p.end, trackerId: '', goalId: q.id, title, success: valueInRange(q, chosen, entries, p.start, p.end) >= q.value, weight: WEIGHT[q.how] });
        p = periodOf(q.how, addDays(p.end, 1), weekStart);
      }
    } else {
      const last = q.until ? Math.min(today, keyToDay(q.until)) : today;
      let sum = 0;
      let metOn: number | undefined;
      for (let d = from; d <= last && metOn === undefined; d = addDays(d, 1)) {
        sum += valueOn(q, chosen, entries, d);
        if (sum >= q.value) metOn = d;
      }
      if (metOn !== undefined) out.push({ day: metOn, trackerId: '', goalId: q.id, title, success: true, weight: WEIGHT.once });
      else if (q.until && keyToDay(q.until) < today) out.push({ day: keyToDay(q.until), trackerId: '', goalId: q.id, title, success: false, weight: WEIGHT.once });
    }
  }
  return out.sort((a, b) => a.day - b.day);
}

void DAY;
