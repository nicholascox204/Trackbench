// Recently deleted trackers: the last five can be brought back, with their entries and their place in a system.
import assert from 'node:assert/strict';
import test from 'node:test';
import { dropFromTrash, moveToTrash, restoreFromTrash, TRASH_MAX } from './trash';
import { answersFromPreset, draftFromAnswers } from './setup';
import { emptyState, type AppState, type Entry, type Settings, type System, type Tracker } from './types';

const SETTINGS: Settings = { units: 'imperial' };
const tracker = (id: string): Tracker => ({ ...draftFromAnswers(answersFromPreset('check-in'), SETTINGS), id, name: `T ${id}`, systemId: 's', createdAt: 1 });
const entry = (trackerId: string, n: number): Entry => ({ id: `${trackerId}-${n}`, trackerId, at: 1000 + n, done: true, values: {} });
const system = (rules: System['config']['rules']): System => ({
  id: 's', name: 'Game', createdAt: 1,
  config: { intensity: 'standard', consistency: 'none', points: { on: false, reward: 1, penalty: 1 }, hearts: { on: false, max: 3 }, levels: { on: false }, lucky: { on: false, chance: 0, bonus: 0 }, allClear: { on: false, bonus: 0 }, rules },
});
const base = (ids: string[], rules: System['config']['rules'] = []): AppState => ({
  ...emptyState,
  trackers: ids.map(tracker),
  entries: ids.flatMap((id) => [entry(id, 1), entry(id, 2)]),
  systems: [system(rules)],
});

test('deleting a tracker removes it and its entries and keeps a copy', () => {
  const next = moveToTrash(base(['a', 'b']), 'a', 5000);
  assert.deepEqual(next.trackers.map((t) => t.id), ['b']);
  assert.ok(next.entries.every((e) => e.trackerId === 'b'));
  assert.equal(next.trash?.length, 1);
  assert.equal(next.trash?.[0].tracker.id, 'a');
  assert.equal(next.trash?.[0].entries.length, 2);
  assert.equal(next.trash?.[0].at, 5000);
});

test('restoring brings the tracker back with its entries, at the end of the bar', () => {
  const gone = moveToTrash(base(['a', 'b']), 'a', 5000);
  const back = restoreFromTrash(gone, gone.trash?.[0].id as string);
  assert.deepEqual(back.trackers.map((t) => t.id), ['b', 'a']);
  assert.equal(back.entries.filter((e) => e.trackerId === 'a').length, 2);
  assert.equal(back.trash?.length ?? 0, 0, 'it leaves the deleted list');
});

test('rules that pointed at a deleted tracker come back with it', () => {
  const rule = { id: 'r1', trackerId: 'a', measure: 'done', cmp: '>=' as const, value: 1, points: 2 };
  const gone = moveToTrash(base(['a', 'b'], [rule]), 'a', 5000);
  assert.equal(gone.systems[0].config.rules.length, 0);
  const back = restoreFromTrash(gone, gone.trash?.[0].id as string);
  assert.deepEqual(back.systems[0].config.rules.map((r) => r.id), ['r1']);
});

test('only the last five are kept; the oldest is gone for good', () => {
  let st = base(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  ['a', 'b', 'c', 'd', 'e', 'f'].forEach((id, i) => { st = moveToTrash(st, id, 1000 * (i + 1)); });
  assert.equal(st.trash?.length, TRASH_MAX);
  assert.equal(TRASH_MAX, 5);
  assert.deepEqual(st.trash?.map((d) => d.tracker.id), ['f', 'e', 'd', 'c', 'b'], 'newest first, a was pushed out');
});

test('restoring something that is not there, or twice, changes nothing', () => {
  const gone = moveToTrash(base(['a']), 'a', 5000);
  assert.equal(restoreFromTrash(gone, 'nope'), gone);
  const back = restoreFromTrash(gone, gone.trash?.[0].id as string);
  assert.equal(back.trackers.length, 1);
});

test('a tracker whose system is gone restores without it', () => {
  const gone = moveToTrash(base(['a']), 'a', 5000);
  const noSystem = { ...gone, systems: [] };
  const back = restoreFromTrash(noSystem, gone.trash?.[0].id as string);
  assert.equal(back.trackers[0].systemId, null);
});

test('dropping one removes it from the list for good', () => {
  const gone = moveToTrash(base(['a', 'b']), 'a', 5000);
  const dropped = dropFromTrash(gone, gone.trash?.[0].id as string);
  assert.equal(dropped.trash?.length, 0);
  assert.deepEqual(dropped.trackers.map((t) => t.id), ['b']);
});

test('deleting something that does not exist changes nothing', () => {
  const st = base(['a']);
  assert.equal(moveToTrash(st, 'zzz', 5000), st);
});
