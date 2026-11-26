import assert from 'node:assert/strict';
import test from 'node:test';
import { stockLeft, stockText } from './stock';
import type { Entry, Slot } from './types';

const slot: Slot = { id: 'vit-d', name: 'Vitamin D', stock: { count: 10, at: 1000 } };
const tick = (at: number, done = true): Entry => ({ id: String(at), trackerId: 't', slotId: 'vit-d', at, done, values: {} });

test('each tick after counting takes one away; ticks before the count and undone ticks do not', () => {
  assert.equal(stockLeft(slot, [tick(500), tick(2000), tick(3000), tick(4000, false)]), 8);
  assert.equal(stockLeft({ id: 'x', name: 'x' }, []), undefined);
});

test('it says when to refill', () => {
  assert.deepEqual(stockText(20), { text: '20 left', low: false });
  assert.deepEqual(stockText(5), { text: '5 left, refill soon', low: true });
  assert.equal(stockText(0)?.text, 'none left, refill');
});

import { draftFromAnswers } from './setup';
import { TEMPLATES } from './templates';
import type { Settings } from './types';

test('medication and vitamins start counting what is left; a meal plan does not', () => {
  const settings = { units: 'metric', weekStart: 'mon' } as unknown as Settings;
  const build = (id: string) => draftFromAnswers(TEMPLATES.find((x) => x.id === id)!.make(), settings);
  assert.equal(build('medication').tools.stock, true);
  assert.equal(build('vitamins').tools.stock, true);
  assert.ok(!build('meals').tools.stock);
});
