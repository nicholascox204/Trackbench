// A live clock for trackers that work out hours between two times of day (Fasting: last meal to first meal; Sleep: bedtime to
// waking). Instead of typing both times, you tap when the first happens and again when the second does; the entry is filled in.
// The start is kept on the phone so it survives closing the app.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Field, Measure, Tracker } from './types';

export interface SpanPair { measure: Measure; from: Field; to: Field }

// The first "hours between two times" a tracker has, with its two time fields.
export function spanPair(t: { fields: Field[]; measures: Measure[] }): SpanPair | undefined {
  for (const m of t.measures) {
    if (m.calc.op !== 'sumExpr' || m.calc.fn !== 'span') continue;
    const { a, b } = m.calc;
    const from = t.fields.find((f) => f.id === a && f.type === 'time');
    const to = t.fields.find((f) => f.id === b && f.type === 'time');
    if (from && to) return { measure: m, from, to };
  }
  return undefined;
}

export const minutesOfDay = (ms: number): number => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };

// The two times to save for a span that began at `start` and ended at `end`.
export function spanValues(p: SpanPair, start: number, end: number): Record<string, number> {
  return { [p.from.id]: minutesOfDay(start), [p.to.id]: minutesOfDay(end) };
}

const key = (id: string) => `trackbench.clock.${id}`;
export async function clockStart(t: Tracker): Promise<number | undefined> {
  const v = await AsyncStorage.getItem(key(t.id)).catch(() => null);
  return v ? Number(v) : undefined;
}
export async function setClockStart(t: Tracker, at: number | undefined): Promise<void> {
  await (at === undefined ? AsyncStorage.removeItem(key(t.id)) : AsyncStorage.setItem(key(t.id), String(at))).catch(() => undefined);
}
