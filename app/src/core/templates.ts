// Templates are finished starting points: a shape (how it works) plus real names, fields, wording and plan.
// Picking one goes straight to the summary. There are many, they are searchable, and sharing adds more.
// Shapes are the few neutral ways a tracker can work; "Build your own" starts from one of those.

import { dayKeyOf } from './plan';
import { answersFromPreset, newGoal, type Answers } from './setup';
import { addDays, startOfDay } from './time';
import type { Field, PlanDay, Slot } from './types';

export type Category = 'Fitness' | 'Body' | 'Health' | 'Mind' | 'Habits' | 'Money' | 'Study' | 'Life';
export const CATEGORIES: Category[] = ['Habits', 'Fitness', 'Body', 'Mind', 'Health', 'Money', 'Study', 'Life'];
export const POPULAR_COUNT = 7; // the first this many by popularity sit under Popular on the start screen

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
export const TEMPLATE_TOOLS: Record<string, { countdown?: boolean; timer?: boolean; gps?: boolean; clock?: boolean; stock?: boolean; photos?: boolean }> = {
  'gym-split': { countdown: true },
  'full-body': { countdown: true },
  'workout-log': { countdown: true },
  stretching: { countdown: true, timer: true },
  meditate: { countdown: true, timer: true },
  study: { countdown: true, timer: true },
  practice: { countdown: true, timer: true },
  running: { gps: true },
  fasting: { clock: true },
  medication: { stock: true },
  journal: { photos: true },
  'weigh-in': { photos: true },
  vitamins: { stock: true },
  sleep: { clock: true }, // recording the run times it; the stopwatch is still in Tools for anyone who wants it
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

// Filled-in plans for the demo people in Settings, Developer only. Templates start empty (no sample content for real people).
export const DEMO_PLANS = (): Record<string, PlanDay[]> => ({
  'gym-split': [
    day('Push', [row('Bench Press', 4, '6-8'), row('Incline Dumbbell Press', 3, '8-10'), row('Overhead Press', 3, '8-10'), row('Lateral Raise', 3, '12-15'), row('Triceps Pushdown', 3, '10-12')]),
    day('Pull', [row('Pull-Up', 4, '6-10'), row('Barbell Row', 4, '8-10'), row('Lat Pulldown', 3, '10-12'), row('Face Pull', 3, '12-15'), row('Biceps Curl', 3, '10-12')]),
    day('Legs', [row('Squat', 4, '6-8'), row('Romanian Deadlift', 3, '8-10'), row('Leg Press', 3, '10-12'), row('Leg Curl', 3, '10-12'), row('Calf Raise', 4, '12-15')]),
  ],
  'full-body': [day('Full body', [row('Squat', 3, '5'), row('Bench Press', 3, '5'), row('Barbell Row', 3, '5'), row('Overhead Press', 3, '8'), row('Romanian Deadlift', 3, '8'), row('Plank', 3, '30-60s')])],
});

const ALL: Template[] = [
  // ---- Fitness ----
  T('gym-split', 'Gym split', 'barbell-outline', 'Fitness', 'Lifts by day, every set logged.', 'gym lifting weights strength push pull legs split workout hypertrophy', 'set-plan', () => ({
    chips: ['weight', 'reps'], schedule: { kind: 'weekdays', days: [1, 3, 5] }, samePlan: false, planMode: 'asigo', extras: { previous: true, lockPast: false, average: false, countdown: true },
  })),
  T('full-body', 'Full body', 'fitness-outline', 'Fitness', 'One list of lifts, every session.', 'gym lifting weights full body beginner strength 5x5 workout', 'set-plan', () => ({
    chips: ['weight', 'reps'], schedule: { kind: 'weekdays', days: [1, 3, 5] }, samePlan: true, planMode: 'asigo', extras: { previous: true, lockPast: false, average: false, countdown: true },
  })),
  T('running', 'Running', 'footsteps-outline', 'Fitness', 'Distance and time per run.', 'run running jog cardio distance pace miles km', 'time-blocks', { chips: ['distance', 'minutes'], combos: [{ id: 'pace', name: 'Pace', a: 'minutes', b: 'distance', fn: 'div' }], goal: 'none', goals: [], schedule: { kind: 'times', n: 3, per: 'week' }, extras: { previous: true, lockPast: false, average: false } }),
  T('steps', 'Steps', 'walk-outline', 'Fitness', 'Your steps, once a day.', 'steps walking walk daily movement pedometer', 'measurement', () => ({
    chips: [], custom: [num('steps', 'Steps', { step: 500, default: 6000 })], daily: true, extras: { previous: true, lockPast: false, average: true, auto: true },
    goal: 'none', goals: [],
  })),
  T('stretching', 'Stretching', 'body-outline', 'Fitness', 'What you stretched, how long.', 'stretch stretching mobility yoga flexibility', 'time-blocks', () => ({
    chips: [], custom: [named('what', 'Stretch'), duration('minutes', 'Time', { step: 5, default: 10 })], goal: 'none', goals: [],
    extras: { previous: true, lockPast: false, average: false, timer: true, timerInto: 'minutes' },
  })),

  // ---- Health ----
  T('mood', 'Mood', 'happy-outline', 'Mind', 'Rate your day and see the trend.', 'mood feeling happy sad emotion mental health wellbeing', 'measurement', () => ({
    chips: [], custom: [rating('mood', 'Mood'), multi('activities', 'What was going on', ['Work', 'Exercise', 'Friends', 'Family', 'Outside', 'Rest']), { ...note(), optional: true }], daily: true,
  })),
  T('sleep', 'Sleep', 'moon-outline', 'Mind', 'Bedtime, wake time, how it went.', 'sleep bed rest hours insomnia nap quality', 'measurement', () => ({
    chips: [], custom: [{ id: 'bed', name: 'Bedtime', type: 'time', default: 1380 }, { id: 'wake', name: 'Woke up', type: 'time', default: 420 }, rating('quality', 'Quality')], daily: true,
    combos: [{ id: 'slept', name: 'Hours slept', a: 'bed', b: 'wake', fn: 'span' }], extras: { previous: true, lockPast: false, average: false }, goal: 'none', goals: [],
  })),
  T('weigh-in', 'Weigh-in', 'scale-outline', 'Body', 'One weight a day, averaged.', 'weight weigh body scale bodyweight loss gain', 'measurement', { daily: true }),
  T('water', 'Water', 'water-outline', 'Body', 'Tap for each glass.', 'water drink hydration glasses', 'counter', { countUnit: 'glasses' }),
  T('medication', 'Medication', 'medkit-outline', 'Health', 'Tick off each med.', 'medication meds pills medicine prescription dose daily', 'checklist-totals', () => ({
    chips: [], planStyle: 'items' as const, goal: 'none', goals: [], extraTargets: [], extras: { previous: true, lockPast: false, average: false },
    schedule: { kind: 'daily' }, samePlan: true, planMode: 'asigo', terms: { item: 'Medication', row: 'Round', target: 'Target' },
  })),
  T('vitamins', 'Vitamins', 'nutrition-outline', 'Health', 'Tick off each vitamin.', 'vitamins supplements dose daily', 'checklist-totals', () => ({
    chips: [], planStyle: 'items' as const, goal: 'none', goals: [], extraTargets: [], extras: { previous: true, lockPast: false, average: false },
    schedule: { kind: 'daily' }, samePlan: true, planMode: 'asigo', terms: { item: 'Vitamin', row: 'Round', target: 'Target' },
  })),
  T('symptoms', 'Symptoms', 'thermometer-outline', 'Health', 'What happened and how bad.', 'symptoms headache migraine pain nausea illness health diary', 'time-blocks', () => ({
    chips: [], custom: [multi('symptom', 'Symptoms', ['Headache', 'Nausea', 'Fatigue', 'Pain', 'Other']), rating('severity', 'Severity', 10), note()], goal: 'none', goals: [], schedule: { kind: 'whenever' },
  })),
  T('pain', 'Pain level', 'bandage-outline', 'Health', 'Rate it from 1 to 10 each day.', 'pain injury rehab recovery back knee chronic', 'measurement', () => ({
    chips: [], custom: [rating('pain', 'Pain', 10)], daily: true,
  })),
  T('meals', 'Meal plan', 'restaurant-outline', 'Body', 'Your usual meals, ticked off.', 'meal plan meals prep food eat diet protein calories macros nutrition', 'checklist-totals', () => ({
    chips: [], planStyle: 'items' as const, goal: 'none', goals: [], extraTargets: [], extras: { previous: false, lockPast: false, average: false },
    samePlan: true, planMode: 'asigo', terms: { item: 'Meal', row: 'Round', target: 'Target' },
  })),

  // ---- Habits ----
  T('meditate', 'Meditate', 'flower-outline', 'Mind', 'Minutes sat, with a timer.', 'meditate meditation mindfulness calm breathe', 'measurement', () => ({
    chips: [], custom: [duration('minutes', 'Time', { default: 10, step: 5 }), rating('felt', 'How it felt')], daily: true, goal: 'none', goals: [],
    extras: { previous: true, lockPast: false, average: false, timer: true, timerInto: 'minutes' },
  })),
  T('habit', 'Daily habits', 'checkmark-circle-outline', 'Habits', 'Tick off each habit daily.', 'habit habits routine daily check list', 'checklist-totals', () => ({
    chips: [], planStyle: 'items' as const, goal: 'none', goals: [], extraTargets: [], extras: { previous: false, lockPast: false, average: false },
    schedule: { kind: 'daily' }, samePlan: true, planMode: 'asigo', terms: { item: 'Habit', row: 'Round', target: 'Target' },
  })),
  T('journal', 'Journal', 'journal-outline', 'Mind', 'A short note each day.', 'journal diary writing gratitude reflect notes', 'measurement', { chips: ['note'], daily: true, extras: { previous: false, lockPast: false, average: false } }),
  T('reading', 'Reading', 'book-outline', 'Habits', 'Minutes read each day.', 'read reading books pages study', 'time-blocks', () => ({
    chips: [], custom: [duration('minutes', 'Time read', { default: 25, step: 5 })], goal: 'none', goals: [],
    extras: { previous: true, lockPast: false, average: false, timer: true, timerInto: 'minutes' },
  })),
  T('no-alcohol', 'No alcohol', 'wine-outline', 'Habits', 'Days without a drink.', 'alcohol drinking quit sober avoid beer wine', 'check-in', { avoid: true }),
  T('quit-smoking', 'Quit smoking', 'ban-outline', 'Habits', 'Smoke-free days.', 'smoking cigarettes vape nicotine quit avoid addiction', 'check-in', { avoid: true }),
  T('no-scrolling', 'Less scrolling', 'phone-portrait-outline', 'Habits', 'Scroll-free days.', 'phone social media scrolling screen time avoid doomscroll', 'check-in', { avoid: true }),

  // ---- Money ----
  T('spending', 'Spending', 'wallet-outline', 'Money', 'Each purchase, by category.', 'spending money budget expenses purchases cash', 'time-blocks', () => ({
    chips: [], custom: [num('amount', 'Amount', { step: 5, default: 10, unit: '$' }), choice('category', 'Category', ['Food', 'Groceries', 'Transport', 'Bills', 'Fun', 'Shopping', 'Other']), note()], goal: 'none', goals: [], schedule: { kind: 'whenever' },
  })),
  T('savings', 'Savings', 'cash-outline', 'Money', 'Log what you put aside.', 'savings money save invest deposit', 'time-blocks', () => ({
    chips: [], custom: [num('saved', 'Saved', { step: 10, default: 20, unit: '$' })], goal: 'none', goals: [], schedule: { kind: 'whenever' },
  })),

  // ---- Study ----
  T('study', 'Study time', 'school-outline', 'Study', 'Subject and minutes, timed.', 'study homework class exam learning focus deep work', 'time-blocks', () => ({
    chips: [], custom: [named('what', 'Subject'), duration('minutes', 'Time', { step: 5, default: 30 })], goal: 'none', goals: [],
    extras: { previous: true, lockPast: false, average: false, timer: true, timerInto: 'minutes' },
  })),
  T('practice', 'Practice', 'musical-notes-outline', 'Study', 'Minutes, and what you practiced.', 'practice instrument piano guitar singing music skill', 'time-blocks', () => ({ chips: [], custom: [named('what', 'What'), duration('minutes', 'Time', { step: 5, default: 25 }), note()], goal: 'none', goals: [], extras: { previous: true, lockPast: false, average: false } })),
  T('language', 'Language', 'language-outline', 'Study', 'A short daily routine of rounds.', 'language spanish french vocabulary duolingo speaking listening learning', 'set-plan', () => ({
    chips: ['minutes'], combos: [], schedule: { kind: 'daily' }, samePlan: true, planMode: 'asigo', terms: { item: 'Skill', row: 'Round', target: 'Goal' },
  })),

  // ---- Life ----
  T('chores', 'Chores', 'home-outline', 'Life', 'A list to tick off each day.', 'chores cleaning house dishes laundry tidy household', 'checklist-totals', () => ({
    chips: [], planStyle: 'items' as const, goal: 'none', goals: [], extraTargets: [], extras: { previous: false, lockPast: false, average: false },
    samePlan: true, planMode: 'asigo',
  })),
  T('pet-care', 'Pet care', 'paw-outline', 'Life', 'Feed, walk, water, ticked off.', 'pet dog cat animal feed walk care', 'checklist-totals', () => ({
    chips: [], planStyle: 'items' as const, goal: 'none', goals: [], extraTargets: [], extras: { previous: false, lockPast: false, average: false },
    samePlan: true, planMode: 'asigo',
  })),
  T('plants', 'Plants', 'leaf-outline', 'Life', 'Tick off each plant.', 'plants garden water houseplants', 'checklist-totals', () => ({
    chips: [], planStyle: 'items' as const, goal: 'none', goals: [], extraTargets: [], extras: { previous: false, lockPast: false, average: false },
    samePlan: true, planMode: 'asigo', terms: { item: 'Plant', row: 'Round', target: 'Target' },
    schedule: { kind: 'weekdays', days: [0, 3] },
  })),

  // ---- Added to cover what people ask for ----
  T('food-log', 'Food log', 'fast-food-outline', 'Body', 'What you eat, calories, protein.', 'food eating diet calories protein macros log meals snack', 'time-blocks', () => ({
    chips: [], custom: [named('what', 'Food'), num('kcal', 'Calories', { unit: 'kcal', step: 50, default: 300 }), num('protein', 'Protein', { unit: 'g', step: 5, default: 20 })], goal: 'none', goals: [], schedule: { kind: 'daily' },
  })),
  T('workout-log', 'Workout log', 'flame-outline', 'Fitness', 'What, how long, how hard.', 'workout exercise cardio swim cycling bike class sport training hiit', 'time-blocks', () => ({
    chips: [], custom: [named('what', 'Activity'), duration('minutes', 'Time', { step: 5, default: 30 }), rating('effort', 'Effort', 10)], goal: 'none', goals: [], schedule: { kind: 'times', n: 3, per: 'week' }, extras: { previous: true, lockPast: false, average: false, timer: true, timerInto: 'minutes' },
  })),
  T('time-log', 'Time log', 'timer-outline', 'Life', 'Time spent per project.', 'time tracking hours project work focus billing task', 'time-blocks', () => ({
    chips: [], custom: [named('what', 'Project'), duration('minutes', 'Time', { step: 15, default: 60 }), note()], goal: 'none', goals: [], schedule: { kind: 'whenever' }, extras: { previous: true, lockPast: false, average: false, timer: true, timerInto: 'minutes' },
  })),
  T('blood-pressure', 'Blood pressure', 'heart-outline', 'Health', 'Top, bottom and pulse.', 'blood pressure bp hypertension systolic diastolic pulse heart rate', 'time-blocks', () => ({
    chips: [], custom: [num('top', 'Top (systolic)', { unit: 'mmHg', step: 1, default: 120, reading: true }), num('bottom', 'Bottom (diastolic)', { unit: 'mmHg', step: 1, default: 80, reading: true }), num('pulse', 'Pulse', { unit: 'bpm', step: 1, default: 70, reading: true }), note()], goal: 'none', goals: [], schedule: { kind: 'whenever' },
  })),
  T('blood-sugar', 'Blood sugar', 'pulse-outline', 'Health', 'A reading and when you took it.', 'blood sugar glucose diabetes mg dl reading insulin', 'time-blocks', () => ({
    chips: [], custom: [num('level', 'Level', { unit: 'mg/dL', step: 5, default: 100, reading: true }), choice('when', 'When', ['Fasting', 'Before meal', 'After meal', 'Bedtime']), note()], goal: 'none', goals: [], schedule: { kind: 'whenever' },
  })),
  T('caffeine', 'Caffeine', 'cafe-outline', 'Body', 'Tap for each cup.', 'caffeine coffee tea energy drink cups limit', 'counter', () => ({ countUnit: 'cups' })),
  T('cycle', 'Cycle', 'rose-outline', 'Health', 'Flow by day. No predictions.', 'period cycle menstrual flow spotting', 'time-blocks', () => ({
    chips: [], custom: [choice('flow', 'Flow', ['Spotting', 'Light', 'Medium', 'Heavy']), multi('symptoms', 'Symptoms', ['Cramps', 'Headache', 'Bloating', 'Fatigue', 'Mood swings']), note()], goal: 'none', goals: [], schedule: { kind: 'whenever' },
  })),
  T('fasting', 'Fasting', 'hourglass-outline', 'Body', 'Hours from last to first meal.', 'fasting intermittent fast eating window 16 8 hours', 'measurement', () => ({
    chips: [], custom: [{ id: 'last', name: 'Last meal', type: 'time', default: 1200 }, { id: 'first', name: 'First meal', type: 'time', default: 720 }],
    combos: [{ id: 'fast', name: 'Hours fasted', a: 'last', b: 'first', fn: 'span' }], daily: true, extras: { previous: true, lockPast: false, average: false },
    goal: 'none', goals: [],
  })),
  T('bills', 'Bills', 'receipt-outline', 'Money', 'Tick off each bill, monthly.', 'bills rent pay payment monthly subscription utilities due', 'checklist-totals', () => ({
    chips: [], planStyle: 'items' as const, goal: 'none', goals: [], extraTargets: [], extras: { previous: false, lockPast: false, average: false },
    samePlan: true, planMode: 'asigo', terms: { item: 'Bill', row: 'Round', target: 'Target' },
    schedule: { kind: 'monthly', day: 1 },
  })),
  T('balance', 'Balance', 'wallet-outline', 'Money', 'A balance, checked weekly.', 'balance net worth debt savings account bank loan', 'measurement', () => ({
    chips: [], custom: [{ ...num('balance', 'Balance', { unit: '$', step: 100, default: 0 }), reading: true }], daily: true, extras: { previous: true, lockPast: false, average: false },
    goal: 'none', goals: [], schedule: { kind: 'weekdays', days: [0] },
  })),
];

// The order people see, a rough guess at how many would want each, most first. It is deliberately one flat list: groups
// by category would let a rarely used template under a popular heading outrank a common one. Revisit with real picks
// from testers, and when sharing makes the list long enough to need structure.
// One ranking drives both Popular (the first POPULAR_COUNT) and the order inside every category, so the likeliest pick
// leads wherever you look. Broad, everyday trackers first; narrow or condition-specific ones later.
export const POPULARITY: string[] = [
  'habit', 'water', 'sleep', 'mood', 'weigh-in', 'gym-split', 'workout-log', 'steps', 'spending', 'reading', 'meditate',
  'running', 'journal', 'food-log', 'medication', 'savings', 'no-alcohol', 'quit-smoking', 'vitamins',
  'caffeine', 'study', 'fasting', 'full-body', 'stretching', 'no-scrolling', 'bills', 'language', 'practice', 'chores',
  'meals', 'blood-pressure', 'time-log', 'symptoms', 'cycle', 'pet-care', 'balance', 'blood-sugar', 'plants', 'pain',
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
  { id: 'check', name: 'Checklist', icon: 'checkmark-circle-outline', blurb: 'Things to tick off each day.', make: () => ({ ...answersFromPreset('blank'), name: '' }) },
  { id: 'avoid', name: 'Avoid something', icon: 'ban-outline', blurb: 'Log slips. Count clean days.', make: () => ({ ...answersFromPreset('check-in'), name: '', avoid: true }) },
  { id: 'counter', name: 'Counter', icon: 'add-circle-outline', blurb: 'Tap +1 toward a daily target.', make: () => ({ ...answersFromPreset('counter'), name: '' }) },
  { id: 'daily', name: 'Daily value', icon: 'today-outline', blurb: 'One reading a day: a weight, a mood, a time.', make: () => ({ ...answersFromPreset('measurement'), name: '', chips: [], custom: [num('value', 'Value')], daily: true, extras: { previous: true, lockPast: false, average: false } }) },
  { id: 'log', name: 'Log', icon: 'stats-chart-outline', blurb: 'Entries that add up: minutes, spending.', make: () => ({ ...answersFromPreset('time-blocks'), name: '' }) },
  { id: 'planned', name: 'Planned list', icon: 'list-outline', blurb: 'A list for each day, ticked off as you go.', make: () => ({ ...answersFromPreset('set-plan'), name: '', chips: [], combos: [], schedule: { kind: 'daily' }, planMode: 'asigo', samePlan: false, terms: { item: 'Item', row: 'Round', target: 'Target' } }) },
];
