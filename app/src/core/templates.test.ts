import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { cleanDays } from './derive';
import { trackerSuccess } from './measures';
import { draftFromAnswers, stepsFor } from './setup';
import { CATEGORIES, SHAPES, TEMPLATES, searchTemplates } from './templates';
import { addDays, startOfDay } from './time';
import { formatFieldValue, formatTime } from './units';
import type { Entry, Tracker } from './types';

const require = createRequire(import.meta.url);
const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json') as Record<string, number>;
const imperial = { units: 'imperial' as const };
const asTracker = (d: ReturnType<typeof draftFromAnswers>): Tracker => ({ ...d, id: 't', systemId: null, createdAt: 0 });

test('every template builds a sound tracker', () => {
  assert.ok(TEMPLATES.length >= 25);
  const ids = new Set<string>();
  for (const tp of TEMPLATES) {
    assert.ok(!ids.has(tp.id), `duplicate id ${tp.id}`);
    ids.add(tp.id);
    assert.ok(CATEGORIES.includes(tp.category), tp.id);
    assert.ok(glyphs[tp.icon] !== undefined, `${tp.id} icon ${tp.icon}`);
    const a = tp.make();
    assert.deepEqual(stepsFor(a, false), ['start', 'summary'], tp.id);
    const d = draftFromAnswers(a, imperial);
    assert.ok(d.name.trim().length > 0, tp.id);
    assert.equal(new Set(d.fields.map((f) => f.id)).size, d.fields.length, `${tp.id} field ids`);
    for (const tg of d.targets) assert.ok(d.measures.some((m) => m.id === tg.measure) || tg.measure === 'count', `${tp.id} target ${tg.measure}`);
    // a plan starts empty: you enter your own (no example lists, decided 2026-11-26)
    if (d.input === 'plan') {
      assert.ok(d.plan[0].days.every((x) => x.slots.length === 0), `${tp.id} starts empty`);
    }
  }
});

test('shapes start without a name and are named on the summary', () => {
  for (const sh of SHAPES) {
    const a = sh.make();
    assert.equal(a.name, '');
    assert.deepEqual(stepsFor(a, false), ['start', 'summary'], sh.id);
    draftFromAnswers({ ...a, name: 'x' }, imperial);
  }
});

test('search finds what people type', () => {
  const find = (q: string) => searchTemplates(q).map((t) => t.id);
  assert.ok(find('sleep').includes('sleep'));
  assert.ok(find('gym').includes('gym-split'));
  assert.ok(find('smoking').includes('quit-smoking'));
  assert.ok(find('budget').includes('spending'));
  assert.ok(find('mood').includes('mood'));
  assert.equal(find('xyzzy').length, 0);
  assert.ok(searchTemplates('', 'Money').every((t) => t.category === 'Money'));
});

test('rating, choice and time fields become readings; daily is one reading a day', () => {
  const sleep = draftFromAnswers(TEMPLATES.find((t) => t.id === 'sleep')!.make(), imperial);
  assert.equal(sleep.daily, true);
  assert.equal(sleep.measures.filter((m) => m.calc.op === 'latest').length, 3);
  const symptoms = draftFromAnswers(TEMPLATES.find((t) => t.id === 'symptoms')!.make(), imperial);
  assert.ok(symptoms.fields.some((f) => f.type === 'choice' && (f.options?.length ?? 0) > 1));
  assert.equal(symptoms.daily, undefined);
  assert.equal(formatTime(450), '7:30 AM');
  assert.equal(formatTime(0), '12:00 AM');
  assert.equal(formatTime(13 * 60), '1:00 PM');
  assert.equal(formatFieldValue({ id: 'm', name: 'Mood', type: 'rating', max: 5 }, 4, imperial), '4/5');
});

test('avoiding something: nothing logged is a good day, and days clean count from the last slip', () => {
  const d = draftFromAnswers(TEMPLATES.find((t) => t.id === 'quit-smoking')!.make(), imperial);
  assert.equal(d.avoid, true);
  assert.equal(d.success.mode, 'clean');
  const t = asTracker(d);
  assert.equal(trackerSuccess(t, { done: 0 }), true);
  assert.equal(trackerSuccess(t, { done: 1 }), false);
  const base = startOfDay(1_700_000_000_000);
  const tr = { ...t, createdAt: base };
  const slip: Entry = { id: 'e', trackerId: 't', at: addDays(base, 10) + 3600000, done: true, values: {} };
  assert.equal(cleanDays(tr, [], addDays(base, 5)), 5);
  assert.equal(cleanDays(tr, [slip], addDays(base, 12)), 2);
  assert.equal(cleanDays(tr, [slip], addDays(base, 10)), 0);
});

test('units can be chosen for one tracker, and its goals follow the change', async () => {
  const { answersFromTracker, changeUnits, newGoal, summaryLines } = await import('./setup');
  const { fieldUnit } = await import('./units');
  const base = { ...TEMPLATES.find((t) => t.id === 'weigh-in')!.make(), goal: 'number' as const, goals: [newGoal('weight', 'min', 150)] };
  const d0 = draftFromAnswers(base, imperial);
  assert.equal(fieldUnit(d0.fields[0], imperial), 'lb'); // follows the app default
  assert.equal(d0.fields[0].unitOverride, undefined);

  const metric = changeUnits(base, 'metric', imperial);
  const d1 = draftFromAnswers(metric, imperial);
  assert.equal(d1.fields[0].unitOverride, 'kg');
  assert.equal(fieldUnit(d1.fields[0], imperial), 'kg'); // this tracker is metric even though the app is imperial
  assert.ok(Math.abs(metric.goals[0].value - 68.04) < 0.05); // 150 lb is about 68 kg, not 150 kg
  // the stored target is the same weight either way
  assert.ok(Math.abs((d1.targets[0].min as number) - (d0.targets[0].min as number)) < 0.01);

  const back = answersFromTracker({ ...d1, id: 't', systemId: null, createdAt: 0 }, imperial, false);
  assert.equal(back.units, 'metric');
  assert.ok(summaryLines(metric, imperial).some((l) => l.step === 'options' && l.value.includes('kg')));
  assert.equal(summaryLines(draftlessCheck(), imperial).find((l) => l.step === 'options')?.value, 'Editable');
  assert.equal(summaryLines(base, imperial).find((l) => l.step === 'options')?.value, 'Editable, lb', 'the units in use are named, even when they follow the default');
});

function draftlessCheck() {
  return TEMPLATES.find((t) => t.id === 'plants')!.make(); // no unit fields, so no Units line
}

test('every template has a place in the popularity order', async () => {
  const { POPULARITY, TEMPLATES } = await import('./templates');
  for (const t of TEMPLATES) assert.ok(POPULARITY.includes(t.id), t.id + ' is not in POPULARITY');
  for (const id of POPULARITY) assert.ok(TEMPLATES.some((t) => t.id === id), id + ' is ranked but does not exist');
  assert.equal(new Set(POPULARITY).size, POPULARITY.length);
});

test('Daily habits is a list of habits ticked each day, starting empty and named for what it is', () => {
  const a = TEMPLATES.find((t) => t.id === 'habit')!.make();
  assert.equal(a.name, 'Daily habits');
  assert.equal(a.planStyle, 'items');
  assert.equal(a.samePlan, true);
  assert.equal(a.terms?.item, 'Habit');
  assert.deepEqual(a.schedule, { kind: 'daily' });
  assert.equal(a.sample, undefined, 'it starts with no habits in it');
});
