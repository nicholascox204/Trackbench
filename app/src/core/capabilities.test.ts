import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPick, joinPicks, picksOf, showPicks, togglePick, cleanOption } from './choices';
import { dayResult } from './derive';
import { goalProgress } from './goals';
import { computeDay } from './measures';
import { expectedOn } from './measures';
import { scheduleText } from './schedule';
import { answersFromPreset, answersFromTracker, draftFromAnswers, summaryLines, type Answers, type Combo } from './setup';
import { TEMPLATES } from './templates';
import { formatFieldValue, formatMeasure, measureToDisplay } from './units';
import type { Entry, Field, Settings, Tracker } from './types';

const imperial: Settings = { units: 'imperial' };
const metric: Settings = { units: 'metric' };
const day = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();
const make = (a: Answers, s: Settings = imperial): Tracker => ({ ...draftFromAnswers(a, s), id: 't', systemId: null, createdAt: day(2026, 1, 1) });
const tpl = (id: string): Answers => (TEMPLATES.find((t) => t.id === id) as (typeof TEMPLATES)[number]).make();
const entry = (values: Entry['values'], at = day(2026, 11, 17) + 9 * 3600000): Entry => ({ id: String(Math.random()), trackerId: 't', at, done: true, values });
const field = (id: string, name: string, type: Field['type'] = 'number', extra: Partial<Field> = {}): Field => ({ id, name, type, step: 1, default: 0, ...extra });
const withCombo = (fields: Field[], combo: Combo): Answers => ({ ...answersFromPreset('blank'), record: 'numbers', log: 'free', custom: fields, combos: [combo] });
const measure = (t: Tracker, es: Entry[], id: string): number => computeDay(t, es, null)[id];

test('the hours between two times, across midnight, added up over the day', () => {
  const t = make(withCombo([field('bed', 'Bedtime', 'time'), field('wake', 'Wake up', 'time')], { id: 'slept', name: 'Slept', a: 'bed', b: 'wake', fn: 'span' }));
  assert.equal(measure(t, [entry({ bed: 23 * 60, wake: 7 * 60 })], 'slept'), 8);
  assert.equal(measure(t, [entry({ bed: 22 * 60 + 30, wake: 6 * 60 })], 'slept'), 7.5);
  assert.equal(measure(t, [entry({ bed: 13 * 60, wake: 14 * 60 }), entry({ bed: 20 * 60, wake: 21 * 60 })], 'slept'), 2, 'two spans on one day');
  assert.equal(measure(t, [entry({ bed: 23 * 60 })], 'slept'), 0, 'an entry missing a time is left out');
  assert.equal(formatMeasure(t, t.measures.find((m) => m.id === 'slept')!, 7.5, imperial), '7.5 h');
});

test('adding and subtracting two numbers, entry by entry', () => {
  const fields = [field('in', 'In', 'number', { unit: 'kcal' }), field('out', 'Out', 'number', { unit: 'kcal' })];
  const sub = make(withCombo(fields, { id: 'net', name: 'Net', a: 'in', b: 'out', fn: 'sub' }));
  assert.equal(measure(sub, [entry({ in: 500, out: 200 }), entry({ in: 300, out: 400 })], 'net'), 200, 'the second entry is a deficit of 100');
  const add = make(withCombo(fields, { id: 'both', name: 'Both', a: 'in', b: 'out', fn: 'add' }));
  assert.equal(measure(add, [entry({ in: 500, out: 200 })], 'both'), 700);
  assert.equal(formatMeasure(sub, sub.measures.find((m) => m.id === 'net')!, 200, imperial), '200 kcal', 'it takes the first number\'s unit');
});

test('a ratio is the day\'s total over the day\'s total, never a sum of ratios, and never divides by nothing', () => {
  const t = make(withCombo([field('min', 'Minutes', 'number', { unit: 'min' }), field('pages', 'Pages')], { id: 'rate', name: 'Minutes per page', a: 'min', b: 'pages', fn: 'div' }));
  assert.equal(measure(t, [entry({ min: 30, pages: 10 }), entry({ min: 30, pages: 20 })], 'rate'), 2);
  assert.equal(measure(t, [entry({ min: 30, pages: 0 })], 'rate'), 0);
  assert.equal(measure(t, [], 'rate'), 0);
});

test('pace follows the person\'s distance unit', () => {
  const t = make(tpl('running'), imperial);
  const pace = t.measures.find((m) => m.id === 'pace')!;
  assert.equal(pace.calc.op, 'ratio');
  const six = measure(t, [entry({ minutes: 30, distance: 5 })], 'pace'); // 30 minutes over 5 km, stored in kilometres
  assert.equal(six, 6);
  assert.ok(Math.abs(measureToDisplay(t, pace, six, imperial) - 9.656) < 0.01, 'about 9.7 minutes a mile');
  assert.equal(measureToDisplay(t, pace, six, metric), 6);
  assert.equal(formatMeasure(t, pace, six, metric), '6:00 /km', 'pace reads as minutes and seconds');
  assert.match(formatMeasure(t, pace, six, imperial), /^9:\d\d \/mi$/);
});

test('picking more than one option is stored in one string and read back whole', () => {
  assert.deepEqual(picksOf('Headache|Nausea'), ['Headache', 'Nausea']);
  assert.equal(togglePick('Headache', 'Nausea'), 'Headache|Nausea');
  assert.equal(togglePick('Headache|Nausea', 'Headache'), 'Nausea');
  assert.equal(togglePick(undefined, 'Pain'), 'Pain');
  assert.equal(showPicks('Headache|Nausea'), 'Headache, Nausea');
  assert.equal(joinPicks([]), '');
  assert.equal(cleanOption('A|B'), 'A B', 'an option cannot contain the separator');
  assert.ok(hasPick('Headache|Nausea', 'nausea', true));
  assert.ok(!hasPick('Headache|Nausea', 'Pain', true));
  assert.ok(hasPick('Run', 'run', false) && !hasPick('Run|Swim', 'Run', false), 'a single choice must match exactly');
  const f = field('s', 'Symptoms', 'choice', { multi: true, options: ['Headache', 'Nausea'] });
  assert.equal(formatFieldValue(f, 'Headache|Nausea', imperial), 'Headache, Nausea');
});

test('a goal can count the entries where any one of several picks is a given option', () => {
  const t = make(tpl('symptoms'));
  const fid = t.fields[0].id;
  assert.equal(t.fields[0].multi, true);
  const today = day(2026, 11, 18);
  const es = [entry({ [fid]: 'Headache|Nausea', severity: 5 }, day(2026, 11, 16) + 9e6), entry({ [fid]: 'Fatigue', severity: 3 }, day(2026, 11, 17) + 9e6), entry({ [fid]: 'Nausea', severity: 4 }, day(2026, 11, 18) + 9e6)];
  const g = { id: 'g', measure: 'count', agg: 'count' as const, how: 'week' as const, cmp: 'min' as const, value: 2, from: '2026-01-01', where: { field: fid, equals: 'Nausea' } };
  const p = goalProgress({ ...t, goals: [g] }, g, es, today, imperial, 'mon');
  assert.equal(p.value, 2, 'headache-and-nausea counts, fatigue does not');
});

test('a counter can add more than one and say what it counts', () => {
  const ml = make({ ...answersFromPreset('counter'), countStep: 250, countUnit: 'ml', goal: 'number', goals: [{ id: 'g0', measure: 'count', cmp: 'min', value: 2000, value2: 2000 }] });
  assert.equal(ml.input, 'tap');
  assert.equal(ml.fields[0].unit, 'ml');
  assert.equal(ml.targets[0].measure, 'n', 'a goal on the count is a goal on the amount');
  const eight = Array.from({ length: 8 }, () => entry({ n: 250 }));
  assert.equal(measure(ml, eight, 'n'), 2000);
  assert.equal(measure(ml, eight, 'count'), 8, 'the number of taps is still there');
  assert.equal(dayResult(ml, eight, day(2026, 11, 17)).success, true);
  assert.equal(dayResult(ml, eight.slice(0, 7), day(2026, 11, 17)).success, false);
  const back = answersFromTracker(ml, imperial, false);
  assert.equal(back.countStep, 250);
  assert.equal(back.countUnit, 'ml');
  assert.equal(back.custom.length, 0, 'the amount is a setting, not a thing entered');
  assert.equal(summaryLines(back, imperial).find((l) => l.label === 'You log')?.value, 'Tap to count, 250 at a time (ml), at least 2000 a day');
});

test('a plain counter is unchanged, and water now counts glasses', () => {
  const plain = make(answersFromPreset('counter'));
  assert.deepEqual(plain.fields, []);
  assert.equal(plain.primaryMeasure, 'count');
  const water = make(tpl('water'));
  assert.equal(water.fields[0].unit, 'glasses');
  assert.equal(measure(water, Array.from({ length: 3 }, () => entry({ n: 1 })), 'n'), 3);
  assert.equal(water.targets.length, 0, 'a starting point sets no goal');
});

test('fasting: the hours between the last meal and the first', () => {
  const t = make(tpl('fasting'));
  assert.equal(measure(t, [entry({ last: 20 * 60, first: 12 * 60 })], 'fast'), 16);
  assert.equal(measure(t, [entry({ last: 21 * 60, first: 9 * 60 })], 'fast'), 12);
  assert.equal(dayResult(t, [entry({ last: 20 * 60, first: 12 * 60 })], day(2026, 11, 17)).success, true, 'a day counts when it is logged');
});

test('a 30-day challenge is only active for thirty days', () => {
  const t = make(tpl('challenge'));
  assert.ok(t.window?.from && t.window?.until);
  const from = new Date(`${t.window!.from}T00:00:00`).getTime();
  const last = new Date(`${t.window!.until}T00:00:00`).getTime();
  assert.equal(Math.round((last - from) / 86400000), 29, 'thirty days counting both ends');
  assert.ok(expectedOn({ ...t, createdAt: from }, from));
  assert.ok(expectedOn({ ...t, createdAt: from }, last));
  assert.ok(!expectedOn({ ...t, createdAt: from }, last + 86400000), 'it ends');
  assert.match(scheduleText(t.schedule!, t.window), /^Every day, \d+ \w+ to \d+ \w+$/);
});

test('the other starting points that use the new abilities build soundly', () => {
  for (const id of ['mood', 'cycle', 'symptoms', 'caffeine', 'running']) {
    const t = make(tpl(id));
    assert.ok(t.fields.length > 0 || t.input === 'tap', id);
  }
  assert.equal(make(tpl('mood')).fields.find((f) => f.id === 'activities')?.multi, true);
  assert.equal(make(tpl('cycle')).fields.find((f) => f.id === 'symptoms')?.multi, true);
  assert.equal(make(tpl('caffeine')).fields[0].unit, 'cups');
});

test('a tracker that runs for a while says where it is, and that it has ended', () => {
  const { windowNote } = require('./schedule') as typeof import('./schedule');
  const w = { from: '2026-11-10', until: '2026-12-09' };
  assert.equal(windowNote(undefined, day(2026, 11, 17)), '');
  assert.equal(windowNote(w, day(2026, 11, 5)), 'Starts on 10 Nov.');
  assert.equal(windowNote(w, day(2026, 11, 17)), 'Runs until 9 Dec. 22 days left.');
  assert.equal(windowNote(w, day(2026, 12, 9)), 'Runs until 9 Dec. Last day.');
  assert.equal(windowNote(w, day(2026, 12, 10)), 'Finished on 9 Dec.');
  assert.equal(windowNote({ from: '2026-11-10' }, day(2026, 11, 17)), 'Started on 10 Nov.');
});
