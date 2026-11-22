// Which tracker the app opens on. Local statistics on your own entries, no guessing games: a tracker that is due and not yet
// done always beats one that is finished; among those waiting, the one you usually log nearest this time of day wins; and a
// quick reopen goes back to where you were. With too little history it falls back to the bar order.

import { dayResult, entriesOnDay } from './derive';
import { startOfDay } from './time';
import type { Entry, Tracker } from './types';

export type OpenOn = { mode: 'smart' } | { mode: 'last' } | { mode: 'pinned'; id: string };
export const DEFAULT_OPEN_ON: OpenOn = { mode: 'smart' };

const MIN_DAYS = 5; // days with an entry before a usual time means anything
const RECENT_DAYS = 60;
const HALF_LIFE = 7;  // days: an entry this old counts half as much as one from today
const MAX_SPREAD = 90; // minutes: how far the middle half of the times may range before there is no usual time
const NEAR = 180; // minutes: further than this from the usual time is not a match
const SHORT_MEMORY = 30 * 60000; // a reopen this soon goes back to where you were
const ACTIVE_DAYS = 14; // a tracker with nothing logged for this long, and not new, is left to the end of the line
const HALF_DAY = 12 * 3600000;

const minuteOf = (ts: number): number => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };

// The middle of when you usually log: the time of the first entry on each recent day, with recent days counting for more
// (a day's weight halves every HALF_LIFE days), so a changed habit takes over in about two weeks, while one odd day cannot
// move it. Only when there are enough days and they cluster; null otherwise. It is always recomputed from your entries, never
// stored, so nothing builds on its own earlier guesses.
const weekendDay = (ts: number): boolean => { const g = new Date(ts).getDay(); return g === 0 || g === 6; };

// Weekends often run on a different clock, so the usual time comes from days of the same kind as today (weekday or weekend)
// when there are enough of them, and from all days otherwise. A day logged afterwards by hand is stamped noon, which says
// nothing about when it happened, so those are left out.
export function usualMinute(entries: Entry[], now: number = Date.now()): number | null {
  const same = usualFrom(entries, now, true);
  return same !== null ? same : usualFrom(entries, now, false);
}

function usualFrom(entries: Entry[], now: number, sameKind: boolean): number | null {
  const today = startOfDay(now);
  const firstOfDay = new Map<number, number>();
  for (const e of entries) {
    if (!e.done || e.at < today - RECENT_DAYS * 86400000 || startOfDay(e.at) === today) continue;
    if (e.at === startOfDay(e.at) + HALF_DAY) continue;
    if (sameKind && weekendDay(e.at) !== weekendDay(now)) continue;
    const k = startOfDay(e.at);
    if (!firstOfDay.has(k) || e.at < (firstOfDay.get(k) as number)) firstOfDay.set(k, e.at);
  }
  if (firstOfDay.size < MIN_DAYS) return null;
  const items = [...firstOfDay.entries()]
    .map(([day, ts]) => ({ m: minuteOf(ts), w: Math.pow(0.5, Math.round((today - day) / 86400000) / HALF_LIFE) }))
    .sort((x, y) => x.m - y.m);
  const total = items.reduce((n, i) => n + i.w, 0);
  const at = (p: number): number => {
    let run = 0;
    for (const i of items) { run += i.w; if (run >= total * p) return i.m; }
    return items[items.length - 1].m;
  };
  if (at(0.75) - at(0.25) > MAX_SPREAD) return null;
  return at(0.5);
}

export function pickStart(
  trackers: Tracker[], entries: Entry[], now: number, openOn: OpenOn, last: { id: string; at: number } | null,
  live: { id: string; since: number }[] = [], // timers running right now, from timers.ts
): string | null {
  if (trackers.length === 0) return null;
  const exists = (id: string | undefined): id is string => !!id && trackers.some((t) => t.id === id);
  // A timer that is running is the clearest sign of what you are doing, so it beats the rule and the memory (not a pinned choice).
  if (openOn.mode !== 'pinned' || !exists(openOn.id)) {
    const timed = live.filter((l) => exists(l.id)).sort((a, b) => b.since - a.since)[0];
    if (timed) return timed.id;
  }
  const lastId = last && exists(last.id) ? last.id : undefined;

  const waiting = (): Tracker[] => {
    const today = startOfDay(now);
    return trackers.filter((t) => { const r = dayResult(t, entriesOnDay(entries, t.id, today), today, entries); return r.expected && !r.success; });
  };
  const rule = (): string => {
    const open = waiting();
    if (open.length === 0) return lastId ?? trackers[0].id;
    const here = minuteOf(now);
    // Trackers you actually use come first; one nothing has been logged on for two weeks (and that is not new) waits at the end.
    const since = startOfDay(now) - ACTIVE_DAYS * 86400000;
    const used = (t: Tracker): boolean => t.createdAt >= since || entries.some((e) => e.trackerId === t.id && e.done && e.at >= since);
    const live = open.filter(used);
    const pool = live.length > 0 ? live : open;
    let best: { id: string; gap: number } | null = null;
    for (const t of pool) {
      const usual = usualMinute(entries.filter((e) => e.trackerId === t.id), now);
      if (usual === null) continue;
      const diff = Math.abs(usual - here);
      const gap = Math.min(diff, 1440 - diff);
      if (gap <= NEAR && (!best || gap < best.gap)) best = { id: t.id, gap };
    }
    return best ? best.id : pool[0].id;
  };

  if (openOn.mode === 'pinned' && exists(openOn.id)) return openOn.id;
  if (openOn.mode === 'last' && lastId) return lastId;
  // Back where you were, unless that one is finished and something else is still waiting.
  if (openOn.mode === 'smart' && last && lastId && now - last.at >= 0 && now - last.at <= SHORT_MEMORY) {
    const open = waiting();
    if (open.length === 0 || open.some((t) => t.id === lastId)) return lastId;
  }
  return rule();
}

// "7:30 am", for showing what was learned.
export function minuteText(m: number): string {
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
