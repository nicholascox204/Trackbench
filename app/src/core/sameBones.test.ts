import assert from 'node:assert/strict';
import test from 'node:test';
import { nickGym, nickNutrition, nickWeight } from '../fixtures/nick';
import { answersFromTracker, draftFromAnswers } from './setup';
import { SHAPES, TEMPLATES } from './templates';
import type { Tracker, TrackerDraft } from './types';

// The rule: there is no such thing as a truly unique preset. Starting points, templates and even a tracker
// built by hand are all reachable with the same general parts, so each one must (1) build the same structure
// whatever its starting-point identity is, and (2) survive a trip back through the builder unchanged.

const settings = { units: 'metric' as const };
const structure = (d: TrackerDraft) => JSON.parse(JSON.stringify({
  input: d.input, fields: d.fields, measures: d.measures, primaryMeasure: d.primaryMeasure, targets: d.targets, success: d.success,
  derived: d.derived, tools: d.tools, daily: d.daily, avoid: d.avoid, planStyle: d.planStyle, terms: d.terms,
}));
const asTracker = (d: TrackerDraft): Tracker => ({ ...d, id: 't', systemId: null, createdAt: 0 });

const all = [...TEMPLATES.map((x) => ({ id: x.id, make: x.make })), ...SHAPES.map((x) => ({ id: `shape:${x.id}`, make: x.make }))];

test('a starting point\u2019s identity carries no structure: the same answers under a blank identity build the same tracker', () => {
  for (const x of all) {
    const a = x.make();
    const plain = { ...a, presetId: 'blank', templateId: undefined };
    assert.deepEqual(structure(draftFromAnswers(plain, settings)), structure(draftFromAnswers(a, settings)), x.id);
  }
});

test('every template and shape survives a trip back through the builder unchanged', () => {
  for (const x of all) {
    const d = draftFromAnswers(x.make(), settings);
    const again = draftFromAnswers(answersFromTracker(asTracker(d), settings, false), settings, asTracker(d));
    assert.deepEqual(structure(again), structure(d), x.id);
  }
});

test('Nick’s hand-built trackers can also be made with the builder', () => {
  // Compared by meaning: ids and the order of fields are the builder's own choice and do not change behaviour.
  const keep = (x: TrackerDraft) => ({
    input: x.input,
    fields: [...x.fields].sort((a, b) => a.id.localeCompare(b.id)),
    targets: x.targets.map((g) => ({ measure: g.measure, min: g.min, max: g.max })).sort((a, b) => a.measure.localeCompare(b.measure)),
    success: x.success.mode === 'target' ? { mode: 'target', target: x.targets.find((g) => g.id === (x.success as { targetId: string }).targetId) && { ...x.targets.find((g) => g.id === (x.success as { targetId: string }).targetId), id: undefined } } : x.success,
    derived: x.derived, tools: x.tools,
  });
  for (const [name, d] of [['gym', nickGym()], ['nutrition', nickNutrition()], ['weight', nickWeight()]] as const) {
    const built = draftFromAnswers(answersFromTracker(asTracker(d), settings, false), settings, asTracker(d));
    assert.deepEqual(JSON.parse(JSON.stringify(keep(built))), JSON.parse(JSON.stringify(keep(d))), name);
    // the builder may add the obvious per-field totals, but must reproduce every measure the tracker has
    for (const m of d.measures) {
      const b = built.measures.find((x) => x.id === m.id);
      assert.ok(b, name + ': builder makes ' + m.id);
      assert.deepEqual(b.calc, m.calc, name + ': ' + m.id);
    }
  }
});
