// Tracker names stay unique (ignoring capitals and spaces at the ends). Setup blocks a taken name; anything that adds a tracker
// without asking (restoring a deleted one, pasting a copied tracker, merging a backup) gets the next free "Name 2", "Name 3",
// shortening the name if needed so it still fits the limit.
import { LIMITS } from '../constants/layout';

const key = (s: string): string => s.trim().toLowerCase();

export function uniqueName(name: string, others: string[]): string {
  const taken = new Set(others.map(key));
  const base = name.trim();
  if (!taken.has(key(base))) return base;
  for (let n = 2; ; n++) {
    const tail = ` ${n}`;
    const candidate = `${base.slice(0, LIMITS.trackerName - tail.length).trimEnd()}${tail}`;
    if (!taken.has(key(candidate))) return candidate;
  }
}

// Names for several trackers added at once: each is checked against the ones already there and the ones before it.
export function uniqueNames<T extends { name: string }>(adding: T[], existing: string[]): T[] {
  const seen = [...existing];
  return adding.map((t) => { const name = uniqueName(t.name, seen); seen.push(name); return name === t.name ? t : { ...t, name }; });
}
