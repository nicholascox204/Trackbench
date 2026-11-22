// Saving to the phone's own database (SQLite). The app still holds everything in memory and calls setState; this file works out
// what changed since the last save and writes only that, so a tap writes one row instead of rewriting everything.
//
// The tables mirror the cloud ones (docs/supabase-schema.sql): stable ids, updated_at, deleted_at, plus a dirty flag that says
// "not sent to the cloud yet". A row is never removed to delete it; deleted_at is set so the deletion can sync too.
//
// All database access goes through the small Db interface, so the same SQL runs on the phone (expo-sqlite) and in tests (node:sqlite).
import type { AppState, Entry, Tracker } from './types';

export interface Db {
  exec(sql: string): Promise<void>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<void>;
  runMany(sql: string, rows: unknown[][]): Promise<void>; // one statement, many rows
  transaction(fn: () => Promise<void>): Promise<void>;
}

export const SCHEMA = `
create table if not exists trackers (
  id text primary key, name text not null, sort_order integer not null default 0, config text not null,
  created_at integer not null, updated_at integer not null, deleted_at integer, dirty integer not null default 1
);
create table if not exists entries (
  id text primary key, tracker_id text not null, at integer not null, data text not null, slot_id text, row_index integer,
  variant integer, done integer not null default 1, auto text, updated_at integer not null, deleted_at integer, dirty integer not null default 1
);
create index if not exists entries_tracker_time on entries (tracker_id, at);
create table if not exists kv (
  key text primary key, value text not null, updated_at integer not null, dirty integer not null default 1
);
`;

// What the database holds right now, as the app sees it, so the next save can be a difference.
export interface Snapshot {
  trackers: Map<string, { ref: Tracker; json: string; pos: number }>;
  entries: Map<string, Entry>;
  kv: Map<string, unknown>;
}

export const emptySnapshot = (): Snapshot => ({ trackers: new Map(), entries: new Map(), kv: new Map() });

// The parts of the state kept as whole values (they are small, or only ever read whole).
const KV_KEYS = ['systems', 'settings', 'onboarded', 'trash'] as const;

const TRACKER_UPSERT = `insert into trackers (id, name, sort_order, config, created_at, updated_at, deleted_at, dirty) values (?, ?, ?, ?, ?, ?, null, 1)
  on conflict(id) do update set name = excluded.name, sort_order = excluded.sort_order, config = excluded.config, updated_at = excluded.updated_at, deleted_at = null, dirty = 1`;
const ENTRY_UPSERT = `insert into entries (id, tracker_id, at, data, slot_id, row_index, variant, done, auto, updated_at, deleted_at, dirty) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, 1)
  on conflict(id) do update set tracker_id = excluded.tracker_id, at = excluded.at, data = excluded.data, slot_id = excluded.slot_id, row_index = excluded.row_index,
  variant = excluded.variant, done = excluded.done, auto = excluded.auto, updated_at = excluded.updated_at, deleted_at = null, dirty = 1`;
const KV_UPSERT = `insert into kv (key, value, updated_at, dirty) values (?, ?, ?, 1)
  on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at, dirty = 1`;

const entryRow = (e: Entry, now: number): unknown[] => [
  e.id, e.trackerId, e.at, JSON.stringify(e.values ?? {}), e.slotId ?? null, e.row ?? null, e.variant ?? null, e.done ? 1 : 0, e.auto ? JSON.stringify(e.auto) : null, now,
];

export async function openSchema(db: Db): Promise<void> {
  await db.exec(SCHEMA);
}

// Write what differs between the last save (snapshot) and the state now. Returns the new snapshot.
export async function save(db: Db, prev: Snapshot, state: AppState, now: number = Date.now()): Promise<Snapshot> {
  const next = emptySnapshot();

  const trackerRows: unknown[][] = [];
  state.trackers.forEach((t, pos) => {
    const old = prev.trackers.get(t.id);
    if (old && old.ref === t && old.pos === pos) { next.trackers.set(t.id, old); return; }
    const json = JSON.stringify(t);
    next.trackers.set(t.id, { ref: t, json, pos });
    if (old && old.json === json && old.pos === pos) return; // a rebuilt copy of the same tracker is not a change
    trackerRows.push([t.id, t.name, pos, json, t.createdAt, now]);
  });
  const goneTrackers = [...prev.trackers.keys()].filter((id) => !next.trackers.has(id));

  const entryRows: unknown[][] = [];
  for (const e of state.entries) {
    next.entries.set(e.id, e);
    if (prev.entries.get(e.id) !== e) entryRows.push(entryRow(e, now));
  }
  const goneEntries = prev.entries.size === next.entries.size && entryRows.length === 0 ? [] : [...prev.entries.keys()].filter((id) => !next.entries.has(id));

  const kvRows: unknown[][] = [];
  for (const key of KV_KEYS) {
    const v = (state as unknown as Record<string, unknown>)[key];
    next.kv.set(key, v);
    if (prev.kv.get(key) !== v) kvRows.push([key, JSON.stringify(v ?? null), now]);
  }

  if (trackerRows.length + goneTrackers.length + entryRows.length + goneEntries.length + kvRows.length === 0) return next;
  await db.transaction(async () => {
    if (trackerRows.length) await db.runMany(TRACKER_UPSERT, trackerRows);
    if (goneTrackers.length) await db.runMany('update trackers set deleted_at = ?, updated_at = ?, dirty = 1 where id = ?', goneTrackers.map((id) => [now, now, id]));
    if (entryRows.length) await db.runMany(ENTRY_UPSERT, entryRows);
    if (goneEntries.length) await db.runMany('update entries set deleted_at = ?, updated_at = ?, dirty = 1 where id = ?', goneEntries.map((id) => [now, now, id]));
    if (kvRows.length) await db.runMany(KV_UPSERT, kvRows);
  });
  return next;
}

interface TrackerRow { id: string; config: string }
interface EntryRow { id: string; tracker_id: string; at: number; data: string; slot_id: string | null; row_index: number | null; variant: number | null; done: number; auto: string | null }

// Read everything back, in the order it was saved. Also returns the snapshot, so the first save after loading is a difference.
export async function load(db: Db): Promise<{ state: Partial<AppState>; snapshot: Snapshot }> {
  const snapshot = emptySnapshot();
  const trackers: Tracker[] = [];
  const trackerRows = await db.all<TrackerRow>('select id, config from trackers where deleted_at is null order by sort_order, rowid');
  trackerRows.forEach((r, pos) => {
    const t = JSON.parse(r.config) as Tracker;
    trackers.push(t);
    snapshot.trackers.set(t.id, { ref: t, json: r.config, pos });
  });
  const entries: Entry[] = [];
  const entryRows = await db.all<EntryRow>('select id, tracker_id, at, data, slot_id, row_index, variant, done, auto from entries where deleted_at is null order by rowid');
  for (const r of entryRows) {
    const e: Entry = { id: r.id, trackerId: r.tracker_id, at: r.at, done: r.done === 1, values: JSON.parse(r.data) as Entry['values'] };
    if (r.slot_id !== null) e.slotId = r.slot_id;
    if (r.row_index !== null) e.row = r.row_index;
    if (r.variant !== null) e.variant = r.variant;
    if (r.auto !== null) e.auto = JSON.parse(r.auto) as string[];
    entries.push(e);
    snapshot.entries.set(e.id, e);
  }
  const state: Record<string, unknown> = { trackers, entries };
  for (const r of await db.all<{ key: string; value: string }>('select key, value from kv')) {
    if ((KV_KEYS as readonly string[]).includes(r.key)) {
      const v = JSON.parse(r.value) as unknown;
      state[r.key] = v;
      snapshot.kv.set(r.key, v);
    }
  }
  return { state: state as Partial<AppState>, snapshot };
}

// Has the old single-value save been copied across yet?
const MIGRATED = 'migrated-from-async-storage';
export async function isMigrated(db: Db): Promise<boolean> {
  return (await db.all('select 1 from kv where key = ?', [MIGRATED])).length > 0;
}
export async function markMigrated(db: Db, now: number = Date.now()): Promise<void> {
  await db.run('insert or replace into kv (key, value, updated_at, dirty) values (?, ?, ?, 0)', [MIGRATED, '1', now]);
}

// Start over completely (everything is removed, nothing is kept for syncing).
export async function wipe(db: Db): Promise<void> {
  await db.transaction(async () => {
    await db.run('delete from trackers');
    await db.run('delete from entries');
    await db.run("delete from kv where key <> ?", [MIGRATED]);
  });
}
