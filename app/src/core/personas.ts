// Example people for testing: a set of trackers and a realistic history of entries, so any screen can be looked at with the data a
// new person, a regular, or someone with years of tracking would have. Deterministic (the same person every time), and built only from
// the templates, so it never depends on anything a template does not already say.
//
// What makes the history look real: a first-weeks burst of enthusiasm that settles, quieter weekends, good and bad weeks, one longer
// lapse in a long history, readings that drift slowly, lifts that climb and plateau, and a different usual time of day for each tracker.
import { hash01 } from './engine';
import { dayKeyOf, planFor } from './plan';
import { isDueOn, scheduleOf } from './schedule';
import { draftFromAnswers } from './setup';
import { TEMPLATES } from './templates';
import { addDays, startOfDay } from './time';
import { joinPicks } from './choices';
import type { Entry, Field, Settings, Slot, Tracker } from './types';

export interface Persona {
  id: string;
  name: string;
  blurb: string;
  days: number; // how far back the history goes
  adherence: number; // 0 to 1: how reliably they log
  trackers: string[]; // template ids
}

export const PERSONAS: Persona[] = [
  { id: 'fresh', name: 'Just started', blurb: '2 trackers, 5 days', days: 5, adherence: 0.95, trackers: ['habit', 'water'] },
  { id: 'casual', name: 'A few, a few months', blurb: '4 trackers, 75 days', days: 75, adherence: 0.6, trackers: ['habit', 'water', 'mood', 'weigh-in'] },
  { id: 'regular', name: 'Regular', blurb: '7 trackers, 300 days', days: 300, adherence: 0.75, trackers: ['gym-split', 'habit', 'sleep', 'weigh-in', 'steps', 'water', 'mood'] },
  {
    id: 'deep', name: 'Tracks everything', blurb: '18 trackers, 540 days', days: 540, adherence: 0.8,
    trackers: ['gym-split', 'running', 'steps', 'stretching', 'mood', 'sleep', 'weigh-in', 'water', 'vitamins', 'habit', 'meditate', 'reading', 'no-alcohol', 'spending', 'study', 'journal', 'meals', 'caffeine'],
  },
  {
    id: 'sprawl', name: 'Many, one month', blurb: '24 trackers, 28 days', days: 28, adherence: 0.65,
    trackers: ['gym-split', 'running', 'steps', 'stretching', 'mood', 'sleep', 'weigh-in', 'water', 'medication', 'vitamins', 'symptoms', 'pain', 'meditate', 'journal', 'reading', 'no-alcohol', 'no-scrolling', 'spending', 'study', 'practice', 'chores', 'pet-care', 'plants', 'caffeine'],
  },
  { id: 'veteran', name: 'Few, for years', blurb: '3 trackers, 3 years', days: 1095, adherence: 0.85, trackers: ['weigh-in', 'gym-split', 'sleep'] },
];

// Things to tick for the list presets that start empty.
const ITEMS: Record<string, string[]> = {
  habit: ['Make the bed', 'Stretch', 'Read 10 pages', 'Take vitamins', 'No phone in bed'],
  medication: ['Morning pill', 'Evening pill'],
  vitamins: ['Vitamin D', 'Omega 3', 'Magnesium'],
};

const HOUR = 3600000;
const SPREAD = ['Usual', 'Quick one', 'Long one', 'Easy', 'Hard'];

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const roundTo = (n: number, step: number): number => (step > 0 ? Math.round(n / step) * step : n);

// A gym rep range like "6-8" or "5" as low and high.
function repRange(range: string | undefined): [number, number] {
  const m = (range ?? '').match(/^(\d+)(?:-(\d+))?/);
  if (!m) return [8, 10];
  const lo = Number(m[1]);
  return [lo, m[2] ? Number(m[2]) : lo];
}

export function buildPersona(p: Persona, settings: Settings, systemId: string | null, now: number = Date.now()): { trackers: Tracker[]; entries: Entry[] } {
  const today = startOfDay(now);
  const start = addDays(today, -p.days);
  const trackers: Tracker[] = [];
  const entries: Entry[] = [];
  let n = 0;

  p.trackers.forEach((tid, ti) => {
    const tpl = TEMPLATES.find((x) => x.id === tid);
    if (!tpl) return;
    let a = tpl.make();
    const items = ITEMS[tid];
    if (a.log === 'plan') {
      a = a.planStyle === 'items' && items
        ? { ...a, planMode: 'example', sample: [{ label: '', slots: items.map((name, i) => ({ id: `${tid}-${i}`, name })) }] }
        : { ...a, planMode: 'example' };
    }
    const draft = draftFromAnswers(a, settings);
    const id = `${p.id}-${tid}`;
    // the templates make their item ids at random; here they are the same every time
    const slotIds = new Map<string, string>();
    const stable = (old: string): string => { if (!slotIds.has(old)) slotIds.set(old, `${tid}-s${slotIds.size}`); return slotIds.get(old) as string; };
    const plan = draft.plan.map((v) => ({ ...v, from: dayKeyOf(start), days: v.days.map((d) => ({ ...d, slots: d.slots.map((sl) => ({ ...sl, id: stable(sl.id) })) })) }));
    const t: Tracker = { ...draft, id, systemId, createdAt: start, plan };
    trackers.push(t);

    const r = (day: number, k: string): number => hash01(`${p.id}|${id}|${day}|${k}`);
    const usualHour = 6 + 14 * hash01(`${id}|hour`);
    const stamp = (day: number, k: number): number => day + Math.round((usualHour + (r(day, `t${k}`) - 0.5) * 2 + k * 0.4) * HOUR);
    const own = 0.85 + 0.25 * hash01(`${id}|own`); // some trackers are kept up better than others
    const lapseAt = p.days > 120 ? Math.floor(p.days * (0.3 + 0.4 * hash01(`${id}|lapse`))) : -1;

    // how likely they are to log this tracker on a given day
    const chance = (i: number, day: number): number => {
      let q = p.adherence * own;
      if (i < 21) q *= 1 + 0.25 * (1 - i / 21); // the first weeks are keener
      const dow = new Date(day).getDay();
      if (dow === 0 || dow === 6) q *= 0.85;
      if (hash01(`${id}|wk|${Math.floor(i / 7)}`) < 0.12) q *= 0.35; // a bad week
      if (lapseAt >= 0 && i >= lapseAt && i < lapseAt + 14) q *= 0.1; // a fortnight away
      return clamp(q, 0, 0.97);
    };

    const valueFor = (f: Field, i: number, day: number, k: string): number | string => {
      if (f.type === 'text') return f.label ? SPREAD[Math.floor(r(day, `${f.id}${k}`) * SPREAD.length)] : '';
      if (f.type === 'choice') {
        const opts = f.options ?? [];
        if (opts.length === 0) return '';
        const pick = opts[Math.floor(r(day, `${f.id}${k}`) * opts.length)];
        return f.multi && r(day, `${f.id}m${k}`) < 0.3 ? joinPicks([pick, opts[(opts.indexOf(pick) + 1) % opts.length]]) : pick;
      }
      if (f.type === 'rating') {
        const max = f.max ?? 5;
        const week = hash01(`${id}|mood|${Math.floor(i / 7)}`) - 0.5;
        return clamp(Math.round(max * (0.62 + 0.35 * week + 0.25 * (r(day, `${f.id}${k}`) - 0.5))), 1, max);
      }
      const base = typeof f.default === 'number' && f.default > 0 ? f.default : 1;
      const noise = r(day, `${f.id}${k}`) - 0.5;
      if (f.id === 'steps') {
        const dow = new Date(day).getDay();
        return Math.max(500, roundTo(base * (dow === 0 || dow === 6 ? 0.8 : 1.15) * (1 + noise * 0.6), f.step ?? 1));
      }
      if (f.reading || t.daily) {
        // a slow drift, with a little day-to-day noise
        const drift = 0.05 * Math.sin(i / 50 + 6 * hash01(`${id}|ph`));
        return Math.round(base * (1 + drift + noise * 0.015) * 100) / 100;
      }
      const v = base * (1 + noise * 0.5);
      return f.type === 'duration' ? Math.max(1, roundTo(v, f.step ?? 5)) : f.step === 1 || !f.step ? Math.max(1, Math.round(v)) : Math.round(v * 100) / 100;
    };

    const add = (day: number, k: number, extra: Partial<Entry>): void => {
      entries.push({ id: `${p.id}-${n++}`, trackerId: id, at: stamp(day, k), done: true, values: {}, ...extra });
    };

    for (let i = 0; i < p.days; i++) {
      const day = addDays(start, i);
      const q = chance(i, day);
      const sched = scheduleOf(t, day);
      const fixed = sched.kind === 'daily' || sched.kind === 'weekdays' || sched.kind === 'monthly' || sched.kind === 'interval';
      if (fixed && !isDueOn(sched, day)) continue;
      const rhythm = sched.kind === 'times' ? Math.min(1, sched.n / (sched.per === 'week' ? 7 : 30)) : sched.kind === 'whenever' ? 0.5 : 1;

      if (t.input === 'check') {
        if (t.avoid) { if (r(day, 'slip') < (lapseAt >= 0 && i >= lapseAt && i < lapseAt + 14 ? 0.3 : 0.05)) add(day, 0, {}); }
        else if (r(day, 'do') < q * rhythm) add(day, 0, {});
      } else if (t.input === 'tap') {
        if (r(day, 'do') >= q) continue;
        const step = t.fields.find((f) => f.id === 'n')?.step ?? 1;
        const taps = 3 + Math.floor(r(day, 'taps') * 6);
        for (let k = 0; k < taps; k++) add(day, k, t.fields.some((f) => f.id === 'n') ? { values: { n: step } } : {});
      } else if (t.input === 'form') {
        if (r(day, 'do') >= q * rhythm) continue;
        const count = t.daily ? 1 : 1 + (r(day, 'more') < 0.2 ? 1 : 0);
        for (let k = 0; k < count; k++) add(day, k, { values: Object.fromEntries(t.fields.map((f) => [f.id, valueFor(f, i, day, String(k))])) });
      } else if (t.input === 'plan') {
        const pd = planFor(t, day);
        if (!pd || pd.slots.length === 0) continue;
        if (t.planStyle === 'sets') {
          if (r(day, 'do') >= q) continue;
          pd.slots.forEach((sl: Slot, si) => {
            const rows = (sl.sets ?? 0) > 0 ? (sl.sets as number) : 1;
            const [lo, hi] = repRange(sl.range);
            const grown = Math.min(1.45, 1 + 0.0016 * i); // lifts climb, then level off
            const start0 = 20 + 80 * hash01(`${sl.name}|w`);
            for (let row = 0; row < rows; row++) {
              if (r(day, `row${si}.${row}`) > 0.96) continue;
              const values: Record<string, number | string> = {};
              for (const f of t.fields) {
                if (f.id === 'weight') values[f.id] = roundTo(start0 * grown, 2.5);
                else if (f.id === 'reps') values[f.id] = lo + Math.floor(r(day, `reps${si}.${row}`) * (hi - lo + 1));
                else values[f.id] = valueFor(f, i, day, `${si}.${row}`);
              }
              add(day, si * 4 + row, { slotId: sl.id, row: (sl.sets ?? 0) > 0 ? row : undefined, values });
            }
          });
        } else {
          pd.slots.forEach((sl: Slot, si) => {
            const per = clamp(q * (0.7 + 0.5 * hash01(`${sl.id}|item`)), 0, 0.98); // some items are kept up better than others
            if (r(day, `item${si}`) < per) add(day, si, { slotId: sl.id, values: { ...(sl.values ?? {}) } });
          });
        }
      }
    }
  });

  return { trackers, entries };
}
