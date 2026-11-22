// Opening on the tracker you are likely to need.
import assert from 'node:assert/strict';
import test from 'node:test';
import { pickStart, usualMinute, type OpenOn } from './startPick';
import { answersFromPreset, draftFromAnswers } from './setup';
import { addDays, startOfDay } from './time';
import type { Entry, Settings, Tracker } from './types';

const SETTINGS: Settings = { units: 'imperial' };
const DAY = startOfDay(new Date(2026, 10, 19).getTime()); // a Thursday
const at = (day: number, h: number, m = 0): number => day + (h * 60 + m) * 60000;
const tracker = (id: string): Tracker => ({ ...draftFromAnswers(answersFromPreset('check-in'), SETTINGS), id, name: id, systemId: null, createdAt: at(DAY, 0) - 60 * 86400000 });
const done = (trackerId: string, ts: number): Entry => ({ id: `${trackerId}${ts}`, trackerId, at: ts, done: true, values: {} });
// A tracker logged at the same time on each of the last n days (not today).
const habit = (trackerId: string, h: number, m = 0, n = 8): Entry[] => Array.from({ length: n }, (_, i) => done(trackerId, at(addDays(DAY, -(i + 1)), h, m)));
const smart: OpenOn = { mode: 'smart' };
const T = [tracker('a'), tracker('b'), tracker('c')];

test('the usual time is the middle of when you log, once there is enough history', () => {
  assert.equal(usualMinute(habit('a', 7, 30)), 7 * 60 + 30);
  assert.equal(usualMinute(habit('a', 7, 30, 4)), null, 'too little history');
  const scattered = Array.from({ length: 8 }, (_, i) => done('a', at(addDays(DAY, -(i + 1)), i % 2 ? 20 : 6)));
  assert.equal(usualMinute(scattered), null, 'no usual time when it is all over the day');
  assert.equal(usualMinute([]), null);
});

test('a morning check-in wins in the morning and the evening one in the evening', () => {
  const entries = [...habit('a', 7, 30), ...habit('b', 19, 0)];
  assert.equal(pickStart(T.slice(0, 2), entries, at(DAY, 7, 45), smart, null), 'a');
  assert.equal(pickStart(T.slice(0, 2), entries, at(DAY, 18, 30), smart, null), 'b');
});

test('a tracker you already finished today never beats one still waiting', () => {
  const entries = [...habit('a', 7, 30), ...habit('b', 19, 0), done('a', at(DAY, 7, 40))];
  assert.equal(pickStart(T.slice(0, 2), entries, at(DAY, 7, 45), smart, null), 'b', 'a is done, so b, even at a\'s usual time');
});

test('with too little history it falls back to the first unfinished one in bar order', () => {
  const entries = [done('a', at(addDays(DAY, -1), 7)), done('b', at(addDays(DAY, -1), 19))];
  assert.equal(pickStart(T.slice(0, 2), entries, at(DAY, 19, 0), smart, null), 'a');
});

test('when nothing is waiting it opens the last tracker, else the first', () => {
  const entries = [done('a', at(DAY, 8)), done('b', at(DAY, 9))];
  assert.equal(pickStart(T.slice(0, 2), entries, at(DAY, 12), smart, null), 'a');
  assert.equal(pickStart(T.slice(0, 2), entries, at(DAY, 12), smart, { id: 'b', at: at(DAY, 9) }), 'b');
});

test('reopening within half an hour goes back to the tracker you were on', () => {
  const entries = [...habit('a', 7, 30), ...habit('b', 19, 0)];
  assert.equal(pickStart(T.slice(0, 2), entries, at(DAY, 7, 45), smart, { id: 'b', at: at(DAY, 7, 30) }), 'b', '15 minutes ago');
  assert.equal(pickStart(T.slice(0, 2), entries, at(DAY, 9, 0), smart, { id: 'b', at: at(DAY, 7, 30) }), 'a', 'an hour and a half ago, so ask the rule again');
});

test('a tracker that was deleted is never picked from memory', () => {
  assert.equal(pickStart(T.slice(0, 2), [], at(DAY, 8), smart, { id: 'gone', at: at(DAY, 7, 55) }), 'a');
});

test('the other two settings: always the one you were last on, or always a chosen one', () => {
  const entries = [...habit('a', 7, 30), ...habit('b', 19, 0)];
  assert.equal(pickStart(T.slice(0, 2), entries, at(DAY, 7, 45), { mode: 'last' }, { id: 'b', at: at(DAY, 1) }), 'b', 'however long ago');
  assert.equal(pickStart(T.slice(0, 2), entries, at(DAY, 7, 45), { mode: 'last' }, null), 'a', 'nothing remembered, so the rule');
  assert.equal(pickStart(T, entries, at(DAY, 7, 45), { mode: 'pinned', id: 'c' }, null), 'c');
  assert.equal(pickStart(T.slice(0, 2), entries, at(DAY, 7, 45), { mode: 'pinned', id: 'c' }, null), 'a', 'a pinned tracker that is gone falls back');
});

test('no trackers means nothing to open', () => {
  assert.equal(pickStart([], [], at(DAY, 8), smart, null), null);
});

// --- Behaviour changes: it should follow a real change in about two weeks, and not move for a one-off ---

// A tracker logged at `h` for the days from `from` to `to` days ago (inclusive).
const between = (id: string, h: number, from: number, to: number): Entry[] => Array.from({ length: to - from + 1 }, (_, i) => done(id, at(addDays(DAY, -(from + i)), h)));
const minutes = (h: number): number => h * 60;

test('a new habit takes over after about two weeks, not at once and not months later', () => {
  const old = between('a', 7, 17, 45); // mornings, long ago
  assert.equal(usualMinute([...old, ...between('a', 19, 1, 16)], DAY), minutes(19), 'a bit over two weeks of evenings: the evening is the usual time');
  const early = usualMinute([...old, ...between('a', 19, 1, 6)], DAY);
  assert.notEqual(early, minutes(19), 'six evenings is not enough to move it');
  assert.equal(usualMinute(between('a', 7, 1, 40), DAY), minutes(7), 'a steady habit stays put');
});

test('one odd day does not move it', () => {
  const steady = between('a', 7, 2, 30);
  assert.equal(usualMinute([...steady, done('a', at(addDays(DAY, -1), 21))], DAY), minutes(7));
});

test('a pause in logging does not invent a new time', () => {
  assert.equal(usualMinute(between('a', 7, 30, 50), DAY), minutes(7), 'a month away, the old habit is still the best guess');
});

test('a running timer beats the rule and the memory, but not a pinned choice', () => {
  const entries = [...habit('a', 7, 30)];
  const now = at(DAY, 7, 45);
  const live = [{ id: 'c', since: at(DAY, 7, 20) }];
  assert.equal(pickStart(T, entries, now, smart, null, live), 'c', 'the timed one, though a is the usual one');
  assert.equal(pickStart(T, entries, now, smart, { id: 'b', at: at(DAY, 7, 40) }, live), 'c', 'even right after being on another');
  assert.equal(pickStart(T, entries, now, { mode: 'last' }, { id: 'b', at: at(DAY, 7, 40) }, live), 'c');
  assert.equal(pickStart(T, entries, now, { mode: 'pinned', id: 'b' }, null, live), 'b', 'a pinned choice stays pinned');
  assert.equal(pickStart(T, entries, now, smart, null, [{ id: 'gone', since: now }]), 'a', 'a timer for a deleted tracker is ignored');
});

test('with two timers running the one started last opens', () => {
  const live = [{ id: 'a', since: at(DAY, 6) }, { id: 'b', since: at(DAY, 7) }];
  assert.equal(pickStart(T, [], at(DAY, 8), smart, null, live), 'b');
});

test('a timer on a tracker that is done or not due today still opens it', () => {
  const entries = [done('c', at(DAY, 7))]; // c is already done today
  assert.equal(pickStart(T, entries, at(DAY, 8), smart, null, [{ id: 'c', since: at(DAY, 7, 50) }]), 'c');
});
