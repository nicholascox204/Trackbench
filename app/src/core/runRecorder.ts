// Recording a run from the phone's GPS: the pure part. Points arrive from the location task (runSession.ts); this decides which to
// keep, adds up distance and moving time, works out pace and splits, and says when a spoken update is due. Paused stretches are
// left out of both distance and time, the way running apps do. Tested without a phone.

import { haversine } from './gpx';

export interface Fix { lat: number; lon: number; t: number; acc?: number; alt?: number }

export interface RunState {
  status: 'idle' | 'running' | 'paused' | 'done';
  points: Fix[]; // kept points, in order
  segStarts: number[]; // index in points where each running stretch begins (after a pause, no line joins the gap)
  meters: number;
  movingMs: number; // time spent running, pauses left out
  resumedAt?: number; // when the current running stretch started
  splits: { n: number; seconds: number }[]; // time for each whole km or mile
  splitMark: { meters: number; ms: number }; // where the last split ended
}

export const MAX_ACCURACY = 35; // metres: a fix less sure than this is ignored
const MAX_SPEED = 12; // m/s: a jump faster than a sprinter is a GPS glitch

export function newRun(): RunState {
  return { status: 'idle', points: [], segStarts: [], meters: 0, movingMs: 0, splits: [], splitMark: { meters: 0, ms: 0 } };
}

export function start(s: RunState, now: number): RunState {
  return { ...s, status: 'running', resumedAt: now, segStarts: [...s.segStarts, s.points.length] };
}

export function pause(s: RunState, now: number): RunState {
  if (s.status !== 'running') return s;
  return { ...s, status: 'paused', movingMs: s.movingMs + (now - (s.resumedAt ?? now)), resumedAt: undefined };
}

export function finish(s: RunState, now: number): RunState {
  return { ...pause(s, now), status: 'done' };
}

export function elapsedMs(s: RunState, now: number): number {
  return s.movingMs + (s.status === 'running' && s.resumedAt !== undefined ? now - s.resumedAt : 0);
}

// Take one fix. Ignored while paused, when too inaccurate, or when it would mean an impossible speed.
export function addFix(s: RunState, f: Fix, unitMeters: number): RunState {
  if (s.status !== 'running') return s;
  if (f.acc !== undefined && f.acc > MAX_ACCURACY) return s;
  const segStart = s.segStarts[s.segStarts.length - 1] ?? 0;
  const prev = s.points.length > segStart ? s.points[s.points.length - 1] : undefined;
  if (!prev) return { ...s, points: [...s.points, f] };
  const d = haversine(prev, f);
  const dt = (f.t - prev.t) / 1000;
  if (dt <= 0) return s;
  if (d / dt > MAX_SPEED) return s;
  if (d < 2) return s; // standing still: no new point, so jitter does not add distance
  const meters = s.meters + d;
  const ms = s.movingMs + (f.t - (s.resumedAt ?? f.t));
  let { splits, splitMark } = s;
  const whole = Math.floor(meters / unitMeters);
  if (whole > splits.length) {
    // Time at the exact unit mark, by straight line between the two fixes.
    const into = (whole * unitMeters - s.meters) / d;
    const atMs = s.movingMs + (prev.t - (s.resumedAt ?? prev.t)) + into * (f.t - prev.t);
    splits = [...splits, { n: whole, seconds: Math.round((atMs - splitMark.ms) / 1000) }];
    splitMark = { meters: whole * unitMeters, ms: atMs };
    void ms;
  }
  return { ...s, points: [...s.points, f], meters, splits, splitMark };
}

// Pace over the last stretch (about 30 seconds of fixes), seconds per unit; undefined until there is enough to say.
export function currentPace(s: RunState, unitMeters: number, windowMs = 30000): number | undefined {
  const segStart = s.segStarts[s.segStarts.length - 1] ?? 0;
  const pts = s.points.slice(segStart);
  if (pts.length < 2) return undefined;
  const last = pts[pts.length - 1];
  let i = pts.length - 2;
  while (i > 0 && last.t - pts[i].t < windowMs) i--;
  let d = 0;
  for (let k = i + 1; k < pts.length; k++) d += haversine(pts[k - 1], pts[k]);
  const sec = (last.t - pts[i].t) / 1000;
  return d > 5 && sec > 0 ? (sec / d) * unitMeters : undefined;
}

export function averagePace(s: RunState, now: number, unitMeters: number): number | undefined {
  return s.meters > 20 ? (elapsedMs(s, now) / 1000 / s.meters) * unitMeters : undefined;
}

export function climbMeters(s: RunState): number {
  let up = 0;
  for (let i = 1; i < s.points.length; i++) {
    const a = s.points[i - 1].alt; const b = s.points[i].alt;
    if (a !== undefined && b !== undefined && b - a > 1) up += b - a; // small wobbles are GPS noise
  }
  return Math.round(up);
}

// ---------- spoken updates ----------

const paceWords = (secPerUnit: number): string => {
  const total = Math.round(secPerUnit); const m = Math.floor(total / 60); const sec = total % 60;
  return `${m} minute${m === 1 ? '' : 's'}${sec ? ` ${sec}` : ''}`;
};
const timeWords = (ms: number): string => {
  const total = Math.round(ms / 1000); const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const sec = total % 60;
  return [h ? `${h} hour${h === 1 ? '' : 's'}` : '', m ? `${m} minute${m === 1 ? '' : 's'}` : '', sec ? `${sec} second${sec === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ') || '0 seconds';
};

// What to say when a new whole unit is reached: distance, time, average pace, and that unit's split.
export function cueText(s: RunState, now: number, unit: 'km' | 'mi', unitMeters: number): string {
  const n = s.splits.length;
  const word = unit === 'km' ? (n === 1 ? 'kilometre' : 'kilometres') : n === 1 ? 'mile' : 'miles';
  const avg = averagePace(s, now, unitMeters);
  const split = s.splits[n - 1];
  return [`${n} ${word}`, `time ${timeWords(elapsedMs(s, now))}`, avg ? `average pace ${paceWords(avg)} per ${unit === 'km' ? 'kilometre' : 'mile'}` : '', split ? `last split ${paceWords(split.seconds)}` : ''].filter(Boolean).join('. ') + '.';
}

// ---------- storing the route ----------

// Google's encoded polyline (precision 5), so a route fits in one short text value on the entry.
export function encodeRoute(pts: { lat: number; lon: number }[]): string {
  let out = ''; let pl = 0; let pn = 0;
  const enc = (v: number) => { let x = v < 0 ? ~(v << 1) : v << 1; while (x >= 0x20) { out += String.fromCharCode((0x20 | (x & 0x1f)) + 63); x >>= 5; } out += String.fromCharCode(x + 63); };
  for (const p of pts) {
    const la = Math.round(p.lat * 1e5); const lo = Math.round(p.lon * 1e5);
    enc(la - pl); enc(lo - pn); pl = la; pn = lo;
  }
  return out;
}

export function decodeRoute(s: string): { lat: number; lon: number }[] {
  const out: { lat: number; lon: number }[] = [];
  let i = 0; let la = 0; let lo = 0;
  const dec = (): number => { let r = 0; let sh = 0; let b: number; do { b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20); return r & 1 ? ~(r >> 1) : r >> 1; };
  while (i < s.length) { la += dec(); lo += dec(); out.push({ lat: la / 1e5, lon: lo / 1e5 }); }
  return out;
}
