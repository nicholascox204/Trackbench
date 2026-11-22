// The streak numbers behind the avoid card, and how a plan's lists are described on the setup summary.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bestClean, cleanDays } from './derive';
import { answersFromPreset, answersFromTracker, draftFromAnswers, summaryLines } from './setup';
import type { Entry, Settings, Tracker } from './types';

const SETTINGS: Settings = { units: 'imperial' };
const day = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();
const tracker = (created: number): Tracker => ({ ...draftFromAnswers({ ...answersFromPreset('check-in'), avoid: true }, SETTINGS), id: 'a', systemId: null, createdAt: created });
const slip = (at: number): Entry => ({ id: String(at), trackerId: 'a', at, done: true, values: {} });

test('the best streak is the longest run without a slip, counting the one still going', () => {
  const t = tracker(day(2026, 11, 1));
  const today = day(2026, 11, 20);
  assert.equal(bestClean(t, [], today), 19, 'nothing logged: every day since it started');
  const entries = [slip(day(2026, 11, 5)), slip(day(2026, 11, 18))]; // 4 clean, then 13 clean, then 2 so far
  assert.equal(bestClean(t, entries, today), 13);
  assert.equal(cleanDays(t, entries, today), 2);
});

test('a streak that is still going can be the best', () => {
  const t = tracker(day(2026, 11, 1));
  assert.equal(bestClean(t, [slip(day(2026, 11, 3))], day(2026, 11, 20)), 17);
});

test('the summary says whether the lists are the same every day or one for each day', () => {
  const lines = (patch: object) => summaryLines({ ...answersFromPreset('set-plan'), ...patch } as never, SETTINGS).find((l) => l.label === 'You log')?.value ?? '';
  assert.ok(lines({ samePlan: true }).startsWith('The same list'));
  const each = lines({ samePlan: false, schedule: { kind: 'weekdays', days: [1, 3, 5] }, dayNames: { 1: 'Push', 3: 'Pull', 5: 'Legs' } });
  assert.ok(each.startsWith('A list per weekday (Push, Pull, Legs)'), each);
});

test('a count typed by hand replaces what was there, and a slip after it resets it', () => {
  const today = day(2026, 11, 20);
  const t = { ...tracker(today), cleanFrom: day(2026, 10, 30), cleanSetOn: today }; // created today, typed as 21 days
  assert.equal(cleanDays(t, [], today), 21);
  assert.equal(bestClean(t, [], today), 21, 'a typed count is the best at once; a wrong one is fixed by typing again or resetting');
  assert.equal(bestClean({ ...t, cleanFrom: today }, [], today), 0, 'resetting takes it back');
  assert.equal(cleanDays(t, [slip(day(2026, 11, 18))], today), 21, 'a slip from before it was typed is replaced by it');
  assert.equal(cleanDays(t, [slip(day(2026, 11, 22))], day(2026, 11, 24)), 2, 'a slip after it counts');
});

test('the streak is on for an avoid tracker unless it is switched off, and that survives editing', () => {
  const on = draftFromAnswers({ ...answersFromPreset('check-in'), avoid: true }, SETTINGS);
  assert.equal(on.streak, undefined);
  const off = draftFromAnswers({ ...answersFromPreset('check-in'), avoid: true, streak: false }, SETTINGS);
  assert.equal(off.streak, false);
  const back = answersFromTracker({ ...off, id: 'a', systemId: null, createdAt: 0 }, SETTINGS, false);
  assert.equal(back.streak, false);
});
