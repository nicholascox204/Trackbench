// Turns stored entries into per-day results the engine can replay.

import { DayInput, DayTrackerResult, SystemResult, evaluate } from './engine';
import { goalEvents, weekEvents } from './goals';
import { questEvents } from './quests';
import { computeDay } from './measures';
import { planFor } from './plan';
import { addDays, startOfDay } from './time';
import type { Entry, Payout, Settings, System, Tracker } from './types';

const MAX_DAYS = 365;

export { dayResult, entriesOnDay } from './day';
import { dayResult, entriesOnDay } from './day';

export function buildDays(trackers: Tracker[], entries: Entry[], now: number): DayInput[] {
  if (trackers.length === 0) return [];
  const today = startOfDay(now);

  const byKey = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = `${e.trackerId}|${startOfDay(e.at)}`;
    const list = byKey.get(key);
    if (list) list.push(e);
    else byKey.set(key, [e]);
  }
  let first = today;
  for (const t of trackers) first = Math.min(first, startOfDay(t.createdAt));
  first = Math.max(first, addDays(today, -MAX_DAYS));

  const days: DayInput[] = [];
  for (let day = first; day <= today; day = addDays(day, 1)) {
    const results: Record<string, DayTrackerResult> = {};
    for (const t of trackers) results[t.id] = dayResult(t, byKey.get(`${t.id}|${day}`) ?? [], day, entries);
    days.push({ day, closed: day < today, results });
  }
  return days;
}

// Average of a measure over the last n days that have data, ending at endDay.
export function rollingAverage(
  t: Tracker, entries: Entry[], measureId: string, endDay: number, n: number,
): number | null {
  const vals: number[] = [];
  for (let i = 0; i < 30 && vals.length < n; i++) {
    const day = addDays(endDay, -i);
    const es = entriesOnDay(entries, t.id, day);
    if (!es.some((e) => e.done)) continue;
    const m = computeDay(t, es, planFor(t, day))[measureId];
    if (m !== undefined) vals.push(m);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// One game and what it makes of the trackers that are in it.
export interface Game {
  system: System;
  inSystem: Tracker[];
  result: SystemResult;
}

export interface Derived {
  system: System | null; // the default game (the first)
  inSystem: Tracker[];
  days: DayInput[];
  result: SystemResult | null;
  games: Game[]; // every game, the default first
}

export function derive(trackers: Tracker[], entries: Entry[], systems: System[], now: number, settings: Settings = { units: 'imperial' }): Derived {
  const days = buildDays(trackers, entries, now);
  const today = startOfDay(now);
  const weekStart = settings.weekStart ?? 'mon';
  const games: Game[] = systems.map((system) => {
    const inSystem = trackers.filter((t) => t.systemId === system.id);
    const pays = new Map<string, Payout | undefined>();
    for (const t of inSystem) for (const g of t.goals ?? []) pays.set(`${t.id}|${g.id}`, g.pay);
    for (const q of system.quests ?? []) pays.set(`|${q.id}`, q.pay);
    const week = system.config.week?.on ? weekEvents(inSystem, days, system.config.week.minPct, weekStart) : [];
    const events = [...week, ...goalEvents(inSystem, entries, today, settings, weekStart), ...questEvents(system.quests ?? [], inSystem, entries, today, weekStart)]
      .map((e) => ({ ...e, pay: pays.get(`${e.trackerId}|${e.goalId}`) }));
    return { system, inSystem, result: evaluate(system.config, inSystem, days, events) };
  });
  const first = games[0];
  return { system: first?.system ?? null, inSystem: first?.inSystem ?? [], days, result: first?.result ?? null, games };
}

// Days since the last slip (or since the tracker began). Slipping today is 0.
// The longest run of days without a slip so far, counting the run that is still going.
export function bestClean(t: Tracker, entries: Entry[], today: number): number {
  const start = t.cleanFrom ?? startOfDay(t.createdAt); // a count typed by hand moves the start, earlier or later
  const days = [...new Set(entries.filter((e) => e.trackerId === t.id && e.done).map((e) => startOfDay(e.at)))].filter((d) => d >= start && d >= (t.cleanSetOn ?? 0)).sort((a, b) => a - b);
  let best = 0;
  let prev = start;
  for (const d of days) { best = Math.max(best, Math.round((d - prev) / 86400000)); prev = d; }
  return Math.max(best, Math.round((today - prev) / 86400000));
}

export function cleanDays(t: Tracker, entries: Entry[], today: number): number {
  let last = t.cleanFrom ?? startOfDay(t.createdAt);
  for (const e of entries) if (e.trackerId === t.id && e.done && startOfDay(e.at) >= (t.cleanSetOn ?? 0)) last = Math.max(last, startOfDay(e.at));
  return Math.max(0, Math.round((today - last) / 86400000));
}
