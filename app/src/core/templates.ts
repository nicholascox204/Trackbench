// Templates are finished starting points: a shape (how it works) plus real names, fields, wording and plan.
// Picking one goes straight to the summary. There are many, they are searchable, and sharing adds more.
// Shapes are the few neutral ways a tracker can work; "Build your own" starts from one of those.

import { dayKeyOf } from './plan';
import { answersFromPreset, newGoal, type Answers } from './setup';
import { addDays, startOfDay } from './time';
import type { Field, PlanDay, Slot } from './types';

export type Category = 'Fitness' | 'Health' | 'Habits' | 'Money' | 'Study' | 'Life';
export const CATEGORIES: Category[] = ['Fitness', 'Health', 'Habits', 'Money', 'Study', 'Life'];

export interface Template {
  id: string;
  name: string;
  icon: string;
  category: Category;
  blurb: string;
  keywords: string;
  make: () => Answers;
}

const sid = (): string => Math.random().toString(36).slice(2, 8);
const row = (name: string, sets: number, range: string): Slot => ({ id: sid(), name, sets, range });
const item = (name: string, group?: string, values?: Record<string, number>): Slot => ({ id: sid(), name, ...(group ? { group } : {}), ...(values ? { values } : {}) });
const day = (label: string, slots: Slot[]): PlanDay => ({ label, slots });

const num = (id: string, name: string, extra: Partial<Field> = {}): Field => ({ id, name, type: 'number', step: 1, default: 0, ...extra });
// Hours and minutes, held as whole minutes.
const duration = (id: string, name: string, extra: Partial<Field> = {}): Field => ({ id, name, type: 'duration', unit: 'min', default: 0, ...extra });
const rating = (id: string, name: string, max = 5): Field => ({ id, name, type: 'rating', max });
const choice = (id: string, name: string, options: string[]): Field => ({ id, name, type: 'choice', options });
const multi = (id: string, name: string, options: string[]): Field => ({ id, name, type: 'choice', options, multi: true });
const note = (): Field => ({ id: 'note', name: 'Note', type: 'text', default: '' });
// A name for each entry (what it was), with suggestions from names already used.
const named = (id: string, name: string): Field => ({ id, name, type: 'text', label: true });

// Which starting points switch on the Countdown (a set time, like a rest between sets) or the Timer (counts up, like a session).
// Any custom tracker can switch the same two on in Extras; nothing here is only reachable from a template.
export const TEMPLATE_TOOLS: Record<string, { countdown?: boolean; timer?: boolean; gps?: boolean }> = {
  'gym-split': { countdown: true },
  'full-body': { countdown: true },
  'workout-log': { countdown: true },
  stretching: { countdown: true, timer: true },
  meditate: { countdown: true, timer: true },
  study: { countdown: true, timer: true },
  practice: { countdown: true, timer: true },
  running: { gps: true }, // recording the run times it; the stopwatch is still in Tools for anyone who wants it
  reading: { timer: true },
  language: { timer: true },
  'time-log': { timer: true },
};

function T(
  id: string, name: string, icon: string, category: Category, blurb: string, keywords: string, base: string, patch: Partial<Answers> | (() => Partial<Answers>) = {},
): Template {
  return {
    id, name, icon, category, blurb, keywords,
    make: () => {
      const a = { ...answersFromPreset(base), name, icon, templateId: id, ...(typeof patch === 'function' ? patch() : patch) };
      if (!TEMPLATE_TOOLS[id]) return a;
      const extras = { ...a.extras, ...TEMPLATE_TOOLS[id] };
      return { ...a, extras: extras.countdown && extras.timerInto ? { ...extras, countdownInto: extras.timerInto } : extras }; // a countdown fills the same field the timer does
    },
  };
}

const ALL: Template[] = [
  // ---- Fitness ----
  T('gym-split', 'Gym split', 'barbell-outline', 'Fitness', 'Plan lifts by day and log every set.', 'gym lifting weights strength push pull legs split workout hypertrophy', 'set-plan', () => ({
    chips: ['weight', 'reps'], schedule: { kind: 'weekdays', days: [1, 3, 5] }, samePlan: false, finishPlan: true, planMode: 'asigo', extras: { previous: true, lockPast: false, average: false, countdown: true },
    sample: [
      day('Push', [row('Bench Press', 4, '6-8'), row('Incline Dumbbell Press', 3, '8-10'), row('Overhead Press', 3, '8-10'), row('Lateral Raise', 3, '12-15'), row('Triceps Pushdown', 3, '10-12')]),
      day('Pull', [row('Pull-Up', 4, '6-10'), row('Barbell Row', 4, '8-10'), row('Lat Pulldown', 3, '10-12'), row('Face Pull', 3, '12-15'), row('Biceps Curl', 3, '10-12')]),
      day('Legs', [row('Squat', 4, '6-8'), row('Romanian Deadlift', 3, '8-10'), row('Leg Press', 3, '10-12'), row('Leg Curl', 3, '10-12'), row('Calf Raise', 4, '12-15')]),
    ],
  })),
  T('full-body', 'Full body', 'fitness-outline', 'Fitness', 'The same list of lifts on each training day.', 'gym lifting weights full body beginner strength 5x5 workout', 'set-plan', () => ({
    chips: ['weight', 'reps'], schedule: { kind: 'weekdays', days: [1, 3, 5] }, samePlan: true, finishPlan: true, planMode: 'asigo', extras: { previous: true, lockPast: false, average: false, countdown: true },
    sample: [day('Full body', [row('Squat', 3, '5'), row('Bench Press', 3, '5'), row('Barbell Row', 3, '5'), row('Overhead Press', 3, '8'), row('Romanian Deadlift', 3, '8'), row('Plank', 3, '30-60s')])],
  })),
  T('running', 'Running', 'footsteps-outline', 'Fitness', 'Log distance and time for each run.', 'run running jog cardio distance pace miles km', 'time-blocks', { chips: ['distance', 'minutes'], combos: [{ id: 'pace', name: 'Pace', a: 'minutes', b: 'distance', fn: 'div' }], goal: 'none', goals: [], schedule: { kind: 'times', n: 3, per: 'week' }, extras: { previous: true, lockPast: false, average: false } }),
  T('steps', 'Steps', 'walk-outline', 'Fitness', 'Your steps, once a day.', 'steps walking walk daily movement pedometer', 'measurement', () => ({
    chips: [], custom: [num('steps', 'Steps', { step: 500, default: 6000 })], daily: true, extras: { previous: true, lockPast: false, average: true, auto: true },
    goal: 'none', goals: [],
  })),
  T('stretching', 'Stretching', 'body-outline', 'Fitness', 'What you stretched and for how long.', 'stretch stretching mobility yoga flexibility', 'time-blocks', () => ({
    chips: [], custom: [named('what', 'Stretch'), duration('minutes', 'Time', { step: 5, default: 10 })], goal: 'none', goals: [],
    extras: { previous: true, lockPast: false, average: false, timer: true, timerInto: 'minutes' },
  })),

  // ---- Health ----
  T('mood', 'Mood', 'happy-outline', 'Health', 'Tap a rating once a day and watch the trend.', 'mood feeling happy sad emotion mental health wellbeing', 'measurement', () => ({
    chips: [], custom: [rating('mood', 'Mood'), multi('activities', 'What was going on', ['Work', 'Exercise', 'Friends', 'Family', 'Outside', 'Rest']), { ...note(), optional: true }], daily: true,
  })),
  T('sleep', 'Sleep', 'moon-outline', 'Health', 'Bedtime, wake time and how well you slept.', 'sleep bed rest hours insomnia nap quality', 'measurement', () => ({
    chips: [], custom: [{ id: 'bed', name: 'Bedtime', type: 'time', default: 1380 }, { id: 'wake', name: 'Woke up', type: 'time', default: 420 }, rating('quality', 'Quality')], daily: true,
    combos: [{ id: 'slept', name: 'Hours slept', a: 'bed', b: 'wake', fn: 'span' }], extras: { previous: true, lockPast: false, average: false }, goal: 'none', goals: [],
  })),
  T('weigh-in', 'Weigh-in', 'scale-outline', 'Health', 'One weight a day with a rolling average.', 'weight weigh body scale bodyweight loss gain', 'measurement', { daily: true }),
  T('water', 'Water', 'water-outline', 'Health', 'Tap for each glass.', 'water drink hydration glasses', 'counter', { countUnit: 'glasses' }),
  T('medication', 'Medication', 'medkit-outline', 'Health', 'List your meds and tick each one off.', 'medication meds pills medicine prescription dose daily', 'checklist-totals', () => ({
    chips: [], planStyle: 'items' as const, goal: 'none', goals: [], extraTargets: [], extras: { previous: true, lockPast: false, average: false },
    schedule: { kind: 'daily' }, samePlan: true, planMode: 'asigo', terms: { item: 'Medication', row: 'Round', target: 'Target' },
  })),
  T('vitamins', 'Vitamins', 'nutrition-outline', 'Health', 'List your vitamins and tick each one off.', 'vitamins supplements dose daily', 'checklist-totals', () => ({
    chips: [], planStyle: 'items' as const, goal: 'none', goals: [], extraTargets: [], extras: { previous: true, lockPast: false, average: false },
    schedule: { kind: 'daily' }, samePlan: true, planMode: 'asigo', terms: { item: 'Vitamin', row: 'Round', target: 'Target' },
  })),
  T('symptoms', 'Symptoms', 'thermometer-outline', 'Health', 'Log what happened, how bad, and a note.', 'symptoms headache migraine pain nausea illness health diary', 'time-blocks', () => ({
    chips: [], custom: [multi('symptom', 'Symptoms', ['Headache', 'Nausea', 'Fatigue', 'Pain', 'Other']), rating('severity', 'Severity', 10), note()], goal: 'none', goals: [], schedule: { kind: 'whenever' },
  })),
  T('pain', 'Pain level', 'bandage-outline', 'Health', 'Rate it from 1 to 10 each day.', 'pain injury rehab recovery back knee chronic', 'measurement', () => ({
    chips: [], custom: [rating('pain', 'Pain', 10)], daily: true,
  })),
  T('meals', 'Meal plan', 'restaurant-outline', 'Health', 'Your usual meals, ticked off as you eat.', 'meal plan meals prep food eat diet protein calories macros nutrition', 'checklist-totals'),

  // ---- Habits ----
  T('meditate', 'Meditate', 'flower-outline', 'Habits', 'How long you sat each day, with a timer.', 'meditate meditation mindfulness calm breathe', 'measurement', () => ({
    chips: [], custom: [duration('minutes', 'Time', { default: 10, step: 5 }), rating('felt', 'How it felt')], daily: true, goal: 'none', goals: [],
    extras: { previous: true, lockPast: false, average: false, timer: true, timerInto: 'minutes' },
  })),
  T('habit', 'Daily habits', 'checkmark-circle-outline', 'Habits', 'List your habits and tick each one off.', 'habit habits routine daily check list', 'checklist-totals', () => ({
    chips: [], planStyle: 'items' as const, goal: 'none', goals: [], extraTargets: [], extras: { previous: false, lockPast: false, average: false },
    schedule: { kind: 'daily' }, samePlan: true, planMode: 'asigo', terms: { item: 'Habit', row: 'Round', target: 'Target' },
  })),
  T('journal', 'Journal', 'journal-outline', 'Habits', 'A short note each day.', 'journal diary writing gratitude reflect notes', 'measurement', { chips: ['note'], daily: true, extras: { previous: false, lockPast: false, average: false } }),
  T('reading', 'Reading', 'book-outline', 'Habits', 'Minutes read each day.', 'read reading books pages study', 'time-blocks', () => ({
    chips: [], custom: [duration('minutes', 'Time read', { default: 25, step: 5 })], goal: 'none', goals: [],
    extras: { previous: true, lockPast: false, average: false, timer: true, timerInto: 'minutes' },
  })),
  T('no-alcohol', 'No alcohol', 'wine-outline', 'Habits', 'Count days without a drink. Log slips.', 'alcohol drinking quit sober avoid beer wine', 'check-in', { avoid: true }),
  T('quit-smoking', 'Quit smoking', 'ban-outline', 'Habits', 'Count smoke-free days. Log slips.', 'smoking cigarettes vape nicotine quit avoid addiction', 'check-in', { avoid: true }),
  T('no-scrolling', 'Less scrolling', 'phone-portrait-outline', 'Habits', 'Count scroll-free days. Log slips.', 'phone social media scrolling screen time avoid doomscroll', 'check-in', { avoid: true }),

  // ---- Money ----
  T('spending', 'Spending', 'wallet-outline', 'Money', 'Amount, category and a note per purchase.', 'spending money budget expenses purchases cash', 'time-blocks', () => ({
    chips: [], custom: [num('amount', 'Amount', { step: 5, default: 10, unit: '$' }), choice('category', 'Category', ['Food', 'Groceries', 'Transport', 'Bills', 'Fun', 'Shopping', 'Other']), note()], goal: 'none', goals: [], schedule: { kind: 'whenever' },
  })),
  T('savings', 'Savings', 'cash-outline', 'Money', 'Log what you put aside.', 'savings money save invest deposit', 'time-blocks', () => ({
    chips: [], custom: [num('saved', 'Saved', { step: 10, default: 20, unit: '$' })], goal: 'none', goals: [], schedule: { kind: 'whenever' },
  })),

  // ---- Study ----
  T('study', 'Study time', 'school-outline', 'Study', 'Subject and minutes, with a timer.', 'study homework class exam learning focus deep work', 'time-blocks', () => ({
    chips: [], custom: [named('what', 'Subject'), duration('minutes', 'Time', { step: 5, default: 30 })], goal: 'none', goals: [],
    extras: { previous: true, lockPast: false, average: false, timer: true, timerInto: 'minutes' },
  })),
  T('practice', 'Practice', 'musical-notes-outline', 'Study', 'Minutes, and what you practiced.', 'practice instrument piano guitar singing music skill', 'time-blocks', () => ({ chips: [], custom: [named('what', 'What'), duration('minutes', 'Time', { step: 5, default: 25 }), note()], goal: 'none', goals: [], extras: { previous: true, lockPast: false, average: false } })),
  T('language', 'Language', 'language-outline', 'Study', 'A short daily routine of rounds.', 'language spanish french vocabulary duolingo speaking listening learning', 'set-plan', () => ({
    chips: ['minutes'], combos: [], schedule: { kind: 'daily' }, samePlan: true, planMode: 'asigo', terms: { item: 'Skill', row: 'Round', target: 'Goal' },
    sample: [day('Daily practice', [row('Vocabulary', 3, '20 words'), row('Listening', 2, '10 min'), row('Speaking', 2, '5 min')])],
  })),

  // ---- Life ----
  T('chores', 'Chores', 'home-outline', 'Life', 'A list to tick off each day.', 'chores cleaning house dishes laundry tidy household', 'checklist-totals', () => ({
    chips: [], planStyle: 'items' as const, goal: 'none', goals: [], extraTargets: [], extras: { previous: false, lockPast: false, average: false },
    samePlan: true, planMode: 'asigo',
    sample: [day('Chores', [item('Dishes'), item('Tidy up'), item('Laundry'), item('Take out trash')])],
  })),
  T('pet-care', 'Pet care', 'paw-outline', 'Life', 'Feed, walk and water, ticked off daily.', 'pet dog cat animal feed walk care', 'checklist-totals', () => ({
    chips: [], planStyle: 'items' as const, goal: 'none', goals: [], extraTargets: [], extras: { previous: false, lockPast: false, average: false },
    samePlan: true, planMode: 'asigo',
    sample: [day('Pet care', [item('Morning feed'), item('Walk'), item('Fresh water'), item('Evening feed')])],
  })),
  T('plants', 'Plants', 'leaf-outline', 'Life', 'Tick off each watering, Wed and Sun.', 'plants garden water houseplants', 'check-in', { schedule: { kind: 'weekdays', days: [0, 3] } }),

  // ---- Added to cover what people ask for ----
  T('food-log', 'Food log', 'fast-food-outline', 'Health', 'Log what you eat, with calories and protein.', 'food eating diet calories protein macros log meals snack', 'time-blocks', () => ({
    chips: [], custom: [named('what', 'Food'), num('kcal', 'Calories', { unit: 'kcal', step: 50, default: 300 }), num('protein', 'Protein', { unit: 'g', step: 5, default: 20 })], goal: 'none', goals: [], schedule: { kind: 'daily' },
  })),
  T('workout-log', 'Workout log', 'flame-outline', 'Fitness', 'Any workout: what, how long, how hard.', 'workout exercise cardio swim cycling bike class sport training hiit', 'time-blocks', () => ({
    chips: [], custom: [named('what', 'Activity'), duration('minutes', 'Time', { step: 5, default: 30 }), rating('effort', 'Effort', 10)], goal: 'none', goals: [], schedule: { kind: 'times', n: 3, per: 'week' }, extras: { previous: true, lockPast: false, average: false, timer: true, timerInto: 'minutes' },
  })),
  T('time-log', 'Time log', 'timer-outline', 'Life', 'Log time spent on a project or task.', 'time tracking hours project work focus billing task', 'time-blocks', () => ({
    chips: [], custom: [named('what', 'Project'), duration('minutes', 'Time', { step: 15, default: 60 }), note()], goal: 'none', goals: [], schedule: { kind: 'whenever' }, extras: { previous: true, lockPast: false, average: false, timer: true, timerInto: 'minutes' },
  })),
  T('blood-pressure', 'Blood pressure', 'heart-outline', 'Health', 'Top and bottom number, and pulse.', 'blood pressure bp hypertension systolic diastolic pulse heart rate', 'time-blocks', () => ({
    chips: [], custom: [num('top', 'Top (systolic)', { unit: 'mmHg', step: 1, default: 120, reading: true }), num('bottom', 'Bottom (diastolic)', { unit: 'mmHg', step: 1, default: 80, reading: true }), num('pulse', 'Pulse', { unit: 'bpm', step: 1, default: 70, reading: true }), note()], goal: 'none', goals: [], schedule: { kind: 'whenever' },
  })),
  T('blood-sugar', 'Blood sugar', 'pulse-outline', 'Health', 'A reading and when you took it.', 'blood sugar glucose diabetes mg dl reading insulin', 'time-blocks', () => ({
    chips: [], custom: [num('level', 'Level', { unit: 'mg/dL', step: 5, default: 100, reading: true }), choice('when', 'When', ['Fasting', 'Before meal', 'After meal', 'Bedtime']), note()], goal: 'none', goals: [], schedule: { kind: 'whenever' },
  })),
  T('caffeine', 'Caffeine', 'cafe-outline', 'Health', 'Tap for each cup.', 'caffeine coffee tea energy drink cups limit', 'counter', () => ({ countUnit: 'cups', goal: 'number', goals: [{ id: 'limit', measure: 'count', cmp: 'max', value: 4, value2: 4 }] })), // a starting limit, not advice: change or clear it in setup
  T('cycle', 'Cycle', 'rose-outline', 'Health', 'Log flow by day. It does not predict.', 'period cycle menstrual flow spotting', 'time-blocks', () => ({
    chips: [], custom: [choice('flow', 'Flow', ['Spotting', 'Light', 'Medium', 'Heavy']), multi('symptoms', 'Symptoms', ['Cramps', 'Headache', 'Bloating', 'Fatigue', 'Mood swings']), note()], goal: 'none', goals: [], schedule: { kind: 'whenever' },
  })),
  T('fasting', 'Fasting', 'hourglass-outline', 'Health', 'Last meal to first meal, in hours.', 'fasting intermittent fast eating window 16 8 hours', 'measurement', () => ({
    chips: [], custom: [{ id: 'last', name: 'Last meal', type: 'time', default: 1200 }, { id: 'first', name: 'First meal', type: 'time', default: 720 }],
    combos: [{ id: 'fast', name: 'Hours fasted', a: 'last', b: 'first', fn: 'span' }], daily: true, extras: { previous: true, lockPast: false, average: false },
    goal: 'none', goals: [],
  })),
  T('challenge', '30-day challenge', 'trophy-outline', 'Habits', 'A daily tick for 30 days, then it ends.', 'challenge 30 day streak sprint cold shower no sugar reset', 'check-in', () => ({
    window: { from: dayKeyOf(startOfDay(Date.now())), until: dayKeyOf(addDays(startOfDay(Date.now()), 29)) },
  })),
  T('bills', 'Bills', 'receipt-outline', 'Money', 'Tick it off when paid, once a month.', 'bills rent pay payment monthly subscription utilities due', 'check-in', { schedule: { kind: 'monthly', day: 1 } }),
  T('balance', 'Balance', 'wallet-outline', 'Money', 'A weekly balance: savings, debt, an account.', 'balance net worth debt savings account bank loan', 'measurement', () => ({
    chips: [], custom: [{ ...num('balance', 'Balance', { unit: '$', step: 100, default: 0 }), reading: true }], daily: true, extras: { previous: true, lockPast: false, average: false },
    goal: 'none', goals: [], schedule: { kind: 'weekdays', days: [0] },
  })),
];

// The order people see, a rough guess at how many would want each, most first. It is deliberately one flat list: groups
// by category would let a rarely used template under a popular heading outrank a common one. Revisit with real picks
// from testers, and when sharing makes the list long enough to need structure.
export const POPULARITY: string[] = [
  'habit', 'gym-split', 'water', 'sleep', 'mood', 'weigh-in', 'steps', 'reading', 'running', 'workout-log', 'meditate',
  'spending', 'food-log', 'study', 'journal', 'full-body', 'meals', 'medication', 'stretching', 'vitamins', 'no-alcohol', 'caffeine',
  'no-scrolling', 'quit-smoking', 'savings', 'bills', 'balance', 'time-log', 'practice', 'chores', 'language', 'pet-care', 'plants',
  'blood-pressure', 'blood-sugar', 'symptoms', 'pain', 'cycle', 'fasting', 'challenge',
];
const rank = (id: string): number => { const i = POPULARITY.indexOf(id); return i < 0 ? 999 : i; };
export const TEMPLATES: Template[] = [...ALL].sort((a, b) => rank(a.id) - rank(b.id));

// Search by name, keywords or description. Every word typed must match the start of a word.
export function searchTemplates(query: string, category: Category | 'All' = 'All'): Template[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return TEMPLATES.filter((t) => {
    if (category !== 'All' && t.category !== category) return false;
    const hay = `${t.name} ${t.keywords} ${t.blurb}`.toLowerCase().split(/[^a-z0-9]+/);
    return words.every((w) => hay.some((h) => h.startsWith(w) || (w.length >= 4 && w.startsWith(h) && h.length >= 4)));
  });
}

// The few neutral ways a tracker can work, for "Build your own".
export interface Shape { id: string; name: string; icon: string; blurb: string; make: () => Answers }
export const SHAPES: Shape[] = [
  { id: 'check', name: 'Check-in', icon: 'checkmark-circle-outline', blurb: 'Done or not, once a day.', make: () => ({ ...answersFromPreset('check-in'), name: '' }) },
  { id: 'avoid', name: 'Avoid something', icon: 'ban-outline', blurb: 'Log slips. Count clean days.', make: () => ({ ...answersFromPreset('check-in'), name: '', avoid: true }) },
  { id: 'counter', name: 'Counter', icon: 'add-circle-outline', blurb: 'Tap +1 toward a daily target.', make: () => ({ ...answersFromPreset('counter'), name: '' }) },
  { id: 'daily', name: 'Daily value', icon: 'today-outline', blurb: 'One reading a day: a weight, a mood, a time.', make: () => ({ ...answersFromPreset('measurement'), name: '', chips: [], custom: [num('value', 'Value')], daily: true, extras: { previous: true, lockPast: false, average: false } }) },
  { id: 'log', name: 'Log', icon: 'stats-chart-outline', blurb: 'Entries that add up: minutes, spending.', make: () => ({ ...answersFromPreset('time-blocks'), name: '' }) },
  { id: 'planned', name: 'Planned list', icon: 'list-outline', blurb: 'A list for each day, ticked off as you go.', make: () => ({ ...answersFromPreset('set-plan'), name: '', chips: [], combos: [], schedule: { kind: 'daily' }, planMode: 'asigo', samePlan: false, terms: { item: 'Item', row: 'Round', target: 'Target' } }) },
];
