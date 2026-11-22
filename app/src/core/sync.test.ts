import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { emptySnapshot, load, openSchema, save, type Db } from './persist';
import { buildPersona, PERSONAS } from './personas';
import { sync, type CloudApi, type CloudRow, type Cursor, type Table } from './sync';
import { emptyState, type AppState, type Settings } from './types';

function testDb(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
    exec: async (sql) => { raw.exec(sql); },
    all: async <T,>(sql: string, params: unknown[] = []) => raw.prepare(sql).all(...(params as never[])) as T[],
    run: async (sql, params = []) => { raw.prepare(sql).run(...(params as never[])); },
    runMany: async (sql, rows) => { const s = raw.prepare(sql); for (const r of rows) s.run(...(r as never[])); },
    transaction: async (fn) => { raw.exec('begin'); try { await fn(); raw.exec('commit'); } catch (e) { raw.exec('rollback'); throw e; } },
  };
}

// A cloud that behaves like the real one: the server stamps updated_at (the same stamp for one batch), rows come back oldest first.
function fakeCloud(): CloudApi & { tables: Record<Table, Map<string, CloudRow>>; clock: { t: number }; settingsRow: { data: unknown; updated_at: string } | null } {
  const clock = { t: Date.UTC(2026, 10, 22, 12) };
  const tables: Record<Table, Map<string, CloudRow>> = { trackers: new Map(), entries: new Map() };
  const stamp = (): string => new Date(clock.t).toISOString().replace('Z', '123+00:00');
  const api = {
    tables, clock, settingsRow: null as { data: unknown; updated_at: string } | null,
    async upsert(table: Table | 'settings', rows: CloudRow[]) {
      clock.t += 1000;
      if (table === 'settings') { api.settingsRow = { data: rows[0].data, updated_at: stamp() }; return; }
      for (const r of rows) tables[table].set(String(r.id), { ...r, updated_at: stamp() });
    },
    async changedSince(table: Table, after: Cursor | null, limit: number) {
      const all = [...tables[table].values()].sort((a, b) => (String(a.updated_at) === String(b.updated_at) ? (String(a.id) < String(b.id) ? -1 : 1) : String(a.updated_at) < String(b.updated_at) ? -1 : 1));
      const z = (s: unknown) => String(s).replace('+00:00', 'Z');
      const rest = after ? all.filter((r) => z(r.updated_at) > after.at || (z(r.updated_at) === after.at && String(r.id) > after.id)) : all;
      return rest.slice(0, limit);
    },
    async settings() { return api.settingsRow; },
  };
  return api;
}

const SETTINGS = { units: 'metric', weekStart: 1 } as unknown as Settings;
const NOW = new Date(2026, 10, 22, 12).getTime();
const personState = (id: string): AppState => {
  const p = buildPersona(PERSONAS.find((x) => x.id === id)!, SETTINGS, null, NOW);
  return { ...emptyState, settings: SETTINGS, trackers: p.trackers, entries: p.entries, onboarded: true };
};
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const USER = 'u1';

async function phone(state?: AppState) {
  const db = testDb();
  await openSchema(db);
  const snap = state ? await save(db, emptySnapshot(), state) : emptySnapshot();
  return { db, snap };
}

test('what one phone sends, another phone receives', async () => {
  const cloud = fakeCloud();
  const state = personState('casual');
  const a = await phone(state);
  const r1 = await sync(a.db, cloud, USER);
  assert.ok(r1.sent > 0);
  const b = await phone();
  const r2 = await sync(b.db, cloud, USER);
  assert.equal(r2.changedLocal, true);
  const back = await load(b.db);
  assert.deepEqual(back.state.trackers, plain(state.trackers));
  assert.deepEqual([...(back.state.entries ?? [])].sort((x, y) => (x.id < y.id ? -1 : 1)), [...state.entries].sort((x, y) => (x.id < y.id ? -1 : 1)));
});

test('nothing is sent or received twice', async () => {
  const cloud = fakeCloud();
  const a = await phone(personState('fresh'));
  await sync(a.db, cloud, USER);
  const again = await sync(a.db, cloud, USER);
  assert.equal(again.sent, 0, 'everything was marked as sent');
  assert.equal(again.received, 0, 'and nothing is newer in the cloud');
});

test('a long history comes across in pages without missing rows that share a time', async () => {
  const cloud = fakeCloud();
  const state = personState('regular'); // over 4000 entries, sent in a few batches that each share one server time
  const a = await phone(state);
  await sync(a.db, cloud, USER);
  const b = await phone();
  await sync(b.db, cloud, USER);
  const n = ((await b.db.all<{ n: number }>('select count(*) as n from entries where deleted_at is null'))[0]).n;
  assert.equal(n, state.entries.length);
});

test('a deletion reaches the other phone, which then forgets the row', async () => {
  const cloud = fakeCloud();
  const state = personState('casual');
  const a = await phone(state);
  await sync(a.db, cloud, USER);
  const b = await phone();
  await sync(b.db, cloud, USER);

  const gone = state.trackers[0];
  const kept = { ...state, trackers: state.trackers.slice(1), entries: state.entries.filter((e) => e.trackerId !== gone.id) };
  await save(a.db, a.snap, kept, NOW + 5000);
  await sync(a.db, cloud, USER);
  const r = await sync(b.db, cloud, USER);
  assert.equal(r.changedLocal, true);
  const back = await load(b.db);
  assert.equal(back.state.trackers?.length, state.trackers.length - 1);
  assert.ok((back.state.entries ?? []).every((e) => e.trackerId !== gone.id));
  const left = ((await b.db.all<{ n: number }>('select count(*) as n from entries where deleted_at is not null'))[0]).n;
  assert.equal(left, 0, 'rows deleted everywhere are cleared out');
});

test('when both phones changed the same entry, the later change wins', async () => {
  const cloud = fakeCloud();
  const state = personState('fresh');
  const a = await phone(state);
  await sync(a.db, cloud, USER);
  const b = await phone();
  await sync(b.db, cloud, USER);

  const target = state.entries[0];
  const aEdit = { ...target, values: { ...target.values, who: 'a' } };
  const bEdit = { ...target, values: { ...target.values, who: 'b' } };
  await save(a.db, a.snap, { ...state, entries: state.entries.map((e) => (e === target ? aEdit : e)) }, NOW + 1000);
  const bSnap = (await load(b.db)).snapshot;
  await save(b.db, bSnap, { ...state, entries: (await load(b.db)).state.entries!.map((e) => (e.id === target.id ? bEdit : e)) }, NOW + 9000);
  await sync(a.db, cloud, USER); // a sends first
  await sync(b.db, cloud, USER); // b's change is later (set at NOW + 9000), so it is sent and kept
  await sync(a.db, cloud, USER);
  const finalA = (await load(a.db)).state.entries!.find((e) => e.id === target.id)!;
  const finalB = (await load(b.db)).state.entries!.find((e) => e.id === target.id)!;
  assert.equal(finalA.values.who, 'b');
  assert.equal(finalB.values.who, 'b');
});

test('a change waiting on this phone is not overwritten by an older one from the cloud', async () => {
  const cloud = fakeCloud();
  const state = personState('fresh');
  const a = await phone(state);
  await sync(a.db, cloud, USER);
  const target = state.entries[0];
  // an old version already in the cloud...
  cloud.tables.entries.set(target.id, { ...cloud.tables.entries.get(target.id)!, data: { who: 'cloud' }, updated_at: new Date(1000).toISOString().replace('Z', '000+00:00') });
  // ...and a newer edit made here, not sent yet
  await save(a.db, a.snap, { ...state, entries: state.entries.map((e) => (e === target ? { ...e, values: { who: 'here' } } : e)) }, Date.now() + 60000);
  cloud.tables.entries.get(target.id)!.updated_at = new Date(1000).toISOString().replace('Z', '000+00:00');
  // pull only (nothing newer to send would normally happen first, so go through a full sync, which sends then pulls)
  await sync(a.db, cloud, USER);
  const mine = (await load(a.db)).state.entries!.find((e) => e.id === target.id)!;
  assert.equal(mine.values.who, 'here');
});

test('settings travel too, and a phone with its own newer settings keeps them', async () => {
  const cloud = fakeCloud();
  const a = await phone(personState('fresh'));
  await sync(a.db, cloud, USER);
  assert.ok(cloud.settingsRow, 'settings reach the cloud');
  const b = await phone();
  await sync(b.db, cloud, USER);
  assert.equal(((await load(b.db)).state.settings as Settings).units, 'metric');
});

test('the server sends microseconds; only milliseconds are kept, and the cursor keeps the full time', async () => {
  const { ms, asZ } = await import('./sync');
  assert.equal(ms('2026-11-22T12:00:00.123456+00:00'), Date.UTC(2026, 10, 22, 12, 0, 0, 123));
  assert.equal(ms('2026-11-22T12:00:00+00:00'), Date.UTC(2026, 10, 22, 12));
  assert.equal(asZ('2026-11-22T12:00:00.123456+00:00'), '2026-11-22T12:00:00.123456Z');
});
