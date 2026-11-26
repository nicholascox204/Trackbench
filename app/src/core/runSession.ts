// Recording a run on the phone: the location task and the live state the record screen draws. The pure rules are in
// runRecorder.ts. On Android the task runs as a foreground service (a notification shows while recording), so the run keeps
// recording with the screen off or another app open. If background permission is refused, it records while the app is open.
// On the web it uses the browser's location, only while the page is open.
//
// The task must be defined when the app's code loads, so App.tsx imports this file.

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { addFix, cueText, finish, newRun, pause, start, type RunState } from './runRecorder';

export const RUN_TASK = 'trackbench-run';

let state: RunState = newRun();
let unit: { name: 'km' | 'mi'; meters: number } = { name: 'km', meters: 1000 };
let speak = true;
let watcher: Location.LocationSubscription | null = null;
let background = false;
const listeners = new Set<(s: RunState) => void>();

function set(next: RunState): void {
  const spoke = next.splits.length > state.splits.length;
  state = next;
  listeners.forEach((l) => l(state));
  if (spoke && speak) say(cueText(state, Date.now(), unit.name, unit.meters));
}

function say(text: string): void {
  import('expo-speech').then((Speech) => Speech.speak(text)).catch(() => undefined); // no voice is fine; the run still records
}

function take(locations: Location.LocationObject[]): void {
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
export function setSpoken(on: boolean): void { speak = on; }
export function spoken(): boolean { return speak; }
export function recordsInBackground(): boolean { return background; }

// Ask for location and start. Returns a sentence to show when it cannot.
export async function beginRun(units: 'km' | 'mi'): Promise<string | undefined> {
  unit = units === 'mi' ? { name: 'mi', meters: 1609.344 } : { name: 'km', meters: 1000 };
  const fg = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (!fg || fg.status !== 'granted') return 'Location is off for Trackbench, so a run cannot be recorded. Turn it on in your phone settings.';
  background = false;
  if (Platform.OS !== 'web') {
    const bg = await Location.requestBackgroundPermissionsAsync().catch(() => null);
    if (bg?.status === 'granted') {
      await Location.startLocationUpdatesAsync(RUN_TASK, {
        accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 3, pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.Fitness, showsBackgroundLocationIndicator: true,
        foregroundService: { notificationTitle: 'Recording your run', notificationBody: 'Open Trackbench to pause or finish.', killServiceOnDestroy: false },
      });
      background = true;
    }
  }
  if (!background) {
    watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 3 }, (l) => take([l]));
  }
  set(start(newRun(), Date.now()));
  return undefined;
}

export function pauseRun(): void { set(pause(state, Date.now())); }
export function resumeRun(): void { set(start(state, Date.now())); }

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
