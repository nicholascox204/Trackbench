// Recently deleted trackers. Deleting a tracker moves it, with its entries and the system rules that pointed at it, to a
// short list; the last five can be restored from Settings. Older ones are gone for good. Pure functions on the state.

import type { AppState, DeletedTracker } from './types';

export const TRASH_MAX = 5;

const newId = (): string => Math.random().toString(36).slice(2, 10);

// Remove a tracker (and its entries, and the rules that pointed at it) and keep a copy.
export function moveToTrash(state: AppState, trackerId: string, now: number): AppState {
  const tracker = state.trackers.find((t) => t.id === trackerId);
  if (!tracker) return state;
  const rules = state.systems.flatMap((s) => s.config.rules.filter((r) => r.trackerId === trackerId).map((rule) => ({ systemId: s.id, rule })));
  const copy: DeletedTracker = { id: newId(), at: now, tracker, entries: state.entries.filter((e) => e.trackerId === trackerId), rules };
  return {
    ...state,
    trackers: state.trackers.filter((t) => t.id !== trackerId),
    entries: state.entries.filter((e) => e.trackerId !== trackerId),
    systems: state.systems.map((s) => ({ ...s, config: { ...s.config, rules: s.config.rules.filter((r) => r.trackerId !== trackerId) } })),
    trash: [copy, ...(state.trash ?? [])].slice(0, TRASH_MAX),
  };
}

// Bring one back: at the end of the bar, with its entries, and in its system again if that system still exists.
export function restoreFromTrash(state: AppState, trashId: string): AppState {
  const item = (state.trash ?? []).find((d) => d.id === trashId);
  if (!item) return state;
  const systemStill = state.systems.some((s) => s.id === item.tracker.systemId);
  return {
    ...state,
    trackers: [...state.trackers, { ...item.tracker, systemId: systemStill ? item.tracker.systemId : null }],
    entries: [...state.entries, ...item.entries],
    systems: state.systems.map((s) => ({ ...s, config: { ...s.config, rules: [...s.config.rules, ...item.rules.filter((r) => r.systemId === s.id).map((r) => r.rule)] } })),
    trash: (state.trash ?? []).filter((d) => d.id !== trashId),
  };
}

// Delete one from the list for good.
export function dropFromTrash(state: AppState, trashId: string): AppState {
  return { ...state, trash: (state.trash ?? []).filter((d) => d.id !== trashId) };
}
