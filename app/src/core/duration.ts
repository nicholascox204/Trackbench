// A Duration field holds whole minutes and is read and entered as hours and minutes.

const clean = (minutes: number): number => (Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0);

export function splitDuration(minutes: number): { h: number; m: number } {
  const total = clean(minutes);
  return { h: Math.floor(total / 60), m: total % 60 };
}

export const joinDuration = (h: number, m: number): number => clean(h) * 60 + clean(m);

// 7 h 22 m, 45 m, 7 h. Zero reads 0 m.
export function formatDuration(minutes: number): string {
  const { h, m } = splitDuration(minutes);
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

// A timer's elapsed time as whole minutes, to the nearest minute.
export const minutesFromMs = (ms: number): number => clean(ms / 60000);

// Sleep used to be a plain number of hours. Move such a tracker, and what it already recorded, to a Duration in minutes,
// with the timer filling it. A tracker already on a Duration is left alone.
type OldSleep = { id: string; presetId?: string; fields: { id: string; type: string; unit?: string; step?: number; default?: number | string }[]; tools: Record<string, unknown> };
export function upgradeSleepHours<T extends OldSleep, E extends { trackerId: string; values: Record<string, unknown> }>(trackers: T[], entries: E[]): { trackers: T[]; entries: E[] } {
  const old = new Set(trackers.filter((t) => t.presetId === 'sleep' && t.fields.some((f) => f.id === 'slept' && f.type === 'number')).map((t) => t.id));
  if (old.size === 0) return { trackers, entries };
  return {
    trackers: trackers.map((t) => (!old.has(t.id) ? t : {
      ...t,
      fields: t.fields.map((f) => (f.id === 'slept' && f.type === 'number' ? { id: f.id, name: (f as { name?: string }).name, type: 'duration', unit: 'min', default: 450 } : f)),
      tools: { ...t.tools, timer: true, timerInto: 'slept' },
    }) as T),
    entries: entries.map((e) => {
      const v = e.values.slept;
      return old.has(e.trackerId) && typeof v === 'number' ? { ...e, values: { ...e.values, slept: Math.round(v * 60) } } : e;
    }),
  };
}

// A timer can put its time into a field that holds minutes: an hours-and-minutes field, or a plain number measured in min.
export const canTimerFill = (f: { type: string; unit?: string }): boolean => f.type === 'duration' || (f.type === 'number' && f.unit === 'min');

// Reading, Running, Study, Practice, Workout log and Time log used to log a plain number of minutes. Move such a tracker to hours and minutes with the timer filling it. The numbers
// already recorded are minutes, so they stay as they are. A tracker already on a Duration is left alone.
export const MINUTES_PRESETS = ['reading', 'running', 'study', 'practice', 'workout-log', 'time-log'];
export function upgradeReadingMinutes<T extends OldSleep>(trackers: T[]): T[] {
  const isOld = (t: T) => MINUTES_PRESETS.includes(t.presetId ?? '') && t.fields.some((f) => f.id === 'minutes' && f.type === 'number');
  if (!trackers.some(isOld)) return trackers;
  return trackers.map((t) => (!isOld(t) ? t : {
    ...t,
    fields: t.fields.map((f) => (f.id === 'minutes' && f.type === 'number' ? { id: f.id, name: (f as { name?: string }).name === 'Minutes' ? (t.presetId === 'reading' ? 'Time read' : 'Time') : (f as { name?: string }).name, type: 'duration', unit: 'min', step: f.step ?? 5, default: f.default ?? 25 } : f)),
    tools: { ...t.tools, timer: true, timerInto: 'minutes' },
  }) as T);
}
