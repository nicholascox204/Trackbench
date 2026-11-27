// Bringing readings in from Health Connect, Android's shared health store. Watches and apps write there (Samsung Health, Fitbit,
// Google Fit, Withings, Oura, Garmin through its Health Connect link, smart scales, blood pressure cuffs), so one connection covers
// most of them. Five kinds, each landing in the tracker made for it:
//   weight         a weigh-in              one reading a day (the latest)
//   sleep          a sleep log             bedtime and wake time, on the day you woke
//   runs           a running log           distance and time of each run or treadmill run
//   bloodPressure  blood pressure          top, bottom
//   bloodSugar     blood sugar             level in mg/dL, and before or after a meal when the meter says
// Every brought-in entry keeps the Health Connect record id (values.hc), so bringing the same days in again adds nothing.
// This file is the mapping, which tests check; healthRead.ts is the thin part that talks to the phone.

import { spanPair, spanValues } from './spanClock';
import { canRecordRun } from './runImport';
import { startOfDay } from './time';
import type { Entry, Tracker } from './types';

export type HealthKind = 'weight' | 'sleep' | 'runs' | 'bloodPressure' | 'bloodSugar';

export const HEALTH_LABEL: Record<HealthKind, string> = {
  weight: 'weight', sleep: 'sleep', runs: 'runs', bloodPressure: 'blood pressure', bloodSugar: 'blood sugar',
};
export const RECORD: Record<HealthKind, string> = { weight: 'Weight', sleep: 'SleepSession', runs: 'ExerciseSession', bloodPressure: 'BloodPressure', bloodSugar: 'BloodGlucose' };
export const RUN_TYPES = [56, 57]; // Health Connect's running and treadmill running

// Which kind a tracker takes, if any, from what its fields look like alone: a template gets nothing a tracker built the same
// way would not, so templates and Build your own stay one system.
export function healthKind(t: Tracker): HealthKind | undefined {
  if (t.input !== 'form') return undefined;
  const has = (re: RegExp) => t.fields.some((f) => f.type === 'number' && re.test(f.name));
  if (has(/systolic|^top/i) && has(/diastolic|^bottom/i)) return 'bloodPressure';
  if (t.fields.some((f) => f.type === 'number' && (f.unit === 'mg/dL' || /sugar|glucose/i.test(f.name)))) return 'bloodSugar';
  const p = spanPair(t);
  if (p && /bed|sleep/i.test(`${p.from.name} ${p.measure.name}`)) return 'sleep';
  if (canRecordRun(t.fields)) return 'runs';
  if (t.daily && t.fields.some((f) => f.unitKind === 'weight')) return 'weight';
  return undefined;
}

// What Health Connect gives, reduced to what we use. Times are ms.
export type HealthItem =
  | { kind: 'weight'; id: string; at: number; kg: number }
  | { kind: 'sleep'; id: string; start: number; end: number }
  | { kind: 'runs'; id: string; start: number; end: number; meters: number; type: number }
  | { kind: 'bloodPressure'; id: string; at: number; top: number; bottom: number }
  | { kind: 'bloodSugar'; id: string; at: number; mgdl: number; relation: number };

export interface Fill { day: number; at: number; values: Entry['values']; daily: boolean }

const MEAL: Record<number, string> = { 2: 'Fasting', 3: 'Before meal', 4: 'After meal' };

// One item as values for this tracker, or undefined when it does not fit (a walk on a running tracker, a sleep under an hour).
export function fillFor(t: Tracker, item: HealthItem): Fill | undefined {
  const f = (pred: (x: Tracker['fields'][number]) => boolean) => t.fields.find(pred);
  switch (item.kind) {
    case 'weight': {
      const w = f((x) => x.unitKind === 'weight');
      return w ? { day: startOfDay(item.at), at: item.at, values: { [w.id]: Math.round(item.kg * 100) / 100, hc: item.id }, daily: true } : undefined;
    }
    case 'sleep': {
      const p = spanPair(t);
      if (!p || item.end - item.start < 3600000) return undefined;
      return { day: startOfDay(item.end), at: item.end, values: { ...spanValues(p, item.start, item.end), hc: item.id }, daily: !!t.daily };
    }
    case 'runs': {
      if (!RUN_TYPES.includes(item.type)) return undefined;
      const dist = f((x) => x.unitKind === 'distance'); const time = f((x) => x.type === 'duration');
      if (!dist || !time || item.meters <= 0) return undefined;
      const secs = Math.round((item.end - item.start) / 1000);
      return { day: startOfDay(item.start), at: item.start, values: { [dist.id]: Math.round(item.meters) / 1000, [time.id]: Math.max(1, Math.round(secs / 60)), secs, hc: item.id }, daily: false };
    }
    case 'bloodPressure': {
      const top = f((x) => /systolic|top/i.test(x.name)); const bottom = f((x) => /diastolic|bottom/i.test(x.name));
      return top && bottom ? { day: startOfDay(item.at), at: item.at, values: { [top.id]: Math.round(item.top), [bottom.id]: Math.round(item.bottom), hc: item.id }, daily: false } : undefined;
    }
    case 'bloodSugar': {
      const level = f((x) => x.type === 'number' && (/sugar|glucose|level/i.test(x.name) || x.unit === 'mg/dL'));
      const when = f((x) => x.type === 'choice' && (x.options ?? []).includes('Before meal'));
      if (!level) return undefined;
      const meal = MEAL[item.relation];
      return { day: startOfDay(item.at), at: item.at, values: { [level.id]: Math.round(item.mgdl), ...(when && meal ? { [when.id]: meal } : {}), hc: item.id }, daily: false };
    }
  }
}

// The fills that are new for this tracker: anything already brought in is skipped, and for one-reading-a-day trackers only the
// latest of each day is kept, and only on a day that has nothing logged by hand.
export function newFills(t: Tracker, items: HealthItem[], entries: Entry[]): Fill[] {
  const mine = entries.filter((e) => e.trackerId === t.id && e.done);
  const seen = new Set(mine.map((e) => e.values.hc).filter(Boolean));
  const handDays = new Set(mine.filter((e) => !e.values.hc).map((e) => startOfDay(e.at)));
  const out: Fill[] = [];
  const byDay = new Map<number, Fill>();
  for (const it of items) {
    if (seen.has(it.id)) continue;
    const fill = fillFor(t, it);
    if (!fill) continue;
    if (!fill.daily) { out.push(fill); continue; }
    if (handDays.has(fill.day)) continue;
    const had = mine.some((e) => startOfDay(e.at) === fill.day && e.values.hc);
    if (had) continue; // the day already has a brought-in reading
    const prev = byDay.get(fill.day);
    if (!prev || fill.at > prev.at) byDay.set(fill.day, fill);
  }
  return [...out, ...byDay.values()].sort((a, b) => a.at - b.at);
}

