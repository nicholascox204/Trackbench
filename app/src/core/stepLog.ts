// Steps from the phone's own counter. The hardware keeps a running total since the phone last started; readings of it are
// saved with the time ("time,total" per line). A day's steps are the growth between readings, shared out by the time each
// stretch spends in the day. Pure, so it can be tested without a phone.
export interface StepPoint { t: number; c: number }

export function parseLog(text: string): StepPoint[] {
  const out: StepPoint[] = [];
  for (const line of text.split('\n')) {
    const [a, b] = line.split(',');
    const t = Number(a), c = Number(b);
    if (a && b && Number.isFinite(t) && Number.isFinite(c)) out.push({ t, c });
  }
  return out.sort((x, y) => x.t - y.t);
}

// Steps between two readings. A total that went down means the phone restarted, so the new total is the steps since then.
export const growth = (from: StepPoint, to: StepPoint): number => (to.c >= from.c ? to.c - from.c : to.c);

// The steps that fall between `start` and `end`. Before the first reading nothing is known, so nothing is counted.
export function stepsInRange(points: StepPoint[], start: number, end: number): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const span = b.t - a.t;
    if (span <= 0) continue;
    const overlap = Math.min(b.t, end) - Math.max(a.t, start);
    if (overlap <= 0) continue;
    total += growth(a, b) * (overlap / span);
  }
  return Math.round(total);
}

// The log plus a reading taken just now, if it is newer than the last saved one.
export function withLive(points: StepPoint[], now: number, counter: number | null): StepPoint[] {
  if (counter === null) return points;
  const last = points[points.length - 1];
  if (last && last.t >= now) return points;
  return [...points, { t: now, c: counter }];
}
