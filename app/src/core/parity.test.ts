// Templates and Build your own are one system: a template is only a set of answers Build your own could have given.
// These are the settings setup has no control for (goals, targets, end dates, sample lists); no template may use them,
// so anything a template does can be found, checked and changed from Build your own, and a fix there reaches every template.
import assert from 'node:assert/strict';
import test from 'node:test';
import { TEMPLATES } from './templates';

test('no template sets anything Build your own cannot', () => {
  for (const t of TEMPLATES) {
    const a = t.make();
    assert.equal(a.goal, 'none', `${t.id}: goal`);
    assert.deepEqual(a.goals, [], `${t.id}: goals`);
    assert.equal(a.finishPlan, false, `${t.id}: finish the plan`);
    assert.equal(a.window, undefined, `${t.id}: end date`);
    assert.deepEqual(a.extraTargets, [], `${t.id}: targets`);
    assert.deepEqual(a.startGoals, [], `${t.id}: starting goals`);
    assert.equal(a.sample, undefined, `${t.id}: sample list`);
  }
});
