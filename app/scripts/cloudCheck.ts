// @ts-nocheck (a Node-only script: the phone app does not carry Node types)
// Checks the real cloud end to end from Node: anonymous sign-in, sending, a second phone receiving, and that nobody else can read the rows.
// Run: npx tsx scripts/cloudCheck.ts   (uses .env.local; it cleans up the rows it makes)
import { createClient } from '@supabase/supabase-js';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { emptySnapshot, load, openSchema, save, type Db } from '../src/core/persist';
import { buildPersona, PERSONAS } from '../src/core/personas';
import { sync } from '../src/core/sync';
import { supabaseApi } from '../src/core/supabaseApi';
import { emptyState, type Settings } from '../src/core/types';

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const mem: Record<string, string> = {};
const client = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_KEY, {
  auth: { storage: { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } }, persistSession: true, autoRefreshToken: false },
});
function testDb(): Db {
  const raw = new DatabaseSync(':memory:');
  return {
    exec: async (sql) => { raw.exec(sql); },
    all: async <T,>(sql: string, params: unknown[] = []) => raw.prepare(sql).all(...(params as never[])) as T[],
    run: async (sql, params = []) => { raw.prepare(sql).run(...(params as never[])); },
    runMany: async (sql, rows) => { const s = raw.prepare(sql); for (const r of rows) s.run(...(r as never[])); },
    transaction: async (fn) => { raw.exec('begin'); try { await fn(); raw.exec('commit'); } catch (e) { raw.exec('rollback'); throw e; } },
  };
}
(async () => {
  const signed = await client.auth.signInAnonymously();
  if (signed.error) { console.log('SIGN-IN FAILED:', signed.error.message); return; }
  const uid = signed.data.user!.id;
  console.log('signed in anonymously');
  const settings = { units: 'metric', weekStart: 1 } as unknown as Settings;
  const p = buildPersona(PERSONAS.find((x) => x.id === 'casual')!, settings, null, Date.now());
  const state = { ...emptyState, settings, trackers: p.trackers, entries: p.entries, onboarded: true };
  const a = testDb(); await openSchema(a); await save(a, emptySnapshot(), state);
  const t0 = Date.now();
  const r1 = await sync(a, supabaseApi(client), uid);
  console.log('phone A sync:', JSON.stringify(r1), `${Date.now() - t0} ms`);
  const b = testDb(); await openSchema(b);
  const r2 = await sync(b, supabaseApi(client), uid);
  const back = await load(b);
  console.log('phone B sync:', JSON.stringify(r2), 'trackers', back.state.trackers?.length, 'entries', back.state.entries?.length, 'settings units', (back.state.settings as Settings)?.units);
  console.log('match:', back.state.trackers?.length === state.trackers.length && back.state.entries?.length === state.entries.length);
  const again = await sync(a, supabaseApi(client), uid);
  console.log('A again (should be 0/0):', JSON.stringify(again));
  // a stranger with no sign-in cannot read
  const anon = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_KEY);
  const peek = await anon.from('entries').select('id').limit(1);
  console.log('no sign-in can read entries?', peek.error ? `no (${peek.error.code})` : `YES, ${peek.data?.length} rows`);
  // a second anonymous user cannot see the first user's rows
  const other = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_KEY, { auth: { persistSession: false } });
  await other.auth.signInAnonymously();
  const see = await other.from('entries').select('id', { count: 'exact', head: true });
  console.log('another user sees', see.count, 'of the first user\'s entries');
  // clean up the test rows
  await client.from('entries').delete().eq('user_id', uid);
  await client.from('trackers').delete().eq('user_id', uid);
  await client.from('settings').delete().eq('user_id', uid);
  const left = await client.from('entries').select('id', { count: 'exact', head: true });
  console.log('test rows cleaned up; entries left for this user:', left.count);
})().catch((e) => console.log('ERROR', e?.message ?? e));
