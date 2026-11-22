export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Calendar-safe day arithmetic (handles daylight saving shifts).
export function addDays(dayStart: number, n: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isToday(ts: number, now: number = Date.now()): boolean {
  return startOfDay(ts) === startOfDay(now);
}

export function formatToday(now: number = Date.now()): string {
  return new Date(now).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDay(dayStart: number): string {
  return new Date(dayStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
