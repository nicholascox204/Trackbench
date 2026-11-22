// Motivation: the rules a game applies to goals and days, and the plain words for them. Presets are only saved
// settings of the same fields a person can edit, so there is no separate "simple mode".

import { defaultConfig } from './engine';
import { describeGoal } from './goals';
import { describeQuest } from './quests';
import type { AlertKind, AlertSettings, Payout, Settings, System, SystemConfig, Tracker } from './types';

export interface MotivationPreset {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  make: () => SystemConfig;
}

const off = (): SystemConfig => ({
  ...defaultConfig('gentle'),
  consistency: 'none',
  points: { on: false, reward: 10, penalty: 0 },
  hearts: { on: false, max: 3 },
  levels: { on: false },
  allClear: { on: false, bonus: 10 },
  alerts: { on: { reminders: false, warnings: false, cheers: false } },
});

// Styles to start from, from a light touch to a strong push. Each is only a saved setting of the same fields a person can edit,
// alerts included, so choosing one never locks anything: every part can be changed afterwards.
export const MOTIVATION_PRESETS: MotivationPreset[] = [
  { id: 'off', name: 'Goals only', icon: 'flag-outline', blurb: 'Targets and milestones. No score or alerts.', make: off },
  { id: 'light', name: 'Gentle', icon: 'leaf-outline', blurb: 'Points, no penalty. One reminder a day.', make: () => ({ ...defaultConfig('gentle'), consistency: 'grace', week: { on: true, minPct: 60 }, alerts: { on: { reminders: true, warnings: false, cheers: false } } }) },
  { id: 'standard', name: 'Steady', icon: 'trophy-outline', blurb: 'Points and levels. A few nudges a day.', make: () => ({ ...defaultConfig('standard'), week: { on: true, minPct: 80 }, alerts: { on: { reminders: true, warnings: false, cheers: true } } }) },
  { id: 'streaks', name: 'Streaks only', icon: 'flame-outline', blurb: 'Just the chain. Reminders and warnings.', make: () => ({ ...off(), consistency: 'strict', alerts: { on: { reminders: true, warnings: true, cheers: false } } }) },
  { id: 'strict', name: 'Strict', icon: 'heart-outline', blurb: 'Hearts and penalties. Plenty of nudges.', make: () => ({ ...defaultConfig('hardcore'), consistency: 'strict', week: { on: true, minPct: 100 }, hearts: { on: true, max: 3, loseOn: 'any', regain: true }, alerts: { on: { reminders: true, warnings: true, cheers: true } } }) },
];

export const presetOf = (c: SystemConfig): string => {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return MOTIVATION_PRESETS.find((p) => same(p.make(), c))?.id ?? 'custom';
};

// A goal's payout, in words, with the game's blanket default filled in.
export function payText(pay: Payout | undefined, config: SystemConfig): string {
  const p = { ...config.defaultPay, ...pay };
  const parts: string[] = [];
  parts.push(config.points.on ? (p.reward !== undefined ? `+${p.reward} points when met` : 'points when met') : 'nothing when met');
  const cost: string[] = [];
  if (config.points.on && p.penalty) cost.push(`lose ${p.penalty} points`);
  if (config.hearts.on && p.heart) cost.push('lose a heart');
  parts.push(cost.length ? `${cost.join(' and ')} if missed` : 'nothing if missed');
  return parts.join('; ');
}

// One row per goal a game holds, whichever kind it is.
export interface GoalRow {
  key: string;
  kind: 'tracker' | 'game';
  id: string;
  trackerId?: string;
  title: string;
  pay?: Payout;
}

export function allGoals(system: System, inSystem: Tracker[], settings: Settings): GoalRow[] {
  const rows: GoalRow[] = [];
  for (const q of system.quests ?? []) rows.push({ key: `q:${q.id}`, kind: 'game', id: q.id, title: describeQuest(q, inSystem), pay: q.pay });
  for (const t of inSystem) for (const g of t.goals ?? []) rows.push({ key: `${t.id}:${g.id}`, kind: 'tracker', id: g.id, trackerId: t.id, title: `${t.name}: ${describeGoal(t, g, settings)}`, pay: g.pay });
  return rows;
}

export const ALERT_KINDS: { id: AlertKind; name: string; blurb: string }[] = [
  { id: 'reminders', name: 'Reminders', blurb: 'A tracker is due today and not logged yet.' },
  { id: 'warnings', name: 'Warnings', blurb: 'A streak, heart or goal is about to be lost.' },
  { id: 'cheers', name: 'Cheers', blurb: 'A goal was met or a level reached.' },
];

export const defaultAlerts = (): AlertSettings => ({ on: { reminders: false, warnings: false, cheers: false } });

export function alertsText(a: AlertSettings | undefined): string {
  const on = ALERT_KINDS.filter((k) => a?.on[k.id]).map((k) => k.name.toLowerCase());
  return on.length ? on.join(', ').replace(/^[a-z]/, (m) => m.toUpperCase()) : 'Off';
}

// The rows of a game's summary: what each part is set to, in words.
export const weekText = (c: SystemConfig): string => (c.week?.on ? `A good week: ${c.week.minPct >= 100 ? 'every day' : `${c.week.minPct}% of days`} hit` : 'Good days only');

export function gameRows(c: SystemConfig): { key: 'goals' | 'points' | 'levels' | 'hearts' | 'streaks' | 'alerts' | 'rewards'; label: string; value: string }[] {
  const streak: Record<SystemConfig['consistency'], string> = { none: 'Off', strict: 'Strict: any miss starts it over', grace: 'Forgiving: one missed day is allowed', score: 'Habit score' };
  const loseOn = { any: 'any tracker missed', half: 'half missed', all: 'all missed' }[c.hearts.loseOn ?? 'any'];
  return [
    { key: 'goals', label: 'Goals', value: weekText(c) },
    { key: 'points', label: 'Points', value: c.points.on ? `+${c.points.reward} per goal met${c.points.penalty ? `, -${c.points.penalty} per miss` : ', nothing lost for a miss'}${c.allClear.on ? ', clear-day bonus' : ''}` : 'Off' },
    { key: 'levels', label: 'Levels', value: c.levels.on && c.points.on ? `A step every ${c.levels.perLevel ?? 25} points, growing` : 'Off' },
    { key: 'hearts', label: 'Hearts', value: c.hearts.on ? `${c.hearts.max}, lose one when ${loseOn}${c.hearts.regain === false ? '' : ', win back on a clear day'}` : 'Off' },
    { key: 'streaks', label: 'Streaks', value: streak[c.consistency] },
    { key: 'alerts', label: 'Alerts', value: alertsText(c.alerts) },
    { key: 'rewards', label: 'Goal rewards', value: payText(undefined, c).replace('points when met', 'scaled by length').replace(/^\w/, (m) => m.toUpperCase()) },
  ];
}
