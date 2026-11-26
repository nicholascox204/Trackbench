// Recording a run on the phone: the location task and the live state the record screen draws. The pure rules are in
// runRecorder.ts. Opening the run screen asks for location straight away and shows where you are. Starting tries screen-off
// recording first (an Android foreground service, with a notification while it records); if the phone refuses it, the run
// records while the app is open, and the screen says so. On the web it uses the browser's location while the page is open.
//
// The task must be defined when the app's code loads, so App.tsx imports this file.

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addFix, cueText, finish, newRun, pause, start, type RunState } from './runRecorder';

export const RUN_TASK = 'trackbench-run';

type Spot = { lat: number; lon: number; acc?: number };

let state: RunState = newRun();
let unit: { name: 'km' | 'mi'; meters: number } = { name: 'km', meters: 1000 };
let speak = true;
let every = 1; // voice update every this many km or miles
const KEY = 'trackbench.run.v1';
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let watcher: Location.LocationSubscription | null = null;
let background = false;
let here: Spot | undefined;
const listeners = new Set<(s: RunState) => void>();
const hereListeners = new Set<(p: Spot | undefined) => void>();

const NO_LOCATION = 'Location is off for Trackbench, so a run cannot be recorded. Turn it on in your phone settings, under Apps, Trackbench, Permissions.';
const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function set(next: RunState): void {
  const step = unit.meters * every;
  const spoke = next.status === 'running' && Math.floor(next.meters / step) > Math.floor(state.meters / step);
  state = next;
  listeners.forEach((l) => l(state));
  if (spoke && speak) say(cueText(state, Date.now(), unit.name, unit.meters, every));
  persist();
}

// The run in progress is saved as it goes, so closing the app or the phone ending it does not lose it.
function persist(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const body = state.status === 'idle' ? null : JSON.stringify({ state, unit, background });
    (body ? AsyncStorage.setItem(KEY, body) : AsyncStorage.removeItem(KEY)).catch(() => undefined);
  }, 1500);
}

// On start-up: bring back a run that was going. If the phone was still recording it in the background it carries on; otherwise it
// comes back paused, so nothing is added for the time the app was closed.
export async function restoreRun(): Promise<void> {
  try {
    const [raw, prefs] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(KEY + '.prefs')]);
    if (prefs) { const p = JSON.parse(prefs) as { speak?: boolean; every?: number }; speak = p.speak ?? true; every = p.every ?? 1; }
    if (!raw || state.status !== 'idle') return;
    const saved = JSON.parse(raw) as { state: RunState; unit: typeof unit; background: boolean };
    unit = saved.unit;
    const still = Platform.OS !== 'web' && saved.background && (await Location.hasStartedLocationUpdatesAsync(RUN_TASK).catch(() => false));
    background = still;
    let s = saved.state;
    if (s.status === 'running' && !still) s = pause({ ...s, resumedAt: Math.min(s.resumedAt ?? Date.now(), s.points[s.points.length - 1]?.t ?? Date.now()) }, s.points[s.points.length - 1]?.t ?? Date.now());
    state = s;
    listeners.forEach((l) => l(state));
  } catch {
    // a damaged save is ignored
  }
}
void restoreRun();

function savePrefs(): void { AsyncStorage.setItem(KEY + '.prefs', JSON.stringify({ speak, every })).catch(() => undefined); }

function setHere(l: Location.LocationObject): void {
  here = { lat: l.coords.latitude, lon: l.coords.longitude, acc: l.coords.accuracy ?? undefined };
  hereListeners.forEach((f) => f(here));
}

function say(text: string): void {
  import('expo-speech').then((Speech) => Speech.speak(text)).catch(() => undefined); // no voice is fine; the run still records
}

function take(locations: Location.LocationObject[]): void {
  if (locations.length) setHere(locations[locations.length - 1]);
  let s = state;
  for (const l of locations) s = addFix(s, { lat: l.coords.latitude, lon: l.coords.longitude, t: l.timestamp, acc: l.coords.accuracy ?? undefined, alt: l.coords.altitude ?? undefined }, unit.meters);
  if (s !== state) set(s);
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask(RUN_TASK, async ({ data, error }) => {
    if (error || !data) return;
    take((data as { locations: Location.LocationObject[] }).locations);
  });
}

export function runState(): RunState { return state; }
export function onRun(fn: (s: RunState) => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function onHere(fn: (p: Spot | undefined) => void): () => void { hereListeners.add(fn); return () => { hereListeners.delete(fn); }; }
export function hereNow(): Spot | undefined { return here; }
export function setSpoken(on: boolean): void { speak = on; savePrefs(); }
export function voiceEvery(): number { return every; }
export function setVoiceEvery(n: number): void { every = n; savePrefs(); }
export function spoken(): boolean { return speak; }
export function recordsInBackground(): boolean { return background; }

// Opening the run screen: ask for location (the phone's own prompt), then find where you are so the map shows it before you
// start. Returns a sentence to show when it cannot.
export async function prepareRun(): Promise<string | undefined> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return NO_LOCATION;
    const services = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!services) return 'Location is turned off on your phone. Turn it on in quick settings, then open this again.';
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    if (last) setHere(last);
    const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
    if (cur) setHere(cur);
    return undefined;
  } catch (e) {
    return `Could not reach location: ${why(e)}`;
  }
}

// Location updates on: screen-off recording (a foreground service) first, else while the app is open.
async function startUpdates(): Promise<string | undefined> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted' && (await Location.requestForegroundPermissionsAsync()).status !== 'granted') return NO_LOCATION;
  } catch (e) {
    return `Could not reach location: ${why(e)}`;
  }
  background = false;
  if (Platform.OS !== 'web') {
    try {
      await Location.startLocationUpdatesAsync(RUN_TASK, {
        accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 3, pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.Fitness, showsBackgroundLocationIndicator: true,
        foregroundService: { notificationTitle: 'Recording your run', notificationBody: 'Open Trackbench to pause or finish.', killServiceOnDestroy: false },
      });
      background = true;
    } catch {
      background = false; // this phone wants "Allow all the time" for that; record while the app is open instead
    }
  }
  if (!background) {
    try {
      watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 3 }, (l) => take([l]));
    } catch (e) {
      return `Could not start location: ${why(e)}`;
    }
  }
  return undefined;
}

// Start recording. Returns a sentence to show when it cannot record at all.
export async function beginRun(units: 'km' | 'mi'): Promise<string | undefined> {
  unit = units === 'mi' ? { name: 'mi', meters: 1609.344 } : { name: 'km', meters: 1000 };
  const e = await startUpdates();
  if (e) return e;
  set(start(newRun(), Date.now()));
  return undefined;
}

// From the run screen, when screen-off recording was refused: ask for "Allow all the time". Takes effect from the next run.
export async function allowScreenOff(): Promise<boolean> {
  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => null);
  return bg?.status === 'granted';
}

export function pauseRun(): void { set(pause(state, Date.now())); }
// Resuming; a run brought back after the app was closed needs location turned on again first.
export async function resumeRun(): Promise<string | undefined> {
  if (!watcher && !background) { const e = await startUpdates(); if (e) return e; }
  set(start(state, Date.now()));
  return undefined;
}

async function stopUpdates(): Promise<void> {
  watcher?.remove(); watcher = null;
  if (background && (await Location.hasStartedLocationUpdatesAsync(RUN_TASK).catch(() => false))) await Location.stopLocationUpdatesAsync(RUN_TASK).catch(() => undefined);
  background = false;
}

export async function finishRun(): Promise<RunState> {
  await stopUpdates();
  set(finish(state, Date.now()));
  return state;
}

export async function discardRun(): Promise<void> {
  await stopUpdates();
  set(newRun());
}

export function clearRun(): void { set(newRun()); }
