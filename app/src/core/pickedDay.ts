// The day you switched a tracker to, remembered while the app stays open so leaving the page and coming back does not
// throw you back to today. It lasts until a new day begins, or until the app opens on that tracker by itself (which means
// "today" again). Kept in memory on purpose: nothing about it needs to survive a restart.

import { startOfDay } from './time';

const picked = new Map<string, { day: number; today: number }>();

export function rememberPickedDay(trackerId: string, day: number, now: number = Date.now()): void {
  picked.set(trackerId, { day, today: startOfDay(now) });
}

// The day to show: the one you switched to, if it was picked today; otherwise null (use the default).
export function pickedDayFor(trackerId: string, now: number = Date.now()): number | null {
  const p = picked.get(trackerId);
  return p && p.today === startOfDay(now) ? p.day : null;
}

export function forgetPickedDay(trackerId: string): void {
  picked.delete(trackerId);
}
