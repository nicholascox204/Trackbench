// A reading (a blood pressure, a glucose level) is not an amount: two readings in a day must not be added up.
import assert from 'node:assert/strict';
import test from 'node:test';
import { draftFromAnswers } from './setup';
import { TEMPLATES } from './templates';
import type { Settings } from './types';

const SETTINGS: Settings = { units: 'imperial' };
const build = (id: string) => {
  const tp = TEMPLATES.find((x) => x.id === id);
  assert.ok(tp, `${id} exists`);
  return draftFromAnswers(tp.make(), SETTINGS);
};

for (const [id, fields] of [['blood-pressure', ['top', 'bottom', 'pulse']], ['blood-sugar', ['level']]] as const) {
  test(`${id}: each number shows the latest reading, not a sum`, () => {
    const t = build(id);
    for (const f of fields) {
      const m = t.measures.find((x) => x.id === f);
      assert.ok(m, `${f} has a measure`);
      assert.equal(m.calc.op, 'latest', `${f} is a reading`);
    }
  });
}

test('amounts still add up: spending and food', () => {
  assert.equal(build('spending').measures.find((m) => m.id === 'amount')?.calc.op, 'sum');
  assert.equal(build('food-log').measures.find((m) => m.id === 'kcal')?.calc.op, 'sum');
});
