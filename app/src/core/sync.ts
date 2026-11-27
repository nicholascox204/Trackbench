// Keeping the phone's database and the cloud copy (docs/supabase-schema.sql) the same. The phone is the source of truth: it sends the rows
// marked dirty, then asks for anything changed in the cloud since it last asked. Where both changed the same row, the later change wins.
//
// This file knows nothing about Supabase itself; it talks to the CloudApi below, so the rules can be tested with a fake one.
import type { Db } from './persist';

export type Table = 'trackers' | 'entries';
export type CloudRow = Record<string, unknown>;
export interface Cursor { at: string; id: string }

export interface CloudApi {
  upsert(table: Table | 'settings', rows: CloudRow[]): Promise<void>;
  // rows changed after the cursor, oldest first (a page of at most limit)
  changedSince(table: Table, after: Cursor | null, limit: number): Promise<CloudRow[]>;
  settings(): Promise<{ data: unknown; updated_at: string } | null>;
}

export interface SyncResult { sent: number; received: number; changedLocal: boolean }

const PAGE = 1000; // the most the service returns at once
const iso = (ms: number): string => new Date(ms).toISOString();
// the server sends microseconds (…12:00:00.123456+00:00); only milliseconds are kept
export const ms = (s: unknown): number => new Date(String(s).replace(/(\.\d{3})\d+/, '$1')).getTime();
// the server writes +00:00; the same instant as Z is what goes back in a filter
export const asZ = (s: string): string => s.replace('+00:00', 'Z');

async function metaGet<T>(db: Db, key: string): Promise<T | null> {
  const r = await db.all<{ value: string }>('select value from kv where key = ?', [key]);
  return r.length ? (JSON.parse(r[0].value) as T) : null;
}
async function metaSet(db: Db, key: string, value: unknown): Promise<void> {
  await db.run('insert or replace into kv (key, value, updated_at, dirty) values (?, ?, ?, 0)', [key, JSON.stringify(value), Date.now()]);
}

interface TrackerRow { id: string; name: string; sort_order: number; config: string; created_at: number; updated_at: number; deleted_at: number | null }
interface EntryRow { id: string; tracker_id: string; at: number; data: string; slot_id: string | null; row_index: number | null; variant: number | null; done: number; auto: string | null; updated_at: number; deleted_at: number | null }

const trackerOut = (userId: string, r: TrackerRow): CloudRow => ({
  user_id: userId, id: r.id, name: r.name, sort_order: r.sort_order, config: JSON.parse(r.config) as unknown,
  created_at: iso(r.created_at), deleted_at: r.deleted_at === null ? null : iso(r.deleted_at),
});
const entryOut = (userId: string, r: EntryRow): CloudRow => ({
  user_id: userId, id: r.id, tracker_id: r.tracker_id, at: iso(r.at), data: JSON.parse(r.data) as unknown, slot_id: r.slot_id, row_index: r.row_index, variant: r.variant,
  done: r.done === 1, auto: r.auto === null ? null : (JSON.parse(r.auto) as string[]), deleted_at: r.deleted_at === null ? null : iso(r.deleted_at),
});

async function pushRows<R extends { id: string; updated_at: number }>(db: Db, cloud: CloudApi, table: Table, userId: string, out: (u: string, r: R) => CloudRow): Promise<number> {
  const rows = await db.all<R>(`select * from ${table} where dirty = 1 order by rowid`);
  for (let i = 0; i < rows.length; i += PAGE) {
    const page = rows.slice(i, i + PAGE);
    await cloud.upsert(table, page.map((r) => out(userId, r)));
    // clean only what has not changed again since it was read
    await db.runMany(`update ${table} set dirty = 0 where id = ? and updated_at = ?`, page.map((r) => [r.id, r.updated_at]));
  }
  return rows.length;
}

// How a cloud row is written into the phone's database. A row is skipped when the phone has a later change of its own waiting to be sent.
const TRACKER_SQL = `insert into trackers (id, name, sort_order, config, created_at, updated_at, deleted_at, dirty) values (?, ?, ?, ?, ?, ?, ?, 0)
     on conflict(id) do update set name = excluded.name, sort_order = excluded.sort_order, config = excluded.config, created_at = excluded.created_at,
     updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, dirty = 0`;
const trackerArgs = (c: CloudRow): unknown[] => [c.id, c.name, c.sort_order, JSON.stringify(c.config), ms(c.created_at), ms(c.updated_at), c.deleted_at ? ms(c.deleted_at) : null];
const ENTRY_SQL = `insert into entries (id, tracker_id, at, data, slot_id, row_index, variant, done, auto, updated_at, deleted_at, dirty) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     on conflict(id) do update set tracker_id = excluded.tracker_id, at = excluded.at, data = excluded.data, slot_id = excluded.slot_id, row_index = excluded.row_index,
     variant = excluded.variant, done = excluded.done, auto = excluded.auto, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, dirty = 0`;
const entryArgs = (c: CloudRow): unknown[] => [c.id, c.tracker_id, ms(c.at), JSON.stringify(c.data ?? {}), c.slot_id ?? null, c.row_index ?? null, c.variant ?? null, c.done === false ? 0 : 1,
  c.auto ? JSON.stringify(c.auto) : null, ms(c.updated_at), c.deleted_at ? ms(c.deleted_at) : null];

// A whole page goes in with one look-up and one batched write, not two database calls per row: a restore of thousands of entries
// takes a second or two instead of half a minute.
async function takePage(db: Db, table: Table, page: CloudRow[]): Promise<number> {
  const waiting = new Map<string, number>();
  const ids = page.map((c) => String(c.id));
  for (let i = 0; i < ids.length; i += 400) { // SQLite allows a limited number of ? per statement
    const part = ids.slice(i, i + 400);
    const rows = await db.all<{ id: string; updated_at: number }>(`select id, updated_at from ${table} where dirty = 1 and id in (${part.map(() => '?').join(',')})`, part);
    for (const r of rows) waiting.set(r.id, r.updated_at);
  }
  const take = page.filter((c) => !(waiting.get(String(c.id))! > ms(c.updated_at)));
  // Many rows per statement: each call across to the database costs far more than the rows it carries.
  const sql = table === 'trackers' ? TRACKER_SQL : ENTRY_SQL;
  const args = table === 'trackers' ? trackerArgs : entryArgs;
  const group = sql.match(/values (\([^)]*\))/)![1];
  for (let i = 0; i < take.length; i += 80) {
    const part = take.slice(i, i + 80);
    await db.run(sql.replace(`values ${group}`, `values ${part.map(() => group).join(', ')}`), part.flatMap(args));
  }
  return take.length;
}

async function pull(db: Db, cloud: CloudApi, table: Table): Promise<{ received: number; changedLocal: boolean }> {
  const key = `cloud-cursor-${table}`;
  let cursor = await metaGet<Cursor>(db, key);
  let received = 0;
  let changedLocal = false;
  for (;;) {
    const page = await cloud.changedSince(table, cursor, PAGE);
    if (page.length === 0) break;
    await db.transaction(async () => {
      if (await takePage(db, table, page)) changedLocal = true;
    });
    received += page.length;
    const last = page[page.length - 1];
    cursor = { at: asZ(String(last.updated_at)), id: String(last.id) };
    await metaSet(db, key, cursor);
    if (page.length < PAGE) break;
  }
  return { received, changedLocal };
}

export async function sync(db: Db, cloud: CloudApi, userId: string, opts: { pull?: boolean } = {}): Promise<SyncResult> {
  let sent = 0;
  sent += await pushRows<TrackerRow>(db, cloud, 'trackers', userId, trackerOut); // trackers first: entries point at them
  sent += await pushRows<EntryRow>(db, cloud, 'entries', userId, entryOut);

  if (opts.pull === false) { // only sending (signing out): settings go up if changed here, nothing comes down
    const m = await db.all<{ value: string; updated_at: number }>("select value, updated_at from kv where key = 'settings' and dirty = 1");
    if (m.length) { await cloud.upsert('settings', [{ user_id: userId, data: JSON.parse(m[0].value) as unknown }]); await db.run("update kv set dirty = 0 where key = 'settings' and updated_at = ?", [m[0].updated_at]); sent++; }
    return { sent, received: 0, changedLocal: false };
  }

  // settings are one row each way
  const mine = await db.all<{ value: string; updated_at: number; dirty: number }>("select value, updated_at, dirty from kv where key = 'settings'");
  let changedLocal = false;
  const theirs = await cloud.settings();
  if (mine.length && mine[0].dirty === 1 && (!theirs || ms(theirs.updated_at) <= mine[0].updated_at)) {
    await cloud.upsert('settings', [{ user_id: userId, data: JSON.parse(mine[0].value) as unknown }]);
    await db.run("update kv set dirty = 0 where key = 'settings' and updated_at = ?", [mine[0].updated_at]);
    sent++;
  } else if (theirs && (!mine.length || (ms(theirs.updated_at) > mine[0].updated_at && mine[0].value !== JSON.stringify(theirs.data))) && !(mine.length && mine[0].dirty === 1)) { // only a real difference counts as a change
    await db.run("insert or replace into kv (key, value, updated_at, dirty) values ('settings', ?, ?, 0)", [JSON.stringify(theirs.data), ms(theirs.updated_at)]);
    changedLocal = true;
  }

  const t = await pull(db, cloud, 'trackers');
  const e = await pull(db, cloud, 'entries');

  // rows deleted everywhere are no longer needed here
  await db.run('delete from entries where deleted_at is not null and dirty = 0');
  await db.run('delete from trackers where deleted_at is not null and dirty = 0');
  return { sent, received: t.received + e.received, changedLocal: changedLocal || t.changedLocal || e.changedLocal };
}
