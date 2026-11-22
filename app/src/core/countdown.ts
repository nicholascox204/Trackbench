// The countdown: set a time, press play, and it counts down to zero. Pure functions on a small saved record, so it
// survives leaving the screen or closing the app (it stores an end time, never a running counter). Not tracking data:
// nothing here is an entry. Used for resting between sets, but it knows nothing about sets.

export interface Countdown {
  length: number; // seconds it counts down from; remembered for next time
  endsAt?: number; // ms; set while running (and kept once it has run out)
  pausedLeft?: number; // seconds left; set while paused
}

export type CountStatus = 'idle' | 'running' | 'paused' | 'done';

export const DEFAULT_COUNTDOWN = 120;
export const MIN_COUNTDOWN = 5;
export const MAX_COUNTDOWN = 24 * 60 * 60;

export function clampLength(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_COUNTDOWN;
  return Math.min(MAX_COUNTDOWN, Math.max(MIN_COUNTDOWN, Math.round(seconds)));
}

export const newCountdown = (length: number = DEFAULT_COUNTDOWN): Countdown => ({ length: clampLength(length) });

export function statusOf(t: Countdown, now: number): CountStatus {
  if (t.pausedLeft !== undefined) return 'paused';
  if (t.endsAt === undefined) return 'idle';
  return t.endsAt <= now ? 'done' : 'running';
}

// Seconds left, rounded up so the last second reads 0:01, not 0:00.
export function secondsLeft(t: Countdown, now: number): number {
  const s = statusOf(t, now);
  if (s === 'paused') return t.pausedLeft ?? 0;
  if (s === 'running') return Math.max(0, Math.ceil(((t.endsAt as number) - now) / 1000));
  if (s === 'done') return 0;
  return t.length;
}

export function start(t: Countdown, now: number): Countdown {
  const s = statusOf(t, now);
  if (s === 'running') return t;
  const left = s === 'paused' ? (t.pausedLeft as number) : t.length;
  return { length: t.length, endsAt: now + left * 1000 };
}

export function pause(t: Countdown, now: number): Countdown {
  if (statusOf(t, now) !== 'running') return t;
  return { length: t.length, pausedLeft: secondsLeft(t, now) };
}

export function reset(t: Countdown): Countdown {
  return { length: t.length };
}

// Setting the time, at any point: it becomes the new time and the countdown goes back to idle at that value, even
// if it was running or paused. What you set is remembered for next time.
export function setLength(seconds: number): Countdown {
  return { length: clampLength(seconds) };
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// The digits that count from typed text: leading zeros dropped, at most six (h mm ss).
function typedDigits(text: string): string {
  return text.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(-6);
}

// What the box shows while typing: digits slide in from the right with the colons in place (1, 3, 0 shows 1:30;
// 1, 3, 0, 0, 0 shows 1:30:00). Six digits at most.
export function formatTyped(text: string): string {
  const d = typedDigits(text).padStart(3, '0');
  if (d.length <= 4) return `${parseInt(d.slice(0, -2), 10)}:${d.slice(-2)}`;
  return `${parseInt(d.slice(0, -4), 10)}:${d.slice(-4, -2)}:${d.slice(-2)}`;
}

// Reading what was typed, the way a microwave takes it: 1, 3, 0 is 1:30; 90 is ninety seconds; 1, 0, 0, 0, 0 is 1:00:00.
// Colons and anything else are ignored. No digits gives null, so the caller keeps the old time.
export function parseTyped(text: string): number | null {
  if (text.replace(/[^0-9]/g, '') === '') return null;
  const n = parseInt(typedDigits(text) || '0', 10);
  return Math.floor(n / 10000) * 3600 + (Math.floor(n / 100) % 100) * 60 + (n % 100);
}

// Applying one edit to the typed box. Typing past six digits is ignored, and a time past the maximum shows the maximum;
// either way `maxed` is true so the box can say so. Otherwise the text is the formatted digits.
export function applyTyped(text: string): { text: string; maxed: boolean } {
  const digits = text.replace(/[^0-9]/g, '').replace(/^0+/, '');
  if (digits.length > 6) return { text: applyTyped(digits.slice(0, 6)).text, maxed: true };
  const seconds = parseTyped(text);
  if (seconds !== null && seconds > MAX_COUNTDOWN) return { text: formatTyped(clock(MAX_COUNTDOWN)), maxed: true };
  return { text: formatTyped(text), maxed: false };
}
