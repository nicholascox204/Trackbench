// A run file (GPX, as Strava, Garmin and most watches export) turned into a tracker's own fields: its distance and its time.
// The run's start sets the entry's time, so a run imported later lands on the day it happened.

import { parseGpx, runStats } from './gpx';
import type { Field, Tracker } from './types';

export interface RunFill { values: Record<string, number>; at?: number; meters: number; minutes: number; climb: number }

// A tracker can take a run when it records a distance and a time.
export function canRecordRun(fields: Field[]): boolean {
  return fields.some((f) => f.unitKind === 'distance') && fields.some((f) => f.type === 'duration');
}
export const canImportRun = (t: Tracker): boolean => canRecordRun(t.fields);

export function runFill(t: Tracker, gpxText: string): RunFill | undefined {
  const pts = parseGpx(gpxText);
  if (pts.length < 2) return undefined;
  const s = runStats(pts);
  const seconds = s.movingSeconds > 0 ? s.movingSeconds : s.elapsedSeconds;
  const minutes = Math.round(seconds / 60);
  const values: Record<string, number> = {};
  const dist = t.fields.find((f) => f.unitKind === 'distance');
  const time = t.fields.find((f) => f.type === 'duration');
  if (dist) values[dist.id] = Math.round(s.meters) / 1000; // distance is held in km
  if (time) values[time.id] = minutes;
  return { values, at: s.startedAt, meters: s.meters, minutes, climb: Math.round(s.gainMeters) };
}
