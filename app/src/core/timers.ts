// Saved state of the running countdowns and timers, one of each per tracker. Kept apart from the main app state on
// purpose: these are passing helpers, not tracking data, so they are never exported, imported or shared with a tracker.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { minutesFromMs } from './duration';
import { Countdown, CountStatus, newCountdown, pause, reset, secondsLeft, setLength, start, statusOf } from './countdown';
import { cancelCountdownEnd, dismissAlert, scheduleCountdownEnd, type AlertResult } from './countdownNotice';
import { clearLive, showLive } from './liveTimer';
import { Stopwatch, WatchStatus, elapsedMs, newStopwatch, pauseWatch, resetWatch, startWatch, watchStatus } from './stopwatch';

const KEY = 'sandbox.timers.v1';

interface Saved { countdowns: Record<string, Countdown>; watches: Record<string, Stopwatch> }

let saved: Saved = { countdowns: {}, watches: {} };
let lastAlert: AlertResult | null = null; // what happened to the most recent alert, so the bar can say when none will come
const listeners = new Set<() => void>();

function commit(next: Saved) {
  saved = next;
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(saved)).catch(() => {
    // Saving can fail (full storage). Keep running in memory.
  });
}

export async function loadTimers(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Saved> & Record<string, unknown>;
      // The first version saved a flat map of countdowns (then called the rest timer).
      saved = 'countdowns' in p || 'watches' in p
        ? { countdowns: p.countdowns ?? {}, watches: p.watches ?? {} }
        : { countdowns: p as unknown as Record<string, Countdown>, watches: {} };
    }
  } catch {
    saved = { countdowns: {}, watches: {} };
  }
  listeners.forEach((l) => l());
}

const getC = (id: string): Countdown => saved.countdowns[id] ?? newCountdown();
const putC = (id: string, c: Countdown) => commit({ ...saved, countdowns: { ...saved.countdowns, [id]: c } });
const getW = (id: string): Stopwatch => saved.watches[id] ?? newStopwatch();
const putW = (id: string, w: Stopwatch) => commit({ ...saved, watches: { ...saved.watches, [id]: w } });

async function alertFor(id: string, name: string, c: Countdown, now: number) {
  if (statusOf(c, now) === 'running') {
    lastAlert = await scheduleCountdownEnd(id, name, c.endsAt as number, c.length);
    void showLive('countdown', id, name, c.endsAt as number, c.length);
  } else {
    await cancelCountdownEnd(id);
    void clearLive(id);
  }
  listeners.forEach((l) => l());
}

export const countdownActions = {
  start: (id: string, name: string) => { const now = Date.now(); const c = start(getC(id), now); putC(id, c); void alertFor(id, name, c, now); },
  pause: (id: string, name: string) => { const now = Date.now(); const c = pause(getC(id), now); putC(id, c); void alertFor(id, name, c, now); },
  reset: (id: string, name: string) => { const now = Date.now(); const c = reset(getC(id)); putC(id, c); void alertFor(id, name, c, now); },
  // Typing a new time resets the countdown to it, whatever it was doing, and drops any alert that was waiting.
  setTime: (id: string, name: string, seconds: number) => { const now = Date.now(); const c = setLength(seconds); putC(id, c); void alertFor(id, name, c, now); },
};

// The time a timer has counted, waiting to be put into a Duration field. Not saved: it lasts as long as the page, and is
// taken by the form the moment it is on screen.
export interface TimerFill { fieldId: string; minutes: number; stamp: number }
let fill: Record<string, TimerFill | undefined> = {};
export const takeTimerFill = (trackerId: string): TimerFill | undefined => { const f = fill[trackerId]; fill = { ...fill, [trackerId]: undefined }; return f; };
export function useTimerFill(trackerId: string): TimerFill | undefined {
  return useSyncExternalStore(subscribe, () => fill[trackerId]);
}

// A countdown that ran all the way to zero counts as a full sit: its whole set time goes into the field, once per run.
// Only a run that finished recently counts, so an old one left from another day never fills today.
const filledRuns = new Set<number>();
export function fillFromCountdown(id: string, into: string | undefined, c: Countdown, now: number): void {
  const end = c.endsAt;
  if (!into || end === undefined || filledRuns.has(end) || end > now || now - end > 12 * 3600_000) return;
  filledRuns.add(end);
  const minutes = Math.max(1, Math.round(c.length / 60));
  fill = { ...fill, [id]: { fieldId: into, minutes, stamp: now } };
  listeners.forEach((l) => l());
}

export const timerActions = {
  start: (id: string, name?: string) => {
    const now = Date.now();
    const w = startWatch(getW(id), now);
    putW(id, w);
    void showLive('timer', id, name ?? '', now - elapsedMs(w, now)); // placed so the clock reads the time already counted
  },
  // Pausing stops the count. When the timer fills a field, the time counted goes into it (to the minute); it is not saved until you save.
  pause: (id: string, into?: string) => {
    const now = Date.now();
    const w = pauseWatch(getW(id), now);
    putW(id, w);
    void clearLive(id);
    if (into) { fill = { ...fill, [id]: { fieldId: into, minutes: minutesFromMs(elapsedMs(w, now)), stamp: now } }; listeners.forEach((l) => l()); }
  },
  // Resetting does not throw away what was counted: when the timer fills a field, the time goes into it first (as pausing does),
  // so nobody loses a value by reaching for Reset. Nothing is filled for under a minute, and the field is not saved until you save.
  reset: (id: string, into?: string) => {
    const now = Date.now();
    const w = getW(id);
    const minutes = into && watchStatus(w) !== 'idle' ? minutesFromMs(elapsedMs(w, now)) : 0;
    putW(id, resetWatch());
    void clearLive(id);
    if (into && minutes > 0) { fill = { ...fill, [id]: { fieldId: into, minutes, stamp: now } }; listeners.forEach((l) => l()); }
  },
};

// A countdown or timer whose tool was turned off, or whose tracker was deleted, stops: its alert is cancelled and it leaves
// the notification shade, so a tool you removed never rings later.
export function stopRemovedTimers(trackers: { id: string; tools: { countdown?: boolean; timer?: boolean } }[]): void {
  const byId = new Map(trackers.map((t) => [t.id, t]));
  let next = saved;
  for (const [id, c] of Object.entries(saved.countdowns)) {
    if (byId.get(id)?.tools.countdown) continue;
    void cancelCountdownEnd(id); void dismissAlert(id); void clearLive(id);
    if (c.endsAt !== undefined || c.pausedLeft !== undefined) { const { [id]: _, ...rest } = next.countdowns; next = { ...next, countdowns: rest }; }
  }
  for (const [id, w] of Object.entries(saved.watches)) {
    if (byId.get(id)?.tools.timer) continue;
    if (watchStatus(w) !== 'idle') { void clearLive(id); const { [id]: _, ...rest } = next.watches; next = { ...next, watches: rest }; }
  }
  if (next !== saved) commit(next);
}

// Coming back to the app: any countdown that has run out has its alert cleared, so it stops ringing.
export function dismissFinishedAlerts(now: number): void {
  for (const [id, c] of Object.entries(saved.countdowns)) {
    if (c.endsAt !== undefined && c.pausedLeft === undefined && c.endsAt <= now) void dismissAlert(id);
  }
}

// Timers that are doing something now, for choosing which tracker to open on: a stopwatch that is running (not one left
// running for over 12 hours, which was forgotten), a countdown still counting, or one that ended in the last half hour.
export function liveTimers(now: number): { id: string; since: number }[] {
  const out: { id: string; since: number }[] = [];
  for (const [id, w] of Object.entries(saved.watches)) {
    if (w.startedAt !== undefined && now - w.startedAt < 12 * 3600_000) out.push({ id, since: w.startedAt });
  }
  for (const [id, c] of Object.entries(saved.countdowns)) {
    if (c.endsAt === undefined || c.pausedLeft !== undefined) continue;
    if (c.endsAt > now) out.push({ id, since: c.endsAt - c.length * 1000 });
    else if (now - c.endsAt < 30 * 60_000) out.push({ id, since: c.endsAt - c.length * 1000 });
  }
  return out;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// A clock that ticks only while something is running.
function useNow(running: boolean, key: unknown): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [running, key]);
  return now;
}

export interface CountdownView { timer: Countdown; status: CountStatus; left: number; alert: AlertResult | null }

export function useCountdown(id: string): CountdownView {
  const all = useSyncExternalStore(subscribe, () => saved);
  const alert = useSyncExternalStore(subscribe, () => lastAlert);
  const timer = all.countdowns[id] ?? newCountdown();
  const running = timer.endsAt !== undefined && timer.pausedLeft === undefined && timer.endsAt > Date.now();
  const now = useNow(running, timer.endsAt);
  return { timer, status: statusOf(timer, now), left: secondsLeft(timer, now), alert };
}

export interface TimerView { status: WatchStatus; ms: number }

export function useTimer(id: string): TimerView {
  const all = useSyncExternalStore(subscribe, () => saved);
  const watch = all.watches[id] ?? newStopwatch();
  const now = useNow(watch.startedAt !== undefined, watch.startedAt);
  return { status: watchStatus(watch), ms: elapsedMs(watch, now) };
}
