// Tiny event bus. Everything that happens in the core emits an event here.
// Future modules (points, streaks, ...) will subscribe instead of the core
// knowing about them. With no modules installed it simply has no listeners.

import type { Entry } from './types';

export type CoreEvent =
  | { type: 'entry.logged'; entry: Entry }
  | { type: 'entry.removed'; entry: Entry }
  | { type: 'tracker.added'; trackerId: string }
  | { type: 'tracker.removed'; trackerId: string };
// Planned: { type: 'period.closed', period: 'day' | 'week', ... }

type Handler = (event: CoreEvent) => void;

const handlers = new Set<Handler>();

export function on(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function emit(event: CoreEvent): void {
  handlers.forEach((h) => h(event));
}
