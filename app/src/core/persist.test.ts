import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { emptySnapshot, isMigrated, load, markMigrated, openSchema, save, wipe, type Db } from './persist';
import { buildPersona, PERSONAS } from './personas';
import { emptyState, type AppState, type Entry, type Settings } from './types';

// The same SQL the phone runs, on Node's own SQLite.
function testDb(): { db: Db; raw: DatabaseSync; rowsWritten: () => number } {
  const raw = new DatabaseSync(':memory:');
  let written = 0;
  const db: Db = {
    exec: async (sql) => { raw.exec(sql); },
    all: async <T,>(sql: string, params: unknown[] = []) => raw.prepare(sql).all(...(params as never[])) as T[],
    run: async (sql, params = []) => { raw.prepare(sql).run(...(params as never[])); },
    runMany: async (sql, rows) => { const s = raw.prepare(sql); for (const r of rows) { s.run(...(r as never[])); written++; } },
    transaction: async (fn) => { raw.exec('begin'); try { await fn(); raw.exec('commit'); } catch (e) { raw.exec('rollback'); throw e; } },
  };
  return { db, raw, rowsWritten: () => written };
}

// what the database holds has no undefined fields (a missing field and an undefined one mean the same to the app)
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const SETTINGS = { units: 'metric', weekStart: 1 } as unknown as Settings;
const NOW = new Date(2026, 10, 22, 12).getTime();
const personState = (id: string): AppState => {
  const p = buildPersona(PERSONAS.find((x) => x.id === id)!, SETTINGS, null, NOW);
  return { ...emptyState, settings: SETTINGS, trackers: p.trackers, entries: p.entries, onboarded: true };
};

test('what is saved is what comes back, in the same order', async () => {
  const { db } = testDb();
  await openSchema(db);
  const state = personState('regular');
  await save(db, emptySnapshot(), state);
  const back = await load(db);
  assert.deepEqual(back.state.trackers, plain(state.trackers));
  assert.deepEqual(back.state.entries, state.entries);
  assert.deepEqual(back.state.settings, state.settings);
  assert.equal(back.state.onboarded, true);
});

test('a tap writes one row, not everything', async () => {
  const { db, rowsWritten } = testDb();
  await openSchema(db);
  const state = personState('regular');
  const snap = await save(db, emptySnapshot(), state);
  const before = rowsWritten();
  const tap: Entry = { id: 'new1', trackerId: state.trackers[0].id, at: NOW, done: true, values: { n: 1 } };
  const snap2 = await save(db, snap, { ...state, entries: [...state.entries, tap] });
  assert.equal(rowsWritten() - before, 1);
  const before2 = rowsWritten();
  await save(db, snap2, { ...state, entries: [...state.entries, tap] });
  assert.equal(rowsWritten() - before2, 0, 'saving the same state again writes nothing');
});

test('a changed value rewrites only that entry, and keeps its place', async () => {
  const { db } = testDb();
  await openSchema(db);
  const state = personState('casual');
  const snap = await save(db, emptySnapshot(), state);
  const i = 5;
  const edited = { ...state.entries[i], values: { ...state.entries[i].values, edited: 1 } };
  const entries = state.entries.map((e, k) => (k === i ? edited : e));
  await save(db, snap, { ...state, entries });
  const back = await load(db);
  assert.deepEqual(back.state.entries, entries);
});

test('deleting marks rows deleted instead of removing them, and bringing one back restores it', async () => {
  const { db, raw } = testDb();
  await openSchema(db);
  const state = personState('casual');
  const snap = await save(db, emptySnapshot(), state);
  const gone = state.trackers[0];
  const kept = { ...state, trackers: state.trackers.slice(1), entries: state.entries.filter((e) => e.trackerId !== gone.id) };
  const snap2 = await save(db, snap, kept, NOW + 1000);
  assert.equal((await load(db)).state.trackers?.length, state.trackers.length - 1);
  const stillThere = raw.prepare('select count(*) as n from entries where tracker_id = ? and deleted_at is not null').get(gone.id) as { n: number };
  assert.ok(stillThere.n > 0, 'the rows are kept, marked deleted');
  const dirty = raw.prepare('select count(*) as n from trackers where id = ? and dirty = 1 and deleted_at is not null').get(gone.id) as { n: number };
  assert.equal(dirty.n, 1, 'and flagged to be sent');
  await save(db, snap2, state, NOW + 2000); // restored from the trash
  const back = await load(db);
  assert.deepEqual(back.state.trackers, plain(state.trackers));
  assert.deepEqual(back.state.entries, state.entries);
});

test('tracker order is kept, and settings and the rest round-trip', async () => {
  const { db } = testDb();
  await openSchema(db);
  const state = personState('casual');
  const swapped = { ...state, trackers: [state.trackers[1], state.trackers[0], ...state.trackers.slice(2)] };
  const snap = await save(db, emptySnapshot(), state);
  await save(db, snap, { ...swapped, settings: { ...SETTINGS, units: 'imperial' } });
  const back = await load(db);
  assert.deepEqual(back.state.trackers?.map((t) => t.id), swapped.trackers.map((t) => t.id));
  assert.equal(back.state.settings?.units, 'imperial');
});

test('the migration flag is remembered, and wiping removes everything', async () => {
  const { db } = testDb();
  await openSchema(db);
  assert.equal(await isMigrated(db), false);
  await save(db, emptySnapshot(), personState('fresh'));
  await markMigrated(db);
  assert.equal(await isMigrated(db), true);
  await wipe(db);
  assert.equal((await load(db)).state.entries?.length, 0);
  assert.equal(await isMigrated(db), true, 'wiping does not make the old save copy across again');
});

test('the largest example person saves and loads, and a following tap is still one row', async () => {
  const { db, rowsWritten } = testDb();
  await openSchema(db);
  const state = personState('deep');
  const t0 = Date.now();
  const snap = await save(db, emptySnapshot(), state);
  const back = await load(db);
  console.log(`  deep: ${state.entries.length} entries saved and loaded in ${Date.now() - t0} ms`);
  assert.equal(back.state.entries?.length, state.entries.length);
  const before = rowsWritten();
  const tap: Entry = { id: 'x', trackerId: state.trackers[0].id, at: NOW, done: true, values: {} };
  const t1 = Date.now();
  await save(db, snap, { ...state, entries: [...state.entries, tap] });
  console.log(`  deep: one tap saved in ${Date.now() - t1} ms`);
  assert.equal(rowsWritten() - before, 1);
});
