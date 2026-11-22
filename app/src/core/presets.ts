// Starting points are only labels and sample content. They hold no tracker structure of their own: what a
// tracker records and how it counts is built by the same answers (core/setup.ts) that "Start from scratch"
// uses. A starting point contributes a default name and icon, a blurb, and optionally a sample plan.

import type { PlanDay, Slot } from './types';

export interface Preset {
  id: string;
  name: string; // what the card is called
  icon: string;
  blurb: string;
  examples: string[];
  title: string; // the default name of a tracker started from it
  trackerIcon: string;
  sample?: () => PlanDay[]; // a ready-made plan, only the days that have something on them
}

const rows = (name: string, sets: number, range: string, id: string): Slot => ({ id, name, sets, range });

const trainingSample = (): PlanDay[] => [
  { label: 'Day A', slots: [rows('Exercise 1', 3, '8-10', 'a1'), rows('Exercise 2', 3, '8-10', 'a2'), rows('Exercise 3', 3, '10-12', 'a3')] },
  { label: 'Day B', slots: [rows('Exercise 1', 3, '8-10', 'b1'), rows('Exercise 2', 3, '8-10', 'b2'), rows('Exercise 3', 3, '10-12', 'b3')] },
  { label: 'Day C', slots: [rows('Exercise 1', 3, '8-10', 'c1'), rows('Exercise 2', 3, '8-10', 'c2'), rows('Exercise 3', 3, '10-12', 'c3')] },
];

const checklistSample = (): PlanDay[] => [{
  label: '',
  slots: [
    { id: 'm1', name: 'Item 1', values: { protein: 40, kcal: 400 } },
    { id: 'm2', name: 'Item 2', values: { protein: 45, kcal: 600 } },
    { id: 'm3', name: 'Item 3', values: { protein: 45, kcal: 700 } },
  ],
}];

export const PRESETS: Preset[] = [
  { id: 'set-plan', name: 'Weekly plan with sets', icon: 'clipboard-outline', blurb: 'Plan each day, log every set.', examples: ['Lifting', 'Bodyweight', 'Rehab', 'Climbing', 'Swim sets'], title: 'Training', trackerIcon: 'barbell-outline', sample: trainingSample },
  { id: 'checklist-totals', name: 'Checklist with totals', icon: 'restaurant-outline', blurb: 'Tick items off, totals add up.', examples: ['Meals and protein', 'Supplements', 'Medication', 'Budget', 'Packing'], title: 'Daily plan', trackerIcon: 'restaurant-outline', sample: checklistSample },
  { id: 'measurement', name: 'Measurement', icon: 'stats-chart-outline', blurb: 'Log a number, watch the trend.', examples: ['Body weight', 'Sleep hours', 'Mood', 'Blood pressure', 'Resting heart rate'], title: 'Body weight', trackerIcon: 'scale-outline' },
  { id: 'time-blocks', name: 'Time blocks', icon: 'timer-outline', blurb: 'Log sessions toward a daily total.', examples: ['Study', 'Instrument practice', 'Deep work', 'Reading', 'Cardio'], title: 'Study', trackerIcon: 'book-outline' },
  { id: 'counter', name: 'Counter', icon: 'apps-outline', blurb: 'Tap for each one, toward a daily target.', examples: ['Glasses of water', 'Pages read', 'Cigarettes avoided', 'Push-ups', 'Coffees'], title: 'Water', trackerIcon: 'water-outline' },
  { id: 'check-in', name: 'Check-in', icon: 'checkmark-circle-outline', blurb: 'Done or not, once a day.', examples: ['Meditate', 'Take vitamins', 'Make the bed', 'No alcohol', 'Call a friend'], title: 'Habit', trackerIcon: 'checkmark-circle-outline' },
  { id: 'blank', name: 'Blank tracker', icon: 'apps-outline', blurb: 'Nothing chosen for you.', examples: [], title: 'New tracker', trackerIcon: 'apps-outline' },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

