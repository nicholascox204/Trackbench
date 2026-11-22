// The system engine. A pure function: given a system's config, its trackers and
// a list of days, it replays everything from the start and returns the state
// plus a ledger explaining every change. Because it replays, changing a rule
// re-scores history for free, and the simulator is the same function fed
// synthetic days.
//
// Rules never trigger other rules: each day is evaluated once, in a fixed order,
// and effects only change state.

import { addDays, startOfDay } from './time';
import { expectedOn, successSpec } from './measures';
import type { Consistency, Intensity, Payout, SystemConfig, Tracker } from './types';

export interface DayTrackerResult {
  expected: boolean;
  success: boolean;
  measures: Record<string, number>;
}

export interface DayInput {
  day: number; // start of day, ms
  closed: boolean; // false only for today
  results: Record<string, DayTrackerResult>;
}

export type LedgerModule = 'points' | 'lucky' | 'allClear' | 'rule' | 'hearts';

export interface LedgerItem {
  day: number;
  module: LedgerModule;
  trackerId?: string;
  delta: number;
  unit: 'pts' | 'hearts';
  reason: string;
}

export type DayMark = 'hit' | 'miss' | 'rest' | 'pending';

export interface TrackerStats {
  streak: number;
  best: number;
  score: number; // 0 to 100, the habit-score style
  hits: number;
  expected: number;
  history: DayMark[];
}

export interface SystemResult {
  points: number;
  earned: number;
  hearts: number;
  maxHearts: number;
  level: number;
  levelProgress: number; // 0 to 1
  nextLevelAt: number;
  ledger: LedgerItem[];
  perTracker: Record<string, TrackerStats>;
}

const SCORE_DECAY = 0.9;
const LEVEL_UNIT = 25; // lifetime points per level step (grows with the square)

export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function intensityValues(i: Intensity): { reward: number; penalty: number; hearts: number } {
  if (i === 'gentle') return { reward: 10, penalty: 0, hearts: 5 };
  if (i === 'hardcore') return { reward: 10, penalty: 15, hearts: 1 };
  return { reward: 10, penalty: 5, hearts: 3 };
}

export function defaultConfig(intensity: Intensity = 'standard'): SystemConfig {
  const v = intensityValues(intensity);
  return {
    intensity,
    consistency: 'grace',
    points: { on: true, reward: v.reward, penalty: v.penalty },
    hearts: { on: false, max: v.hearts },
    levels: { on: true },
    lucky: { on: false, chance: 15, bonus: 5 },
    allClear: { on: true, bonus: 10 },
    rules: [],
  };
}

export function applyIntensity(config: SystemConfig, intensity: Intensity): SystemConfig {
  const v = intensityValues(intensity);
  return {
    ...config,
    intensity,
    points: { ...config.points, reward: v.reward, penalty: v.penalty },
    hearts: { ...config.hearts, max: v.hearts },
  };
}

interface Acc {
  strict: number;
  grace: number;
  missRun: number;
  bestStrict: number;
  bestGrace: number;
  score: number;
  hits: number;
  expected: number;
  history: DayMark[];
}

export function evaluate(config: SystemConfig, trackers: Tracker[], days: DayInput[], events: { day: number; trackerId: string; title: string; success: boolean; weight: number; pay?: Payout }[] = []): SystemResult {
  const eventsByDay = new Map<number, typeof events>();
  for (const e of events) {
    const list = eventsByDay.get(e.day);
    if (list) list.push(e);
    else eventsByDay.set(e.day, [e]);
  }
  let points = 0;
  let earned = 0;
  let hearts = config.hearts.max;
  const ledger: LedgerItem[] = [];
  const acc: Record<string, Acc> = {};
  for (const t of trackers) {
    acc[t.id] = {
      strict: 0, grace: 0, missRun: 0, bestStrict: 0, bestGrace: 0,
      score: 0, hits: 0, expected: 0, history: [],
    };
  }

  const addPoints = (
    day: number, module: LedgerModule, delta: number, reason: string, trackerId?: string,
  ) => {
    if (!config.points.on || delta === 0) return;
    const before = points;
    points = Math.max(0, points + delta); // points never go below zero
    const applied = points - before;
    if (applied === 0) return;
    if (applied > 0) earned += applied;
    ledger.push({ day, module, trackerId, delta: applied, unit: 'pts', reason });
  };

  for (const d of days) {
    const expectedTrackers: Tracker[] = [];

    for (const t of trackers) {
      const r = d.results[t.id];
      const a = acc[t.id];
      if (!r) continue;

      if (!r.expected) {
        a.history.push('rest');
      } else {
        a.expected++;
        expectedTrackers.push(t);
        if (r.success) {
          a.hits++;
          a.strict++;
          a.grace++;
          a.missRun = 0;
          a.bestStrict = Math.max(a.bestStrict, a.strict);
          a.bestGrace = Math.max(a.bestGrace, a.grace);
          a.score = a.score * SCORE_DECAY + (1 - SCORE_DECAY);
          a.history.push('hit');
          addPoints(d.day, 'points', config.points.reward, `${t.name}: goal met`, t.id);
          if (config.lucky.on && hash01(`${t.id}|${d.day}`) < config.lucky.chance / 100) {
            addPoints(d.day, 'lucky', config.lucky.bonus, `${t.name}: lucky bonus`, t.id);
          }
        } else if (d.closed) {
          a.strict = 0;
          a.missRun++;
          if (a.missRun >= 2) {
            a.grace = 0;
            a.missRun = 0;
          }
          a.score = a.score * SCORE_DECAY;
          a.history.push('miss');
          addPoints(d.day, 'points', -config.points.penalty, `${t.name}: missed`, t.id);
        } else {
          a.history.push('pending');
        }
      }

      // Custom rules on this tracker's measures.
      for (const rule of config.rules) {
        if (rule.trackerId !== t.id) continue;
        const v = r.measures[rule.measure] ?? 0;
        const active = Object.values(r.measures).some((x) => x > 0);
        const fires = rule.cmp === '>=' ? v >= rule.value && active : d.closed && active && v <= rule.value;
        if (fires) {
          const name = t.measures.find((m) => m.id === rule.measure)?.name ?? rule.measure;
          addPoints(d.day, 'rule', rule.points, `${t.name} ${name} ${rule.cmp} ${rule.value}`, t.id);
        }
      }
    }

    // Goals with their own timing (a finished week or month, a target reached) reward when they are met.
    for (const e of eventsByDay.get(d.day) ?? []) {
      const pay = { ...config.defaultPay, ...e.pay };
      if (e.success) addPoints(d.day, 'points', pay.reward ?? Math.round(config.points.reward * e.weight), `Goal met: ${e.title}`, e.trackerId);
      else {
        if (pay.penalty) addPoints(d.day, 'points', -pay.penalty, `Goal missed: ${e.title}`, e.trackerId);
        if (pay.heart && config.hearts.on && hearts > 0) {
          hearts -= 1;
          ledger.push({ day: d.day, module: 'hearts', delta: -1, unit: 'hearts', reason: `Goal missed: ${e.title}` });
        }
      }
    }

    // Cross-tracker rule: every expected tracker hit its goal.
    if (config.allClear.on && expectedTrackers.length >= 2) {
      if (expectedTrackers.every((t) => d.results[t.id].success)) {
        addPoints(d.day, 'allClear', config.allClear.bonus, 'All trackers hit today');
      }
    }

    // Hearts change only once a day has closed.
    if (config.hearts.on && d.closed && expectedTrackers.length > 0) {
      const misses = expectedTrackers.filter((t) => !d.results[t.id].success).length;
      const mode = config.hearts.loseOn ?? 'any';
      const missed = mode === 'any' ? misses >= 1 : mode === 'all' ? misses === expectedTrackers.length : misses * 2 >= expectedTrackers.length;
      if (missed && hearts > 0) {
        hearts -= 1;
        ledger.push({ day: d.day, module: 'hearts', delta: -1, unit: 'hearts', reason: mode === 'any' ? 'A tracker was missed' : mode === 'all' ? 'Every tracker was missed' : 'Half the trackers were missed' });
      } else if (misses === 0 && config.hearts.regain !== false && hearts < config.hearts.max) {
        hearts += 1;
        ledger.push({ day: d.day, module: 'hearts', delta: 1, unit: 'hearts', reason: 'Every tracker hit' });
      }
    }
  }

  const perTracker: Record<string, TrackerStats> = {};
  for (const t of trackers) {
    const a = acc[t.id];
    const useGrace = config.consistency === 'grace';
    perTracker[t.id] = {
      streak: config.consistency === 'none' ? 0 : useGrace ? a.grace : a.strict,
      best: useGrace ? a.bestGrace : a.bestStrict,
      score: Math.round(a.score * 100),
      hits: a.hits,
      expected: a.expected,
      history: a.history,
    };
  }

  const levelsOn = config.levels.on && config.points.on;
  const unit = Math.max(1, config.levels.perLevel ?? LEVEL_UNIT);
  const level = levelsOn ? 1 + Math.floor(Math.sqrt(earned / unit)) : 1;
  const floorAt = unit * (level - 1) ** 2;
  const nextLevelAt = unit * level ** 2;
  const levelProgress = levelsOn ? (earned - floorAt) / (nextLevelAt - floorAt) : 0;

  return {
    points, earned, hearts, maxHearts: config.hearts.max,
    level, levelProgress, nextLevelAt, ledger, perTracker,
  };
}

// ---- Simulator ----

export interface Pattern {
  id: string;
  label: string;
  hitRate: number;
}

export const PATTERNS: Pattern[] = [
  { id: 'perfect', label: 'Perfect week', hitRate: 1 },
  { id: 'typical', label: 'Typical week', hitRate: 0.8 },
  { id: 'bad', label: 'Bad week', hitRate: 0.3 },
];

// Builds closed days with a given chance of hitting each goal, for previewing a system.
export function syntheticDays(
  trackers: Tracker[], hitRate: number, nDays: number, now: number = Date.now(), seed = 'sim',
): DayInput[] {
  const today = startOfDay(now);
  const days: DayInput[] = [];
  for (let i = nDays; i >= 1; i--) {
    const day = addDays(today, -i);
    const results: Record<string, DayTrackerResult> = {};
    for (const t of trackers) {
      const expected = expectedOn(t, day);
      const success = expected && hash01(`${seed}|${t.id}|${i}`) < hitRate;
      const measures: Record<string, number> = { done: success ? 1 : 0, count: 0, completion: 0 };
      for (const m of t.measures) measures[m.id] = 0;
      if (success) {
        const spec = successSpec(t);
        measures[spec.measure] = spec.value;
      }
      results[t.id] = { expected, success, measures };
    }
    days.push({ day, closed: true, results });
  }
  return days;
}

export function simulate(config: SystemConfig, trackers: Tracker[], hitRate: number, nDays = 7): SystemResult {
  return evaluate(config, trackers, syntheticDays(trackers, hitRate, nDays));
}

// Plain-language description of a config, used by onboarding's receipt and the System screen.
export function describeConfig(c: SystemConfig): { label: string; value: string }[] {
  const consistencyText: Record<Consistency, string> = {
    none: 'Off',
    strict: 'Streak, resets on any miss',
    grace: 'Streak that forgives a single missed day',
    score: 'Habit score that rises with hits and fades with misses',
  };
  const rows = [
    { label: 'Consistency', value: consistencyText[c.consistency] },
    {
      label: 'Points',
      value: c.points.on
        ? `+${c.points.reward} per goal met${c.points.penalty > 0 ? `, -${c.points.penalty} per miss` : ', no penalty for misses'}`
        : 'Off',
    },
    {
      label: 'Hearts',
      value: c.hearts.on ? `${c.hearts.max}, lose one on any missed day, regain one on a perfect day` : 'Off',
    },
    { label: 'Levels', value: c.levels.on && c.points.on ? 'On, from lifetime points' : 'Off' },
    {
      label: 'Lucky bonus',
      value: c.lucky.on ? `${c.lucky.chance}% chance of +${c.lucky.bonus} on a goal` : 'Off',
    },
    { label: 'All-clear bonus', value: c.allClear.on ? `+${c.allClear.bonus} when every tracker hits` : 'Off' },
    { label: 'Custom rules', value: c.rules.length === 0 ? 'None yet' : `${c.rules.length} active` },
    { label: 'Reminders', value: 'Not built yet' },
  ];
  return rows;
}
