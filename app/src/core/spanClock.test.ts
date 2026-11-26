import assert from 'node:assert/strict';
import test from 'node:test';
import { minutesOfDay, spanPair, spanValues } from './spanClock';
import { draftFromAnswers } from './setup';
import { TEMPLATES } from './templates';
import type { Settings } from './types';

const settings = { units: 'metric', weekStart: 'mon' } as unknown as Settings;
const build = (id: string) => draftFromAnswers(TEMPLATES.find((t) => t.id === id)!.make(), settings);

test('fasting and sleep have a pair of times to clock; a run does not', () => {
  assert.equal(spanPair(build('fasting'))?.from.id, 'last');
  assert.equal(spanPair(build('sleep'))?.to.id, 'wake');
  assert.equal(spanPair(build('running')), undefined);
});

test('a fast from 8pm to noon the next day saves those two times', () => {
  const p = spanPair(build('fasting'))!;
  const start = new Date(2026, 10, 25, 20, 0).getTime();
  const end = new Date(2026, 10, 26, 12, 0).getTime();
  assert.deepEqual(spanValues(p, start, end), { last: 1200, first: 720 });
  assert.equal(minutesOfDay(new Date(2026, 0, 1, 7, 45).getTime()), 465);
});
