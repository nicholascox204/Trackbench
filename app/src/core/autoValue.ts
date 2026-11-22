// The number an automatic source has just worked out for a tracker's day. The form reads it so that turning "Fill in
// automatically" back on replaces whatever was typed, in the same moment, instead of waiting for a value that differs.
import { useSyncExternalStore } from 'react';

const values = new Map<string, number>();
const listeners = new Set<() => void>();

const keyOf = (trackerId: string, day: number): string => `${trackerId}:${day}`;

export function setAutoValue(trackerId: string, day: number, n: number): void {
  const k = keyOf(trackerId, day);
  if (values.get(k) === n) return;
  values.set(k, n);
  listeners.forEach((l) => l());
}

export function useAutoValue(trackerId: string, day: number): number | undefined {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => values.get(keyOf(trackerId, day)),
  );
}
