// The summary rows hold for every preset: each one says what it logs, what it shows (where it shows anything), its tools and
// how past days are set, with no empty or broken text, and what a preset calculates appears under "It shows".
import assert from 'node:assert/strict';
import test from 'node:test';
import { draftFromAnswers, summaryLines } from './setup';
import { refreshPatch } from './presetRefresh';
import { TEMPLATES } from './templates';
import type { Settings, Tracker } from './types';

const SETTINGS: Settings = { units: 'imperial' };

test('every preset has a sound set of summary rows', () => {
  for (const t of TEMPLATES) {
    const rows = summaryLines(t.make(), SETTINGS);
    const labels = rows.map((r) => r.label);
    assert.equal(rows[0].label, 'You log', `${t.id}: first row`);
    assert.ok(labels.includes('Tools'), `${t.id}: tools row`);
    assert.ok(labels.some((l) => l.startsWith('Past days')), `${t.id}: past days row`);
    assert.equal(new Set(labels).size, labels.length, `${t.id}: no row twice`);
    for (const r of rows) assert.ok(r.value.trim() && !/undefined|NaN|\[object/.test(r.value), `${t.id}: ${r.label} reads "${r.value}"`);
  }
});

test('what a preset calculates is listed under It shows, and rows that do not apply are left out', () => {
  const run = summaryLines(TEMPLATES.find((x) => x.id === 'running')!.make(), SETTINGS);
  assert.ok(run.find((r) => r.label === 'It shows')?.value.includes('Pace'));
  assert.equal(summaryLines(TEMPLATES.find((x) => x.id === 'plants')!.make(), SETTINGS).some((r) => r.label === 'It shows'), false);
});

test('the past-days row is named for what is in it', () => {
  const label = (id: string) => summaryLines(TEMPLATES.find((x) => x.id === id)!.make(), SETTINGS).find((r) => r.step === 'options')?.label;
  assert.equal(label('plants'), 'Past days', 'no units to speak of');
  assert.equal(label('weigh-in'), 'Past days and units');
});

test('a list that is the same every day says what is ticked, not that it is the same list', () => {
  const rows = (id: string) => summaryLines(TEMPLATES.find((t) => t.id === id)!.make(), SETTINGS).find((r) => r.label === 'You log')?.value;
  assert.equal(rows('habit'), 'Tick off each habit');
  assert.equal(rows('vitamins'), 'Tick off each vitamin');
});

test('Steps from my phone is a tool: on for the Steps preset, saved as the source, and named in the Tools row', () => {
  const a = TEMPLATES.find((x) => x.id === 'steps')!.make();
  assert.equal(a.extras.auto, true);
  assert.deepEqual(draftFromAnswers(a, SETTINGS).sources, { steps: 'sensor' });
  assert.equal(summaryLines(a, SETTINGS).find((r) => r.label === 'Tools')?.value, 'Steps from phone');
  const off = { ...a, extras: { ...a.extras, auto: false } };
  assert.deepEqual(draftFromAnswers(off, SETTINGS).sources, { steps: 'manual' });
  assert.equal(summaryLines(off, SETTINGS).find((r) => r.label === 'Tools')?.value, 'None');
  assert.equal(draftFromAnswers(TEMPLATES.find((x) => x.id === 'weigh-in')!.make(), SETTINGS).sources, undefined, 'a tracker without Steps has no source');
});

test('a tracker made from a template can be rebuilt from it as it is now, keeping its name', () => {
  const a = TEMPLATES.find((x) => x.id === 'water')!.make();
  const t = { ...draftFromAnswers({ ...a, name: 'My water' }, SETTINGS), id: 'w', systemId: null, createdAt: 0 } as Tracker;
  assert.equal(t.templateId, 'water');
  const stale = { ...t, terms: { item: 'Old', row: 'Old', target: 'Old' }, avoid: true };
  const patch = refreshPatch(stale, SETTINGS)!;
  assert.equal(patch.name, 'My water');
  assert.equal(patch.avoid, undefined, 'what the template no longer says is cleared');
  assert.equal(refreshPatch({ ...t, templateId: undefined }, SETTINGS), null, 'a tracker with no template is left alone');
});

test("every preset says what a good day is, in a Target row right after what it logs", () => {
  for (const t of TEMPLATES) {
    const rows = summaryLines(t.make(), SETTINGS);
    assert.equal(rows[1].label, "Target", t.id + ": second row");
    assert.ok(rows[1].value.trim().length > 3, t.id + ": target reads \"" + rows[1].value + "\"");
    assert.equal(rows[1].step, "target", t.id + ": opens the target screen");
  }
});

test("targets read the way they are set", () => {
  const row = (id: string) => summaryLines(TEMPLATES.find((x) => x.id === id)!.make(), SETTINGS).find((r) => r.label === "Target")!.value;
  assert.equal(row("caffeine"), "At most 4 cups a day", "caffeine keeps its limit, with the counter's own word");
  assert.equal(row("water"), "Any entry counts", "water has no target yet (a starting one is still to be decided)");
  assert.equal(row("no-alcohol"), "A day with nothing logged", "an avoid tracker is a clean day");
  assert.match(row("gym-split"), /plan/i, "a planned tracker says it is about finishing the plan");
});
