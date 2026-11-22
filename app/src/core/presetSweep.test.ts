// A sweep over every starting point, to find problems before anyone taps through them: distinct descriptions, sound fields,
// and that opening a tracker's setup and saving it without a change does not change the tracker or its shared structure.
import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleOf } from './schedule';
import { answersFromTracker, draftFromAnswers } from './setup';
import { TEMPLATES } from './templates';
import { exportStructure, parseStructure } from './transfer';
import type { Settings, Tracker } from './types';

const SETTINGS: Settings = { units: 'imperial' };
const build = (id: string): Tracker => {
  const tp = TEMPLATES.find((x) => x.id === id);
  assert.ok(tp);
  return { ...draftFromAnswers(tp.make(), SETTINGS), id: 't', systemId: null, createdAt: 0 };
};
const rawShape = (t: Pick<Tracker, 'input' | 'fields' | 'measures' | 'targets' | 'success' | 'tools' | 'planStyle' | 'terms' | 'daily' | 'plan' | 'schedule' | 'window'>) => ({
  input: t.input,
  fields: t.fields.map((f) => ({ ...f })),
  measures: t.measures.map((m) => ({ id: m.id, name: m.name, calc: m.calc })),
  targets: t.targets,
  success: t.success,
  tools: t.tools,
  planStyle: t.planStyle,
  terms: t.terms,
  daily: !!t.daily,
  schedule: scheduleOf(t as Tracker),
  window: t.window ?? null,
  sharedList: t.plan.some((v) => v.same),
});
// A key that is undefined and a key that is missing are the same thing once it has been written out and read back.
const shape = (t: Parameters<typeof rawShape>[0]) => JSON.parse(JSON.stringify(rawShape(t)));

test('no two starting points share a description, or a name', () => {
  const blurbs = new Map<string, string>();
  const names = new Map<string, string>();
  for (const tp of TEMPLATES) {
    assert.ok(!blurbs.has(tp.blurb), `${tp.id} and ${blurbs.get(tp.blurb)} share "${tp.blurb}"`);
    assert.ok(!names.has(tp.name.toLowerCase()), `${tp.id} and ${names.get(tp.name.toLowerCase())} share the name ${tp.name}`);
    blurbs.set(tp.blurb, tp.id);
    names.set(tp.name.toLowerCase(), tp.id);
  }
});

test('Practice keeps a note for what was worked on; Study time is a subject and minutes only', () => {
  assert.ok(build('practice').fields.some((f) => f.type === 'text' && !f.label), 'a note');
  assert.ok(build('study').fields.some((f) => f.label), 'Study time names its subject');
  assert.ok(!build('study').fields.some((f) => f.type === 'text' && !f.label), 'and has no note');
});

test('every field is sound: named, unique, with sensible options and limits', () => {
  for (const tp of TEMPLATES) {
    const t = build(tp.id);
    const ids = new Set<string>();
    for (const f of t.fields) {
      assert.ok(f.name.trim(), `${tp.id}: a field has no name`);
      assert.ok(!ids.has(f.id), `${tp.id}: duplicate field id ${f.id}`);
      ids.add(f.id);
      if (f.type === 'choice' && (f.options ?? []).length > 0) assert.ok((f.options ?? []).length >= 2, `${tp.id}: ${f.name} has fewer than two options`);
      if (f.type === 'rating') assert.ok((f.max ?? 0) >= 3, `${tp.id}: ${f.name} rating too small`);
      if (f.type === 'number') assert.ok(Number.isFinite(f.default ?? 0), `${tp.id}: ${f.name} default`);
    }
    assert.ok(t.fields.filter((f) => f.label).length <= 1, `${tp.id}: more than one named field`);
    for (const m of t.measures) {
      const c = m.calc as Record<string, unknown>;
      for (const k of ['field', 'a', 'b']) if (typeof c[k] === 'string') assert.ok(ids.has(c[k] as string), `${tp.id}: measure ${m.id} uses missing field ${String(c[k])}`);
    }
    for (const g of t.targets) assert.ok(t.measures.some((m) => m.id === g.measure) || g.measure === 'count', `${tp.id}: a target on missing ${g.measure}`);
  }
});

test('opening setup and saving with no change leaves the tracker as it was', () => {
  for (const tp of TEMPLATES) {
    const t = build(tp.id);
    const again = { ...draftFromAnswers(answersFromTracker(t, SETTINGS, false), SETTINGS, t), id: 't', systemId: null, createdAt: 0 } as Tracker;
    assert.deepEqual(shape(again), shape(t), `${tp.id}: setup round trip changed it`);
    assert.deepEqual(scheduleOf(again), scheduleOf(t), `${tp.id}: schedule changed`);
  }
});

test('a shared structure comes back the same', () => {
  for (const tp of TEMPLATES) {
    const t = build(tp.id);
    const parsed = parseStructure(exportStructure(t));
    assert.ok(parsed.ok, `${tp.id}: could not read its own export`);
    if (!parsed.ok) continue;
    assert.deepEqual(shape(parsed.value as Tracker), shape(t), `${tp.id}: export and import changed it`);
  }
});

test('Sleep records hours and minutes, and its timer fills them', () => {
  const t = build('sleep');
  const f = t.fields.find((x) => x.id === 'slept');
  assert.equal(f?.type, 'duration');
  assert.equal(t.tools.timer, true);
  assert.equal(t.tools.timerInto, 'slept');
  assert.equal(t.measures.find((m) => m.id === 'slept')?.calc.op, 'latest');
});

test('the timer only fills a Duration field on a form, never a planned tracker', () => {
  const gym = build('gym-split');
  assert.equal(gym.tools.timerInto, undefined);
  const base = answersFromTracker(build('sleep'), SETTINGS, false);
  const onPlan = draftFromAnswers({ ...base, record: 'numbers', log: 'plan', extras: { ...base.extras, timer: true, timerInto: 'slept' } }, SETTINGS);
  assert.equal(onPlan.tools.timerInto, undefined, 'a plan has no single field to fill');
  const noField = draftFromAnswers({ ...base, extras: { ...base.extras, timer: true, timerInto: 'quality' } }, SETTINGS);
  assert.equal(noField.tools.timerInto, undefined, 'only a Duration can be filled');
});

test('a countdown alone can fill a Duration field too', () => {
  const base = answersFromTracker(build('sleep'), SETTINGS, false);
  const only = draftFromAnswers({ ...base, extras: { ...base.extras, timer: false, countdown: true, countdownInto: 'slept' } }, SETTINGS);
  assert.equal(only.tools.countdownInto, 'slept'); assert.equal(only.tools.timerInto, undefined);
  const neither = draftFromAnswers({ ...base, extras: { ...base.extras, timer: false, countdown: false, timerInto: 'slept', countdownInto: 'slept' } }, SETTINGS);
  assert.equal(neither.tools.countdownInto, undefined);
});
