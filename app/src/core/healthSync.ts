// Steps can only be read while Trackbench is open (Health Connect holds its days meanwhile; the phone's counter keeps counting and
// is saved every 15 minutes). So whenever the app opens or comes back, the last few days of every tracker that follows a source are
// filled in, not just the day on screen.
import { stepsFieldIn } from './autoFields';
import { counterAllowed, counterAvailable, counterStepsOn, startCounting } from './stepCounter';
import { getState, saveDaily } from './store';
import { stepsLink, stepsOn } from './healthSteps';
import { startOfDay } from './time';
import type { Tracker } from './types';

export const BACKFILL_DAYS = 7;
export type StepSource = 'sensor' | 'health' | 'manual';

// A tracker with a number called Steps (the Steps preset, or one made by hand).
export const stepsFieldOf = (t: Tracker) => stepsFieldIn(t.fields);

// The chosen source, if one has been chosen (an older value that no longer exists counts as not chosen).
export function sourceOf(t: Tracker): StepSource | undefined {
  const f = stepsFieldOf(t);
  const s = f ? (t.sources?.[f.id] as string | undefined) : undefined;
  // A phone that counts its own steps uses that; Health Connect is only the way in on a phone that cannot.
  if (s === 'health' && counterAvailable()) return 'sensor';
  if (s === 'sensor' && !counterAvailable()) return 'health'; // set up as automatic, on a phone without its own counter
  return s === 'sensor' || s === 'health' || s === 'manual' ? s : undefined;
}

// The Steps field when it is filled automatically (chosen, or not chosen yet on a phone that can count its own steps).
export function autoStepsField(t: Tracker): string | undefined {
  const f = stepsFieldOf(t);
  if (!f) return undefined;
  const s = sourceOf(t);
  return s === 'manual' ? undefined : s || counterAvailable() ? f.id : undefined;
}

let running = false;

async function fill(source: StepSource, readDay: (day: number) => Promise<number | null>, now: number): Promise<void> {
  const today = startOfDay(now);
  for (let i = 0; i < BACKFILL_DAYS; i++) {
    const day = startOfDay(today - i * 86400000 + 12 * 3600000);
    const n = await readDay(day);
    if (typeof n !== 'number' || n <= 0) continue;
    for (const t of getState().trackers) {
      const f = stepsFieldOf(t);
      if (!f || sourceOf(t) !== source) continue;
      const have = getState().entries.find((e) => e.trackerId === t.id && e.done && e.at >= day && e.at < day + 86400000)?.values[f.id];
      if (have !== n) saveDaily(t.id, { [f.id]: n }, day);
    }
  }
}

export async function syncPhoneSteps(now: number = Date.now()): Promise<void> {
  if (running) return;
  const sources = new Set(getState().trackers.map(sourceOf));
  if (!sources.has('sensor') && !sources.has('health')) return;
  running = true;
  try {
    if (sources.has('sensor') && (await counterAllowed())) {
      startCounting();
      await fill('sensor', (d) => counterStepsOn(d, now), now);
    }
    if (sources.has('health') && (await stepsLink()) === 'allowed') {
      await fill('health', async (d) => { const n = await stepsOn(d); return typeof n === 'number' ? n : null; }, now);
    }
  } finally {
    running = false;
  }
}
