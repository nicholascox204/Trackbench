// The timer: press play and it counts up, pause, reset. Like the countdown it stores a start time, not a running
// counter, so it keeps counting while you are elsewhere and survives closing the app. Not tracking data.

export interface Stopwatch {
  banked: number; // ms counted before the current run (while paused, all of it)
  startedAt?: number; // ms; set while running
}

export type WatchStatus = 'idle' | 'running' | 'paused';

export const newStopwatch = (): Stopwatch => ({ banked: 0 });

export function watchStatus(t: Stopwatch): WatchStatus {
  if (t.startedAt !== undefined) return 'running';
  return t.banked > 0 ? 'paused' : 'idle';
}

export function elapsedMs(t: Stopwatch, now: number): number {
  return t.banked + (t.startedAt !== undefined ? Math.max(0, now - t.startedAt) : 0);
}

export function startWatch(t: Stopwatch, now: number): Stopwatch {
  return t.startedAt !== undefined ? t : { banked: t.banked, startedAt: now };
}

export function pauseWatch(t: Stopwatch, now: number): Stopwatch {
  return t.startedAt === undefined ? t : { banked: elapsedMs(t, now) };
}

export const resetWatch = (): Stopwatch => newStopwatch();

// 0:07, 12:05 or 1:02:09 once past the hour. Whole seconds, rounded down, as a stopwatch shows them.
export function watchClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
