// Nick's own gym and nutrition plan (from his Fitness Tracker), written as
// configuration of the universal tracker. Used by tests to prove the model can
// reproduce his tracker, and by a developer button to load it on a device.

import { dayKeyOf } from '../core/plan';
import type { PlanDay, Slot, TrackerDraft } from '../core/types';

const LB = 0.45359237;

function ex(id: string, name: string, sets: number, range: string): Slot {
  return { id, name, sets, range };
}

function day(label: string, slots: Slot[]): PlanDay {
  return { label, slots };
}

export function nickGym(): TrackerDraft {
  const days: PlanDay[] = [
    { label: '', slots: [] }, // Sunday
    day('Push A - Chest Primary', [
      ex('bench', 'Barbell Bench Press', 4, '6-8'),
      ex('incdb', 'Incline DB Press', 4, '8-10'),
      ex('lowfly', 'Low to High Cable Fly', 3, '12-15'),
      ex('sdbp', 'Seated DB Shoulder Press', 3, '10-12'),
      ex('lat1', 'Cable Lateral Raise', 3, '15-20'),
      ex('pushd', 'Tricep Pushdown', 3, '12-15'),
      ex('hang1', 'Dead Hang', 2, '30-60s'),
    ]),
    day('Pull A - Back Width', [
      ex('wpu', 'Weighted Pull-Ups', 4, '6-8'),
      ex('lpd', 'Lat Pulldown Wide Grip', 3, '10-12'),
      ex('clr', 'Cable Low Row', 3, '10-12'),
      ex('fp1', 'Cable Face Pulls', 3, '15-20'),
      ex('ezc', 'EZ Bar Curl', 3, '10-12'),
      ex('chc', 'Cable Hammer Curl', 3, '12-15'),
      ex('hang2', 'Dead Hang', 2, '30-60s'),
    ]),
    day('Lower A - Quad Dominant', [
      ex('squat', 'Barbell Back Squat', 4, '6-8'),
      ex('lp1', 'Leg Press Standard Stance', 3, '10-12'),
      ex('rdl', 'Romanian Deadlift', 3, '10-12'),
      ex('lext', 'Leg Extension', 3, '12-15'),
      ex('calf1', 'Seated Calf Raise', 4, '15-20'),
    ]),
    day('Push B - Shoulder Focus', [
      ex('ohp', 'Overhead Barbell Press', 4, '6-8'),
      ex('dips', 'Assisted Dips', 3, '10-12'),
      ex('fly2', 'Cable Fly Mid', 3, '12-15'),
      ex('lat2', 'Cable Lateral Raise', 3, '15-20'),
      ex('rear', 'Single Arm Rear Delt Fly', 3, '15-20'),
      ex('ohte', 'Overhead Cable Tricep Extension', 3, '12-15'),
      ex('hang3', 'Dead Hang', 2, '30-60s'),
    ]),
    day('Pull B - Thickness + Arms', [
      ex('clr2', 'Cable Low Row', 4, '8-10'),
      ex('lpd2', 'Lat Pulldown Wide Grip', 3, '10-12'),
      ex('sap', 'Straight Arm Pulldown', 3, '12-15'),
      ex('ezc2', 'EZ Bar Curl', 3, '10-12'),
      ex('idc', 'Incline DB Curl', 3, '12-15'),
      ex('fp2', 'Cable Face Pulls', 3, '15-20'),
      ex('hang4', 'Dead Hang', 2, '30-60s'),
    ]),
    day('Lower B - Posterior Chain', [
      ex('dl', 'Conventional Deadlift', 4, '4-6'),
      ex('slc', 'Seated Leg Curl', 3, '10-12'),
      ex('lp2', 'Leg Press High/Wide Stance', 3, '10-12'),
      ex('abm', 'Weighted Ab Machine', 3, '12-15'),
      ex('calf2', 'Seated Calf Raise', 4, '15-20'),
    ]),
  ];
  return {
    name: 'Workout',
    icon: 'barbell-outline',
    presetId: 'set-plan',
    input: 'plan',
    fields: [
      { id: 'weight', name: 'Weight', type: 'number', unitKind: 'weight', default: 45 * LB },
      { id: 'reps', name: 'Reps', type: 'number', step: 1, default: 8 },
    ],
    measures: [
      { id: 'sets', name: 'Sets', calc: { op: 'count' } },
      { id: 'volume', name: 'Volume', calc: { op: 'sumProduct', a: 'weight', b: 'reps' }, unitFrom: 'weight' },
    ],
    primaryMeasure: 'volume',
    targets: [],
    derived: [],
    success: { mode: 'plan', minPct: 80 },
    planStyle: 'sets',
    terms: { item: 'Exercise', row: 'Set', target: 'Range' },
    plan: [{ from: dayKeyOf(Date.now()), days }],
    tools: { previous: true, lockPast: true },
  };
}

export function nickNutrition(): TrackerDraft {
  const food = (
    id: string, group: string, name: string, protein: number, kcal: number,
    variants?: { label: string; protein: number; kcal: number }[],
  ): Slot => ({
    id, name, group, values: { protein, kcal },
    variants: variants?.map((v) => ({ label: v.label, values: { protein: v.protein, kcal: v.kcal } })),
  });
  const meals = (): PlanDay => ({
    label: '',
    slots: [
      food('e1', '11am Pre-workout', '5 large eggs', 30, 350),
      food('e2', '11am Pre-workout', '1 slice white bread', 3, 85),
      food('p1', '1:30pm Post-workout', '200g chicken or beef', 44, 340, [
        { label: 'Chicken', protein: 46, kcal: 330 },
        { label: 'Beef', protein: 42, kcal: 350 },
      ]),
      food('p2', '1:30pm Post-workout', '200g cooked rice', 9, 378),
      food('a1', '4pm Afternoon', '250g Greek yogurt', 24, 196),
      food('a2', '4pm Afternoon', 'Citrus fruit', 1, 80),
      food('d1', '5:30pm Dinner', '275g chicken or beef', 60, 454, [
        { label: 'Chicken', protein: 63, kcal: 454 },
        { label: 'Beef', protein: 58, kcal: 481 },
      ]),
      food('n1', '8:30pm Evening', 'Protein bar', 19, 180),
    ],
  });
  return {
    name: 'Nutrition',
    icon: 'restaurant-outline',
    presetId: 'checklist-totals',
    input: 'plan',
    fields: [
      { id: 'protein', name: 'Protein', type: 'number', unit: 'g', step: 5 },
      { id: 'kcal', name: 'Calories', type: 'number', unit: 'kcal', step: 50 },
    ],
    measures: [
      { id: 'protein', name: 'Protein', calc: { op: 'sum', field: 'protein' } },
      { id: 'kcal', name: 'Calories', calc: { op: 'sum', field: 'kcal' } },
    ],
    primaryMeasure: 'protein',
    targets: [
      { id: 't-protein', measure: 'protein', min: 195 },
      { id: 't-kcal', measure: 'kcal', max: 2000 },
    ],
    derived: [],
    success: { mode: 'target', targetId: 't-protein' },
    plan: [{ from: dayKeyOf(Date.now()), days: [0, 1, 2, 3, 4, 5, 6].map(meals) }],
    tools: { previous: false, lockPast: true },
  };
}

export function nickWeight(): TrackerDraft {
  return {
    name: 'Morning weight',
    icon: 'scale-outline',
    presetId: 'measurement',
    input: 'form',
    fields: [{ id: 'weight', name: 'Weight', type: 'number', unitKind: 'weight', default: 80, reading: true }],
    measures: [{ id: 'weight', name: 'Weight', calc: { op: 'latest', field: 'weight' } }],
    primaryMeasure: 'weight',
    targets: [],
    derived: [{ id: 'avg3', name: '3-day average', measure: 'weight', days: 3 }],
    success: { mode: 'logged' },
    plan: [],
    tools: { previous: true, lockPast: true },
  };
}
