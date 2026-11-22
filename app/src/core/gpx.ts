// Reading a GPX file (what Strava, Garmin, Map My Run and most watches export) into the numbers a run needs: distance, time,
// pace, elevation gain, the route and splits. No map and no phone sensors here; it is arithmetic on points, so it works the
// same on every platform and can be tested with plain text.

export interface GpxPoint { lat: number; lon: number; ele?: number; t?: number } // t: ms since 1970

export interface Split { n: number; meters: number; seconds: number; paceSecPerKm: number }

export interface RunStats {
  points: number;
  meters: number;
  elapsedSeconds: number; // first point to last
  movingSeconds: number;  // time spent actually moving (stops are left out)
  startedAt?: number;
  gainMeters: number;     // elevation climbed, ignoring small wobble
  lossMeters: number;
  route: { lat: number; lon: number }[]; // simplified, for drawing
  splits: Split[];
}

const EARTH = 6371008.8; // metres
const rad = (d: number): number => (d * Math.PI) / 180;

export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

const attr = (s: string, name: string): string | undefined => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(s);
  return m ? (m[2] ?? m[3]) : undefined;
};
const tag = (s: string, name: string): string | undefined => {
  const m = new RegExp(`<${name}\\b[^>]*>\\s*([^<]*?)\\s*</${name}>`).exec(s);
  return m ? m[1] : undefined;
};

// Track points from the text of a GPX file. Several track segments are joined in order. Route points (planned routes) are used
// only when there is no track. Points without a valid position are skipped.
export function parseGpx(text: string): GpxPoint[] {
  const grab = (kind: 'trkpt' | 'rtept'): GpxPoint[] => {
    const out: GpxPoint[] = [];
    const re = new RegExp(`<${kind}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${kind}>)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const lat = parseFloat(attr(m[1], 'lat') ?? '');
      const lon = parseFloat(attr(m[1], 'lon') ?? '');
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      const body = m[2] ?? '';
      const ele = parseFloat(tag(body, 'ele') ?? '');
      const time = tag(body, 'time');
      const t = time ? Date.parse(time) : NaN;
      out.push({ lat, lon, ...(Number.isFinite(ele) ? { ele } : {}), ...(Number.isFinite(t) ? { t } : {}) });
    }
    return out;
  };
  const track = grab('trkpt');
  return track.length > 0 ? track : grab('rtept');
}

const MOVING_MPS = 0.5;   // slower than this between two points counts as standing still
const GAP_SECONDS = 60;   // a gap longer than this between points is a pause, not movement
const WOBBLE = 3;         // metres of elevation change ignored as noise

// Elevation climbed and descended, counting a change only once it passes the wobble threshold.
export function elevationChange(points: GpxPoint[]): { gain: number; loss: number } {
  let gain = 0;
  let loss = 0;
  let ref: number | undefined;
  for (const p of points) {
    if (p.ele === undefined) continue;
    if (ref === undefined) { ref = p.ele; continue; }
    const d = p.ele - ref;
    if (d >= WOBBLE) { gain += d; ref = p.ele; }
    else if (d <= -WOBBLE) { loss += -d; ref = p.ele; }
  }
  return { gain, loss };
}

// Keeps the shape of a route with far fewer points (Douglas-Peucker), so a long run does not fill storage.
export function simplifyRoute(pts: { lat: number; lon: number }[], maxPoints = 300): { lat: number; lon: number }[] {
  if (pts.length <= maxPoints) return pts.map((p) => ({ lat: p.lat, lon: p.lon }));
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  // Distances in a flat local frame are good enough for choosing which points matter.
  const lat0 = rad(pts[0].lat);
  const xy = pts.map((p) => ({ x: rad(p.lon) * Math.cos(lat0) * EARTH, y: rad(p.lat) * EARTH }));
  const dist = (p: number, a: number, b: number): number => {
    const A = xy[a], B = xy[b], P = xy[p];
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = dx * dx + dy * dy;
    const u = len === 0 ? 0 : Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / len));
    return Math.hypot(P.x - (A.x + u * dx), P.y - (A.y + u * dy));
  };
  const run = (tol: number): number => {
    keep.fill(0); keep[0] = 1; keep[pts.length - 1] = 1;
    const stack: [number, number][] = [[0, pts.length - 1]];
    let count = 2;
    while (stack.length) {
      const [a, b] = stack.pop() as [number, number];
      let far = -1, farD = tol;
      for (let i = a + 1; i < b; i++) { const d = dist(i, a, b); if (d > farD) { far = i; farD = d; } }
      if (far >= 0) { keep[far] = 1; count++; stack.push([a, far], [far, b]); }
    }
    return count;
  };
  let tol = 1;
  while (run(tol) > maxPoints && tol < 5000) tol *= 1.5;
  return pts.filter((_, i) => keep[i]).map((p) => ({ lat: p.lat, lon: p.lon }));
}

// Splits at every whole `unitMeters` (1000 for kilometres, 1609.344 for miles), by interpolating along the moving time. The
// last partial split is kept if it is at least a tenth of a unit.
export function splitsOf(points: GpxPoint[], unitMeters: number): Split[] {
  const out: Split[] = [];
  let acc = 0;      // distance in the current split
  let sec = 0;      // moving time in the current split
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    let d = haversine(a, b);
    const dt = a.t !== undefined && b.t !== undefined ? (b.t - a.t) / 1000 : 0;
    const moving = dt > 0 && dt <= GAP_SECONDS && d / dt >= MOVING_MPS;
    let t = moving ? dt : 0;
    while (d > 0 && acc + d >= unitMeters) {
      const need = unitMeters - acc;
      const part = d === 0 ? 0 : need / d;
      out.push({ n: out.length + 1, meters: unitMeters, seconds: sec + t * part, paceSecPerKm: ((sec + t * part) / unitMeters) * 1000 });
      d -= need; t -= t * part; acc = 0; sec = 0;
    }
    acc += d; sec += t;
  }
  if (acc >= unitMeters / 10 && sec > 0) out.push({ n: out.length + 1, meters: acc, seconds: sec, paceSecPerKm: (sec / acc) * 1000 });
  return out;
}

export function runStats(points: GpxPoint[], unitMeters = 1609.344): RunStats {
  let meters = 0;
  let moving = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const d = haversine(a, b);
    meters += d;
    if (a.t !== undefined && b.t !== undefined) {
      const dt = (b.t - a.t) / 1000;
      if (dt > 0 && dt <= GAP_SECONDS && d / dt >= MOVING_MPS) moving += dt;
    }
  }
  const times = points.filter((p) => p.t !== undefined).map((p) => p.t as number);
  const elapsed = times.length > 1 ? (times[times.length - 1] - times[0]) / 1000 : 0;
  const { gain, loss } = elevationChange(points);
  return {
    points: points.length, meters, elapsedSeconds: Math.max(0, elapsed), movingSeconds: moving,
    startedAt: times[0], gainMeters: gain, lossMeters: loss,
    route: simplifyRoute(points), splits: splitsOf(points, unitMeters),
  };
}

// Pace as "8:30" from seconds per unit.
export function paceText(secondsPerUnit: number): string {
  if (!Number.isFinite(secondsPerUnit) || secondsPerUnit <= 0) return '–';
  let m = Math.floor(secondsPerUnit / 60);
  let s = Math.round(secondsPerUnit - m * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, '0')}`;
}
