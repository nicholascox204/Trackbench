// Local-first store: state lives in memory and is saved to the phone's own database (SQLite) as it changes, one row at a time (see persist.ts).
// Logging never waits on a network. Backend and sync come later for social features.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { uniqueName, uniqueNames } from './names';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { nickGym, nickNutrition, nickWeight } from '../fixtures/nick';
import { Derived, dayResult, derive, entriesOnDay } from './derive';
import { applyIntensity, defaultConfig, hash01 } from './engine';
import { iconFromEmoji } from './icons';
import { emit } from './events';
import { withHistory } from './history';
import { dayKeyOf, emptyPlanDays, planFor, previousRow, stripRest, syncSame, versionFor } from './plan';
import { normalizeSchedule, scheduleOf, weekdaysOf } from './schedule';
import { getPreset } from './presets';
import { withDailyGoal, withoutDailyGoal } from './goals';
import { defaultAlerts } from './motivation';
import { buildPersona, PERSONAS } from './personas';
import { sync } from './sync';
import { emptySnapshot, isMigrated, load, markMigrated, openSchema, save, wipe, type Db, type Snapshot } from './persist';
import { refreshPatch } from './presetRefresh';
import { answersFromPreset, draftFromAnswers } from './setup';
import { upgradeReadingMinutes, upgradeSleepHours } from './duration';
import { changeTotal } from './tapTotal';
import { addDays, startOfDay } from './time';
import { applyRow } from './rows';
import { SETS_TERMS } from './terms';
import { dropFromTrash, moveToTrash, restoreFromTrash } from './trash';
import type { Backup } from './transfer';
import {
  AlertSettings, Appearance, AppState, CustomRule, Entry, GoalDef, Intensity, PlanDay, Quest, Settings, System, SystemConfig, Tracker, TrackerDraft, UnitSystem,
  defaultAppearance, emptyState,
} from './types';
import { detectUnits, round2 } from './units';

const STORAGE_KEY = 'sandbox.state.v3';
const HALF_DAY = 12 * 60 * 60 * 1000;

let state: AppState = emptyState;
let loaded = false;
const listeners = new Set<() => void>();

// The database, and what it holds as of the last save. Without a database (it could not open) saving falls back to the old single value.
let db: Db | null = null;
let snap: Snapshot = emptySnapshot();
let saving: Promise<void> = Promise.resolve();
let saveQueued = false;

// Save what changed, soon. Changes that arrive while a save runs are picked up by the next one; a failed save is retried with the next change.
function scheduleSave(): void {
  if (!db || saveQueued) return;
  saveQueued = true;
  saving = saving.then(async () => {
    saveQueued = false;
    if (!db) return;
    try {
      snap = await save(db, snap, state);
    } catch {
      // Saving can fail (full storage). Keep running in memory.
    }
  });
}

let version = 0; // counts every change made through setState, so a sync can tell whether the app changed while it worked
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;
let current: Promise<void> | null = null; // the sync running now, so a caller can wait for it

// Send and fetch changes a few seconds after the last one, so a burst of taps is one sync.
function queueSync(): void {
  if (!db || !state.settings.cloudSync || syncTimer) return;
  syncTimer = setTimeout(() => { syncTimer = null; void syncNow(); }, 4000);
}

// Back up to the cloud and take in changes from other devices. Nothing here blocks logging.
export function syncNow(opts?: { pull?: boolean }): Promise<void> {
  if (syncing && current) return current;
  current = runSync(opts?.pull ?? true);
  return current;
}

async function runSync(pull: boolean): Promise<void> {
  if (!db || syncing || !state.settings.cloudSync) return;
  const cloud = await import('./cloud');
  if (!cloud.cloudConfigured) return;
  syncing = true;
  const startedAt = version;
  cloud.setCloudStatus({ phase: 'syncing' });
  try {
    scheduleSave();
    await saving; // what is waiting to be written goes first
    const userId = await cloud.signedInUserId();
    mark('session');
    const res = await sync(db, cloud.supabaseApi(cloud.cloudClient()), userId, { pull, mark });
    if (res.changedLocal) {
      // another device changed something: bring it into what is on screen (anything changed meanwhile is saved first, and the load is repeated if the app changed again)
      for (let tries = 0; tries < 3; tries++) {
        scheduleSave();
        await saving;
        const seen = version;
        const r = await load(db);
        if (seen !== version) continue;
        mark('read back');
        state = fromStored(r.state);
        snap = r.snapshot;
        listeners.forEach((l) => l());
        mark('show');
        break;
      }
    }
    cloud.setCloudStatus({ phase: 'idle', at: Date.now(), sent: res.sent, received: res.received });
  } catch (e) {
    cloud.setCloudStatus({ phase: 'error', message: cloud.friendlyError(e) });
  } finally {
    syncing = false;
    if (version !== startedAt && state.settings.cloudSync) void syncNow(); // something changed while this ran: send that too
  }
}

// The app is being left: send what is waiting now, without the usual pause (the app may not get another chance to run).
export function flushOnLeave(): void {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  scheduleSave();
  void syncNow();
}

// ---------- the account ----------

// Testing only: use the app without an account (nothing is backed up).
export function skipSignIn(): void {
  setState({ ...state, settings: { ...state.settings, skippedSignIn: true } });
}

// Not signed in (skipped, or the account was signed out): show the sign-in screen again.
export function askToSignIn(): void {
  setState({ ...state, settings: { ...state.settings, skippedSignIn: false } });
}

// Signing in and bringing an account's trackers down. While pending, the app holds still on the restore screen, so an
// account with trackers never lands on the empty "make a tracker" screen. The pending mark is kept on this phone only
// (never in settings, which travel to the account), so closing the app midway picks up where it left off. A restore
// that cannot finish says so, rather than waiting forever.
export type RestorePhase = 'off' | 'busy' | 'failed';
const PENDING_KEY = 'trackbench.restorePending';
let pending = false;
let restorePhase: RestorePhase = 'off';
function setPending(on: boolean): void {
  pending = on;
  listeners.forEach((l) => l());
  void (on ? AsyncStorage.setItem(PENDING_KEY, '1') : AsyncStorage.removeItem(PENDING_KEY)).catch(() => {});
}
export const getRestorePhase = (): RestorePhase => (pending ? (restorePhase === 'off' ? 'busy' : restorePhase) : 'off');
export const isRestoring = (): boolean => pending;
// For screens: redraws whenever the restore starts, moves on or ends. (The main app state does not change when it does,
// so watching that alone left the spinner up after the trackers were in.)
export function useRestorePhase(): RestorePhase { return useSyncExternalStore(subscribe, getRestorePhase); }
const RESTORE_LIMIT = 30000;
// How long the last restore took, step by step, shown in Settings so a slow one can be pinned down on the phone itself.
let restoreTiming = '';
export const getRestoreTiming = (): string => restoreTiming;
let timer: { start: number; last: number; steps: string[] } | null = null;
function mark(step: string): void {
  if (!timer) return;
  const now = Date.now();
  timer.steps.push(`${step} ${((now - timer.last) / 1000).toFixed(1)}s`);
  timer.last = now;
}

// About to sign in: hold from here, so nothing flashes once the account is in.
export function beginSignIn(): void { restorePhase = 'busy'; setPending(true); }
// Sign-in did not happen (cancelled, wrong password): let go of the hold.
export function cancelSignIn(): void { restorePhase = 'off'; setPending(false); }

// Signed in: what the account holds comes down. The account's settings win over this phone's: after a sign-out the phone
// holds only blank ones, which must never be sent up over the real ones.
export async function restoreAccount(): Promise<void> {
  if (restoreRun) return restoreRun;
  restorePhase = 'busy';
  setPending(true);
  restoreRun = (async () => {
    const t0 = Date.now();
    timer = { start: t0, last: t0, steps: [] };
    const cloud = await import('./cloud');
    try {
      if (current) await Promise.race([current, wait(RESTORE_LIMIT)]); // a sync from before signing in finishes first
      syncing = false; current = null;
      mark('wait');
      setState({ ...state, settings: { ...state.settings, cloudSync: true, skippedSignIn: false } });
      if (db) { await saving; await db.run("update kv set dirty = 0, updated_at = 0 where key = 'settings'"); }
      mark('prepare');
      const done = await Promise.race([syncNow().then(() => true), wait(RESTORE_LIMIT).then(() => false)]);
      if (!done || cloud.getCloudStatus().phase === 'error') throw new Error('restore');
      // Always finish by showing exactly what is now on the phone. The sync's own reload gives up when the app changes
      // meanwhile (signing in sets settings), which left the trackers saved but not shown, so the app opened on setup.
      if (db) {
        scheduleSave();
        await saving;
        const r = await load(db);
        state = fromStored(r.state);
        snap = r.snapshot;
        version++;
        listeners.forEach((l) => l());
        mark('show');
      }
      restorePhase = 'off';
      if (timer) restoreTiming = `${((Date.now() - timer.start) / 1000).toFixed(1)}s in all: ${timer.steps.join(', ')}`;
      console.log('[restore]', restoreTiming);
      timer = null;
      setPending(false);
    } catch {
      if (timer) restoreTiming = `failed after ${((Date.now() - timer.start) / 1000).toFixed(1)}s: ${timer.steps.join(', ')}`;
      timer = null;
      restorePhase = 'failed';
      listeners.forEach((l) => l());
    } finally {
      restoreRun = null;
    }
  })();
  return restoreRun;
}
let restoreRun: Promise<void> | null = null;
// The app opened signed in with a restore left unfinished (closed midway): start it again. Not after it failed; that waits for Try again.
export const restoreNeedsStart = (): boolean => pending && !restoreRun && restorePhase !== 'failed';
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Any trackers or entries on this phone not yet in the account? Settings do not count: they change all the time (the
// tracker last opened) and losing the last few seconds of them loses nothing that matters.
async function hasUnsent(): Promise<boolean> {
  if (!db) return false;
  await saving;
  const r = await db.all<{ n: number }>('select (select count(*) from trackers where dirty = 1) + (select count(*) from entries where dirty = 1) as n');
  return (r[0]?.n ?? 0) > 0;
}

// Leave the account on this phone: signed out here (no wait on the network), the phone cleared, keeping what belongs to
// the phone rather than the account (the look, units, having seen the welcome).
async function leaveAccount(): Promise<void> {
  const auth = await import('./auth');
  const keep = { appearance: state.settings.appearance, units: state.settings.units, welcomed: state.settings.welcomed };
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  await auth.signOutLocal();
  await resetAll();
  setState({ ...state, settings: { ...state.settings, ...keep, cloudSync: false } });
}

// Sign out. A last send goes first (quick: usually only settings are waiting), then the phone is cleared; it all comes
// back on signing in again. Backing up is automatic, so this stops only when trackers or entries made here would really
// be lost: changes made offline that cannot reach the account yet.
export async function signOutSafely(): Promise<string | null> {
  if (current) await Promise.race([current, wait(10000)]);
  syncing = false; current = null;
  await Promise.race([syncNow({ pull: false }), wait(10000)]);
  if (await hasUnsent()) return 'Some changes made on this phone have not reached your account yet. Connect to the internet, then sign out.';
  await leaveAccount();
  return null;
}

// Give up on a restore that will not finish: back to sign-in.
export async function abandonRestore(): Promise<void> {
  restorePhase = 'off';
  setPending(false);
  await leaveAccount();
}

// Delete the account and everything under it, in the cloud and on this phone.
export async function deleteMyAccount(): Promise<string | null> {
  const auth = await import('./auth');
  try {
    await auth.deleteAccountNow();
  } catch {
    return 'The account could not be deleted right now. Check the connection and try again.';
  }
  await resetAll();
  return null;
}

export function setCloudSync(on: boolean): void {
  setState({ ...state, settings: { ...state.settings, cloudSync: on } });
  if (on) void syncNow();
}

function setState(next: AppState) {
  state = next;
  version++;
  listeners.forEach((l) => l());
  queueSync();
  if (db) { scheduleSave(); return; }
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {
    // Saving can fail (full storage). Keep running in memory.
  });
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function getState(): AppState {
  return state;
}

// Trackers saved by earlier versions get the same explicit settings new ones are built with, so editing them
// in the builder keeps behaving the same: wording, readings, icons.
function upgradeTracker(t: Tracker): Tracker {
  const latestOf = new Set(t.measures.filter((m) => m.calc.op === 'latest').map((m) => (m.calc as { field: string }).field));
  const legacyRest = (t.tools as { rest?: boolean }).rest; // the countdown's first name
  const { rest: _rest, timerStart: _ts, timerStop: _tp, ...tools } = t.tools as Tracker['tools'] & { rest?: boolean; timerStart?: string; timerStop?: string }; // the timer once carried its own words; it no longer does
  return {
    ...t,
    tools: legacyRest ? { ...tools, countdown: true } : tools,
    plan: (t.plan ?? []).map((v) => ({ ...v, days: stripRest(v.days) })), // rest days were dropped; the flag and the "Rest" label go
    ...(t.input === 'plan' && !t.terms && t.measures.some((m) => m.id === 'sets') ? { terms: SETS_TERMS } : {}),
    fields: t.fields.map((f) => (f.type === 'number' && f.reading === undefined && latestOf.has(f.id) ? { ...f, reading: true } : f)),
    icon: t.icon ?? iconFromEmoji((t as { emoji?: string }).emoji),
  };
}

// What was saved, brought up to date with how the app builds things now.
function fromStored(p: Partial<AppState>): AppState {
  const s: AppState = {
    // Older saves stored an emoji; give those trackers an icon instead.
    // The tile-builder experiment was dropped; its trackers have nothing left to draw them.
    trackers: (p.trackers ?? []).filter((t) => (t.input as string) !== 'grid').map(upgradeTracker),
    entries: (p.entries ?? []).filter((e) => !(p.trackers ?? []).some((t) => (t.input as string) === 'grid' && t.id === e.trackerId)),
    systems: p.systems ?? [],
    settings: {
      ...emptyState.settings,
      ...(p.settings ?? {}),
      // Merge in new appearance options; the old Mono theme became OLED.
      appearance: (() => {
        const a = { ...defaultAppearance, ...(p.settings?.appearance ?? {}) };
        return (a.theme as string) === 'mono' ? { ...a, theme: 'oled' as const } : a;
      })(),
    },
    onboarded: p.onboarded ?? false,
    trash: p.trash ?? [],
  };
  const up = upgradeSleepHours(s.trackers, s.entries); // Sleep used to be hours, Reading plain minutes
  return { ...s, trackers: upgradeReadingMinutes(up.trackers), entries: up.entries };
}

export async function loadState(): Promise<void> {
  try { pending = (await AsyncStorage.getItem(PENDING_KEY)) === '1'; } catch { /* no mark */ }
  let migrating = false; // data from the old single-value save is copied into the database once
  try {
    let p: Partial<AppState> | undefined;
    try {
      const { openPhoneDb } = await import('./sqliteDb');
      const opened = await openPhoneDb();
      await openSchema(opened);
      if (await isMigrated(opened)) {
        const r = await load(opened);
        p = r.state;
        snap = r.snapshot;
      } else {
        const old = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null); // too big to read counts as nothing to copy
        p = old ? (JSON.parse(old) as Partial<AppState>) : undefined;
        migrating = true;
      }
      db = opened;
    } catch {
      db = null; // no usable database: keep the old way of saving
      const old = await AsyncStorage.getItem(STORAGE_KEY);
      p = old ? (JSON.parse(old) as Partial<AppState>) : undefined;
      migrating = false;
    }
    if (p) state = fromStored(p);
  } catch {
    // Corrupt storage: start fresh rather than crash.
  }
  if (!state.onboarded && state.trackers.length === 0 && !state.settings.welcomed) state = { ...state, settings: { ...state.settings, units: detectUnits() } }; // a fresh start uses the region's units
  if (db) {
    // what was upgraded on the way in is saved, and the first time the old save is copied across
    try {
      snap = await save(db, snap, state);
      if (migrating) await markMigrated(db);
    } catch {
      // the next change retries
    }
  }
  loaded = true;
  listeners.forEach((l) => l());
}

// ---------- settings ----------

export function setUnits(units: UnitSystem): void {
  setState({ ...state, settings: { ...state.settings, units } });
}

// Testing aid: rebuild every tracker that came from a template using the template as it is now.
export function applyPresetChanges(): number {
  let n = 0;
  const trackers = state.trackers.map((t) => { const p = refreshPatch(t, state.settings); if (!p) return t; n++; return { ...t, ...p }; });
  if (n > 0) setState({ ...state, trackers });
  return n;
}

export function setDevSync(on: boolean): void {
  setState({ ...state, settings: { ...state.settings, devSync: on } });
  if (on) applyPresetChanges();
}

export function setOpenOn(openOn: NonNullable<Settings['openOn']>): void {
  setState({ ...state, settings: { ...state.settings, openOn } });
}

// Remember the tracker you are on, so a quick reopen can go back to it.
export function noteTrackerOpened(id: string): void {
  if (state.settings.lastTracker?.id === id && Date.now() - state.settings.lastTracker.at < 60000) return; // no need to save on every tap
  setState({ ...state, settings: { ...state.settings, lastTracker: { id, at: Date.now() } } });
}

export function setWeekStart(weekStart: 'mon' | 'sun'): void {
  setState({ ...state, settings: { ...state.settings, weekStart } });
}

// The opening screen: what to call you. The look is saved as it is chosen, so this only records the name.
export function finishWelcome(name: string): void {
  setState({ ...state, settings: { ...state.settings, name: name.trim(), welcomed: true } });
}

export function setName(name: string): void {
  setState({ ...state, settings: { ...state.settings, name: name.trim() } });
}

// ---------- quests (goals that belong to the system) ----------

// A quest belongs to one game: the one that already holds it, else the one named, else the default.
export function saveQuest(quest: Quest, systemId?: string): void {
  const sys = state.systems.find((x) => (x.quests ?? []).some((q) => q.id === quest.id)) ?? state.systems.find((x) => x.id === systemId) ?? state.systems[0];
  if (!sys) return;
  const rest = (sys.quests ?? []).filter((q) => q.id !== quest.id);
  setState({ ...state, systems: state.systems.map((x) => (x.id === sys.id ? { ...x, quests: [...rest, quest] } : x)) });
}

export function removeQuest(questId: string): void {
  setState({ ...state, systems: state.systems.map((x) => ((x.quests ?? []).some((q) => q.id === questId) ? { ...x, quests: (x.quests ?? []).filter((q) => q.id !== questId) } : x)) });
}

// ---------- games (each is a set of rules for the trackers that are in it) ----------

export function addGame(name: string, config: SystemConfig): string {
  const system: System = { id: makeId(), name: name.trim() || 'Another game', config, createdAt: Date.now() };
  setState({ ...state, systems: [...state.systems, system] });
  return system.id;
}

export function renameGame(systemId: string, name: string): void {
  if (!name.trim()) return;
  setState({ ...state, systems: state.systems.map((x) => (x.id === systemId ? { ...x, name: name.trim() } : x)) });
}

// Its trackers go to the default game (or to none when it was the only one).
export function removeGame(systemId: string): void {
  const rest = state.systems.filter((x) => x.id !== systemId);
  const fallback = rest[0]?.id ?? null;
  setState({ ...state, systems: rest, trackers: state.trackers.map((t) => (t.systemId === systemId ? { ...t, systemId: fallback } : t)) });
}

// Which game a tracker is in; null leaves it out of every game (a plain log).
export function setTrackerGame(trackerId: string, systemId: string | null): void {
  setState({ ...state, trackers: state.trackers.map((t) => (t.id === trackerId ? { ...t, systemId } : t)) });
}

export function setAlerts(patch: Partial<AlertSettings>): void {
  const cur = state.settings.alerts ?? defaultAlerts();
  setState({ ...state, settings: { ...state.settings, alerts: { ...cur, ...patch } } });
}

// ---------- goals ----------

export function saveGoal(trackerId: string, goal: GoalDef): void {
  setState({
    ...state,
    trackers: state.trackers.map((t) => {
      if (t.id !== trackerId) return t;
      const rest = (t.goals ?? []).filter((g) => g.id !== goal.id);
      return { ...t, goals: [...rest, goal] };
    }),
  });
}

// A daily goal is one of the tracker's daily targets (see core/goals.ts); these keep the daily rule consistent.
export function saveDailyGoal(trackerId: string, goal: GoalDef): void {
  setState({ ...state, trackers: state.trackers.map((t) => (t.id === trackerId ? { ...t, ...withDailyGoal(t, goal) } : t)) });
}

export function removeDailyGoal(trackerId: string, goalId: string): void {
  setState({ ...state, trackers: state.trackers.map((t) => (t.id === trackerId ? { ...t, ...withoutDailyGoal(t, goalId) } : t)) });
}

export function removeGoal(trackerId: string, goalId: string): void {
  setState({ ...state, trackers: state.trackers.map((t) => (t.id === trackerId ? { ...t, goals: (t.goals ?? []).filter((g) => g.id !== goalId) } : t)) });
}

export function setAppearance(patch: Partial<Appearance>): void {
  const cur = state.settings.appearance ?? defaultAppearance;
  setState({ ...state, settings: { ...state.settings, appearance: { ...cur, ...patch } } });
}

// Create the system with a chosen config and put every existing tracker in it.
export function createSystemWithConfig(config: SystemConfig): void {
  if (state.systems.length > 0) return;
  const system: System = { id: makeId(), name: 'Motivation', config, createdAt: Date.now() };
  setState({ ...state, systems: [system], trackers: state.trackers.map((t) => ({ ...t, systemId: system.id })) });
}

// ---------- trackers ----------

function build(draft: TrackerDraft, systemId: string | null, createdAt = Date.now()): Tracker {
  return { ...draft, id: makeId(), systemId, createdAt };
}

export function addTrackerDraft(draft: TrackerDraft): string {
  const t = build({ ...draft, name: uniqueName(draft.name, state.trackers.map((x) => x.name)) }, state.systems[0]?.id ?? null);
  setState({ ...state, trackers: [...state.trackers, t] });
  emit({ type: 'tracker.added', trackerId: t.id });
  return t.id;
}

export function addTrackerFromPreset(presetId: string): string | null {
  return getPreset(presetId) ? addTrackerDraft(draftFromAnswers(answersFromPreset(presetId), state.settings)) : null;
}

export function completeOnboarding(presetIds: string[], useSystem: boolean, config: SystemConfig): void {
  const now = Date.now();
  const system: System | null = useSystem ? { id: makeId(), name: 'Motivation', config, createdAt: now } : null;
  const trackers: Tracker[] = [];
  for (const id of presetIds) {
    const preset = getPreset(id);
    if (preset) trackers.push(build(draftFromAnswers(answersFromPreset(id), state.settings), system?.id ?? null, now));
  }
  setState({ ...state, trackers, entries: [], systems: system ? [system] : [], onboarded: true });
}

export function updateTracker(trackerId: string, patch: Partial<Tracker>): void {
  setState({ ...state, trackers: state.trackers.map((t) => (t.id === trackerId ? { ...t, ...patch } : t)) });
}

// Put a tracker at a given place in the bottom bar.
export function moveTrackerTo(trackerId: string, index: number): void {
  const i = state.trackers.findIndex((t) => t.id === trackerId);
  if (i < 0 || index < 0 || index >= state.trackers.length || i === index) return;
  const next = [...state.trackers];
  const [t] = next.splice(i, 1);
  next.splice(index, 0, t);
  setState({ ...state, trackers: next });
}

// Move a tracker one place left (-1) or right (1) in the bottom bar.
export function moveTracker(trackerId: string, delta: -1 | 1): void {
  const i = state.trackers.findIndex((t) => t.id === trackerId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.trackers.length) return;
  const next = [...state.trackers];
  [next[i], next[j]] = [next[j], next[i]];
  setState({ ...state, trackers: next });
}

// Bring back one of the last few deleted trackers, with its entries.
export function restoreTracker(trashId: string): void {
  const item = (state.trash ?? []).find((d) => d.id === trashId);
  if (!item) return;
  setState(restoreFromTrash(state, trashId));
  emit({ type: 'tracker.added', trackerId: item.tracker.id });
}

// Delete one of them for good.
export function forgetDeleted(trashId: string): void {
  setState(dropFromTrash(state, trashId));
}

export function removeTracker(trackerId: string): void {
  setState(moveToTrash(state, trackerId, Date.now()));
  emit({ type: 'tracker.removed', trackerId });
}

// Saves the plan as a new version effective today (replacing one made today). The "same every day"
// setting carries over unless a new value is given.
export function savePlanDays(trackerId: string, days: PlanDay[], same?: boolean): void {
  const from = dayKeyOf(Date.now());
  setState({
    ...state,
    trackers: state.trackers.map((t) => {
      if (t.id !== trackerId) return t;
      const keep = same ?? !!versionFor(t.plan, Date.now())?.same;
      const turns = !!versionFor(t.plan, Date.now())?.rotation;
      const others = t.plan.filter((v) => v.from !== from);
      return { ...t, plan: [...others, { from, days, ...(keep ? { same: true } : {}), ...(turns ? { rotation: true } : {}) }].sort((a, b) => (a.from < b.from ? -1 : 1)) };
    }),
  });
}

// Lists to pick from, made and removed on the tracker. Like every plan change they apply from today; past days keep theirs.
export function addList(trackerId: string, name: string): number {
  const t = state.trackers.find((x) => x.id === trackerId);
  const v = t ? versionFor(t.plan, Date.now()) : null;
  if (!t || !v) return 0;
  savePlanDays(trackerId, [...JSON.parse(JSON.stringify(v.days)), { label: name.trim(), slots: [] }]);
  return v.days.length;
}
export function removeList(trackerId: string, index: number): void {
  const t = state.trackers.find((x) => x.id === trackerId);
  const v = t ? versionFor(t.plan, Date.now()) : null;
  if (!t || !v) return;
  savePlanDays(trackerId, JSON.parse(JSON.stringify(v.days)).filter((_: unknown, i: number) => i !== index));
  updateTracker(trackerId, { rotationPick: undefined });
}

// Create a tracker from the setup flow, or update one when editing.
// Add options to a choice field as it is now (a past day may show an older setup, which is never written back).
export function addFieldOptions(trackerId: string, fieldId: string, options: string[]): void {
  setState({ ...state, trackers: state.trackers.map((t) => (t.id === trackerId ? { ...t, fields: t.fields.map((f) => (f.id === fieldId ? { ...f, options } : f)) } : t)) });
}

export function saveSetup(raw: TrackerDraft, inSystem: boolean, existingId?: string): string {
  // Names, options and wording are saved without stray spaces.
  const draft: TrackerDraft = {
    ...raw, name: raw.name.trim(),
    fields: raw.fields.map((f) => ({ ...tidyName(f), ...(f.options ? { options: f.options.map((o) => o.trim()).filter(Boolean) } : {}), ...(f.unit ? { unit: f.unit.trim() } : {}) })),
    ...(raw.terms ? { terms: Object.fromEntries(Object.entries(raw.terms).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) } : {}),
  };
  const sysId = state.systems[0]?.id ?? null;
  if (existingId) {
    const before = state.trackers.find((x) => x.id === existingId);
    if (before) setState({ ...state, trackers: state.trackers.map((x) => (x.id === existingId ? withHistory(before, { ...x, ...draft, systemId: inSystem ? sysId : null }) : x)) });
    return existingId;
  }
  const t = build(draft, inSystem ? sysId : null);
  setState({ ...state, trackers: [...state.trackers, t] });
  emit({ type: 'tracker.added', trackerId: t.id });
  return t.id;
}

// Change one weekday of the plan from today on (past days keep the plan they had).
// When the tracker uses the same list every day, the change is copied to every training day.
export function mutatePlanDay(trackerId: string, weekday: number, fn: (d: PlanDay) => void): void {
  const t = state.trackers.find((x) => x.id === trackerId);
  if (!t) return;
  const v = versionFor(t.plan, Date.now());
  const days = JSON.parse(JSON.stringify(v?.days ?? emptyPlanDays())) as PlanDay[];
  fn(days[weekday]);
  if (v?.same) syncSame(days, weekday, weekdaysOf(scheduleOf(t))); // one shared list: the edit goes to every scheduled day
  savePlanDays(trackerId, days);
}

// ---------- entries ----------

function atFor(day: number): number {
  return day === startOfDay(Date.now()) ? Date.now() : day + HALF_DAY;
}

// One reading a day: save over today's entry if there is one, otherwise add it.
// Typed text is saved without the spaces around it (phones add one after a word); it is only trimmed when saved, never while typing.
const tidy = (v: Entry['values']): Entry['values'] => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? x.trim() : x]));
const tidyName = <T extends { name: string }>(x: T): T => ({ ...x, name: x.name.trim() });

export function saveDaily(trackerId: string, raw: Entry['values'], day: number = startOfDay(Date.now())): void {
  const values = tidy(raw);
  const existing = state.entries.find((e) => e.trackerId === trackerId && e.done && startOfDay(e.at) === day);
  if (!existing) return logFree(trackerId, values, day);
  setState({ ...state, entries: state.entries.map((e) => (e.id === existing.id ? { ...e, values: { ...e.values, ...values } } : e)) });
}

// Entries brought in from a file (an import), added in one go.
export function addEntries(entries: Entry[]): void {
  if (entries.length === 0) return;
  setState({ ...state, entries: [...state.entries, ...entries] });
}

export function newEntryId(): string { return makeId(); }

export function logFree(trackerId: string, raw: Entry['values'] = {}, day: number = startOfDay(Date.now())): void {
  const values = tidy(raw);
  const entry: Entry = { id: makeId(), trackerId, at: atFor(day), done: true, values };
  setState({ ...state, entries: [...state.entries, entry] });
  emit({ type: 'entry.logged', entry });
}

// Set a counter's total for a day by typing it: new taps are added, or the newest come off (see tapTotal.ts).
export function setTapTotal(trackerId: string, day: number, target: number, amounts: boolean): void {
  const mine = entriesOnDay(state.entries, trackerId, day).filter((e) => e.done);
  const c = changeTotal(mine, target, amounts);
  if (!c.remove.length && !c.shrink.length && !c.add.length) return;
  const drop = new Set(c.remove);
  const shrunk = new Map(c.shrink.map((x) => [x.id, x.n] as const));
  const kept = state.entries.filter((e) => !drop.has(e.id)).map((e) => (shrunk.has(e.id) ? { ...e, values: { ...e.values, n: shrunk.get(e.id) as number } } : e));
  const added: Entry[] = c.add.map((n) => ({ id: makeId(), trackerId, at: atFor(day), done: true, values: (amounts ? { n } : {}) as Entry['values'] }));
  setState({ ...state, entries: [...kept, ...added] });
  for (const entry of added) emit({ type: 'entry.logged', entry });
}

// Change what an entry holds (its day and time stay).
export function updateEntry(entryId: string, values: Entry['values']): void {
  setState({ ...state, entries: state.entries.map((e) => (e.id === entryId ? { ...e, values } : e)) });
}

export function deleteEntry(entryId: string): void {
  const entry = state.entries.find((e) => e.id === entryId);
  if (!entry) return;
  setState({ ...state, entries: state.entries.filter((e) => e.id !== entryId) });
  emit({ type: 'entry.removed', entry });
}

export function undoLast(trackerId: string, day: number = startOfDay(Date.now())): void {
  const mine = entriesOnDay(state.entries, trackerId, day).filter((e) => e.done);
  const last = mine[mine.length - 1];
  if (last) deleteEntry(last.id);
}

// Set a row of a row slot: typed values and/or the done tick. Ticking done fills
// missing numbers from last time (when the tracker shows previous numbers), then defaults.
export function setRow(
  trackerId: string, day: number, slotId: string, row: number,
  patch: { values?: Entry['values']; done?: boolean },
): void {
  const t = state.trackers.find((x) => x.id === trackerId);
  if (!t) return;
  const mine = state.entries.filter((e) => e.trackerId === trackerId);
  const existing = mine.find((e) => e.slotId === slotId && e.row === row && startOfDay(e.at) === day);
  const prev = patch.done === true && t.tools.previous ? previousRow(mine, slotId, row, day) : null;
  const { values, done, auto } = applyRow(existing, patch, { fields: t.fields, prev });
  const autoField = auto.length > 0 ? auto : undefined;
  if (existing) {
    setState({ ...state, entries: state.entries.map((e) => (e.id === existing.id ? { ...e, values, done, auto: autoField } : e)) });
  } else {
    const entry: Entry = { id: makeId(), trackerId, at: atFor(day), slotId, row, done, values, ...(autoField ? { auto: autoField } : {}) };
    setState({ ...state, entries: [...state.entries, entry] });
  }
  const after = state.entries.find((e) => e.trackerId === trackerId && e.slotId === slotId && e.row === row && startOfDay(e.at) === day);
  if (after && done && patch.done === true) emit({ type: 'entry.logged', entry: after });
}

// Tick an item slot (like a food). With variants, choosing another variant switches;
// choosing the same one again unticks.
export function toggleItem(trackerId: string, day: number, slotId: string, variant?: number): void {
  const t = state.trackers.find((x) => x.id === trackerId);
  if (!t) return;
  const slot = planFor(t, day)?.slots.find((s) => s.id === slotId);
  if (!slot) return;
  const existing = state.entries.find(
    (e) => e.trackerId === trackerId && e.slotId === slotId && e.row === undefined && startOfDay(e.at) === day,
  );
  const values = (variant !== undefined && slot.variants?.[variant] ? slot.variants[variant].values : slot.values) ?? {};
  if (existing && existing.done) {
    if (variant !== undefined && existing.variant !== variant) {
      setState({ ...state, entries: state.entries.map((e) => (e.id === existing.id ? { ...e, variant, values } : e)) });
      return;
    }
    deleteEntry(existing.id);
    return;
  }
  const entry: Entry = { id: makeId(), trackerId, at: atFor(day), slotId, variant, done: true, values };
  setState({ ...state, entries: [...state.entries.filter((e) => e.id !== existing?.id), entry] });
  emit({ type: 'entry.logged', entry });
}

// ---------- system ----------

export function createSystem(): void {
  if (state.systems.length > 0) return;
  const system: System = { id: makeId(), name: 'Motivation', config: defaultConfig('standard'), createdAt: Date.now() };
  setState({ ...state, systems: [system], trackers: state.trackers.map((t) => ({ ...t, systemId: system.id })) });
}

export function updateConfig(systemId: string, fn: (c: SystemConfig) => SystemConfig): void {
  setState({ ...state, systems: state.systems.map((s) => (s.id === systemId ? { ...s, config: fn(s.config) } : s)) });
}

export function setIntensity(systemId: string, intensity: Intensity): void {
  updateConfig(systemId, (c) => applyIntensity(c, intensity));
}

export function addRule(systemId: string, rule: Omit<CustomRule, 'id'>): void {
  updateConfig(systemId, (c) => ({ ...c, rules: [...c.rules, { ...rule, id: makeId() }] }));
}

export function removeRule(systemId: string, ruleId: string): void {
  updateConfig(systemId, (c) => ({ ...c, rules: c.rules.filter((r) => r.id !== ruleId) }));
}

// ---------- import ----------

export function mergeBackup(b: Backup): { trackers: number; entries: number } {
  const haveT = new Set(state.trackers.map((t) => t.id));
  const haveE = new Set(state.entries.map((e) => e.id));
  const newT = uniqueNames(b.trackers.filter((t) => !haveT.has(t.id)).map((t) => ({ ...t, systemId: null })), state.trackers.map((t) => t.name));
  const newE = b.entries.filter((e) => !haveE.has(e.id));
  setState({ ...state, trackers: [...state.trackers, ...newT], entries: [...state.entries, ...newE], onboarded: true });
  return { trackers: newT.length, entries: newE.length };
}

// ---------- developer helpers ----------

function demoValues(t: Tracker, seed: string): Entry['values'] {
  const v: Entry['values'] = {};
  for (const f of t.fields) {
    if (f.type === 'text') {
      v[f.id] = typeof f.default === 'string' ? f.default : '';
    } else {
      const base = typeof f.default === 'number' ? f.default : 1;
      const w = 1 + (hash01(seed + f.id) - 0.5) * 0.12;
      v[f.id] = f.step === 1 ? Math.max(1, Math.round(base * w)) : round2(base * w);
    }
  }
  return v;
}

// Replaces history with three weeks of plausible data so the system has something to show.
export function seedDemo(): void {
  const today = startOfDay(Date.now());
  const span = 21;
  const trackers = state.trackers.map((t) => ({ ...t, createdAt: addDays(today, -span) }));
  const entries: Entry[] = state.entries.filter((e) => e.at >= today);
  let n = 0;
  const id = () => `demo${n++}`;

  for (const t of trackers) {
    for (let i = span; i >= 1; i--) {
      const day = addDays(today, -i);
      const hit = hash01(`demo|${t.id}|${i}`) < 0.75;
      if (t.input === 'plan') {
        const pd = planFor(t, day);
        if (!pd) continue;
        const p = hit ? 1 : 0.4;
        for (const s of pd.slots) {
          const rowsN = (s.sets ?? 0) > 0 ? (s.sets as number) : 1;
          for (let r = 0; r < rowsN; r++) {
            if (hash01(`demo3|${t.id}|${i}|${s.id}|${r}`) > p) continue;
            const isRow = (s.sets ?? 0) > 0;
            entries.push({
              id: id(), trackerId: t.id, at: day + HALF_DAY, slotId: s.id,
              row: isRow ? r : undefined, done: true,
              values: isRow ? demoValues(t, `${i}|${s.id}|${r}`) : { ...(s.values ?? {}) },
            });
          }
        }
      } else {
        const wanted = hit ? 20 : hash01(`demo2|${t.id}|${i}`) < 0.5 ? 1 : 0;
        const mine: Entry[] = [];
        for (let k = 0; k < wanted; k++) {
          const e: Entry = {
            id: id(), trackerId: t.id, at: day + HALF_DAY + k * 60000, done: true,
            values: demoValues(t, `${i}|${k}`),
          };
          mine.push(e);
          entries.push(e);
          if (hit && dayResult(t, mine, day, state.entries).success) break;
        }
      }
    }
  }
  setState({ ...state, trackers, entries });
}

// Testing: replace everything tracked with an example person (their trackers and a realistic history).
export function loadPersona(id: string): void {
  const p = PERSONAS.find((x) => x.id === id);
  if (!p) return;
  const built = buildPersona(p, state.settings, state.systems[0]?.id ?? null);
  setState({ ...state, trackers: built.trackers, entries: built.entries, trash: [], onboarded: true });
}

export function loadNickSetup(): void {
  const sys = state.systems[0]?.id ?? null;
  const now = Date.now();
  const drafts = [nickGym(), nickNutrition(), nickWeight()];
  setState({
    ...state,
    trackers: [...state.trackers, ...drafts.map((d) => build(d, sys, now))],
    onboarded: true,
  });
}

// Remove trackers, entries and the points system, but keep who you are and how the app looks (name, colours, units).
export function deleteData(): void {
  setState({ ...emptyState, settings: state.settings });
}

// Start over completely: everything goes, including the name and look, and the app opens on the first screen again.
export async function resetAll(): Promise<void> {
  state = { ...emptyState, settings: { ...emptyState.settings, units: detectUnits() } };
  listeners.forEach((l) => l());
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    if (db) {
      await saving;
      await wipe(db);
      snap = emptySnapshot();
      scheduleSave();
    }
  } catch {
    // ignore
  }
}

// ---------- React hooks ----------

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppState(): { state: AppState; loaded: boolean } {
  const s = useSyncExternalStore(subscribe, () => state);
  const l = useSyncExternalStore(subscribe, () => loaded);
  return { state: s, loaded: l };
}

export function useDerived(): Derived & { state: AppState } {
  const { state: s } = useAppState();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  const derived = useMemo(() => derive(s.trackers, s.entries, s.systems, now, s.settings), [s, now]);
  return { ...derived, state: s };
}
