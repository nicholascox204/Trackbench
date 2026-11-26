// Runs on the same route, found from the routes saved on entries: a run that starts and ends near where this one did and is about
// as long. Running apps compare a run with your earlier ones on a route; this does the same without asking anyone to name routes.

import { haversine } from './gpx';
import { decodeRoute } from './runRecorder';
import type { Entry } from './types';

type Pt = { lat: number; lon: number };
export const NEAR = 150; // metres: starts and ends this close count as the same place
export const LENGTH = 0.1; // a run within this share of the length counts as the same distance

export interface SameRoute { count: number; best?: { minutes: number; at: number }; last?: { minutes: number; at: number } }

export function sameRoute(route: Pt[], km: number, entries: Entry[], distId: string, timeId: string, exceptId?: string): SameRoute {
  if (route.length < 2 || km <= 0) return { count: 0 };
  const a = route[0]; const b = route[route.length - 1];
  const out: SameRoute = { count: 0 };
  for (const e of entries) {
    if (e.id === exceptId || typeof e.values.route !== 'string' || !e.values.route) continue;
    const d = Number(e.values[distId]); const m = Number(e.values.secs) > 0 ? Number(e.values.secs) / 60 : Number(e.values[timeId]);
    if (!(d > 0) || !(m > 0) || Math.abs(d - km) / km > LENGTH) continue;
    const r = decodeRoute(e.values.route);
    if (r.length < 2 || haversine(r[0], a) > NEAR || haversine(r[r.length - 1], b) > NEAR) continue;
    out.count++;
    if (!out.best || m < out.best.minutes) out.best = { minutes: m, at: e.at };
    if (!out.last || e.at > out.last.at) out.last = { minutes: m, at: e.at };
  }
  return out;
}
