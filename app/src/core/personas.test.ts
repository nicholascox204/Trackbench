import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPersona, PERSONAS } from './personas';
import type { Settings } from './types';

const SETTINGS = { units: 'metric', weekStart: 1 } as unknown as Settings;
const NOW = new Date(2026, 10, 22, 12).getTime();

test('every example person gets all their trackers and a history inside their span', () => {
  for (const p of PERSONAS) {
    const { trackers, entries } = buildPersona(p, SETTINGS, null, NOW);
    assert.equal(trackers.length, p.trackers.length, `${p.id} has every tracker`);
    assert.ok(entries.length > 0, `${p.id} has entries`);
    const ids = new Set(trackers.map((t) => t.id));
    assert.ok(entries.every((e) => ids.has(e.trackerId)), `${p.id} entries belong to trackers`);
    const oldest = NOW - (p.days + 1) * 86400000;
    assert.ok(entries.every((e) => e.at >= oldest && e.at <= NOW), `${p.id} entries sit inside the span`);
  }
});

test('an example person is the same every time', () => {
  const a = buildPersona(PERSONAS[2], SETTINGS, null, NOW);
  const b = buildPersona(PERSONAS[2], SETTINGS, null, NOW);
  assert.deepEqual(a.entries, b.entries);
});

test('lists and lifts get entries against their own items, and counters get taps', () => {
  const { trackers, entries } = buildPersona(PERSONAS[2], SETTINGS, null, NOW);
  const gym = trackers.find((t) => t.id.endsWith('gym-split'))!;
  const gymEntries = entries.filter((e) => e.trackerId === gym.id);
  assert.ok(gymEntries.length > 100 && gymEntries.every((e) => e.slotId && e.row !== undefined));
  const habit = trackers.find((t) => t.id.endsWith('habit'))!;
  assert.ok(entries.some((e) => e.trackerId === habit.id && e.slotId), 'habits are ticked against their items');
  assert.ok(entries.filter((e) => e.trackerId.endsWith('water')).length > 300, 'water is many taps');
});

test('how big the longest histories are, as stored', () => {
  for (const p of PERSONAS) {
    const { trackers, entries } = buildPersona(p, SETTINGS, null, NOW);
    const kb = Math.round(JSON.stringify({ trackers, entries }).length / 1024);
    console.log(`  ${p.id}: ${trackers.length} trackers, ${entries.length} entries, ${kb} KB`);
  }
});
