import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_COUNTDOWN, MAX_COUNTDOWN, MIN_COUNTDOWN, applyTyped, clock, formatTyped, newCountdown, parseTyped, pause, reset, secondsLeft, setLength, start, statusOf } from './countdown';
import { answersFromPreset, answersFromTracker, draftFromAnswers } from './setup';
import { TEMPLATES } from './templates';
import type { Settings } from './types';

const T0 = 1_000_000;

test('a new countdown is idle and starts at two minutes', () => {
  const t = newCountdown();
  assert.equal(statusOf(t, T0), 'idle');
  assert.equal(secondsLeft(t, T0), DEFAULT_COUNTDOWN);
  assert.equal(clock(secondsLeft(t, T0)), '2:00');
});

test('start counts down from an end time, so it survives a reload', () => {
  const running = start(newCountdown(90), T0);
  assert.equal(running.endsAt, T0 + 90_000);
  assert.equal(statusOf(running, T0 + 30_000), 'running');
  assert.equal(secondsLeft(running, T0 + 30_000), 60);
  const saved = JSON.parse(JSON.stringify(running));
  assert.equal(secondsLeft(saved, T0 + 89_000), 1);
});

test('the last second reads 0:01 and then it is done', () => {
  const running = start(newCountdown(10), T0);
  assert.equal(secondsLeft(running, T0 + 9_500), 1);
  assert.equal(statusOf(running, T0 + 10_000), 'done');
  assert.equal(secondsLeft(running, T0 + 12_000), 0);
});

test('pause keeps what is left and resume continues from there', () => {
  const p = pause(start(newCountdown(120), T0), T0 + 45_000);
  assert.equal(statusOf(p, T0 + 99_000), 'paused');
  assert.equal(secondsLeft(p, T0 + 99_000), 75);
  const again = start(p, T0 + 100_000);
  assert.equal(again.endsAt, T0 + 175_000);
  assert.equal(again.pausedLeft, undefined);
});

test('start on a running countdown changes nothing; pause on an idle one changes nothing', () => {
  const running = start(newCountdown(60), T0);
  assert.deepEqual(start(running, T0 + 5_000), running);
  const idle = newCountdown(60);
  assert.deepEqual(pause(idle, T0), idle);
});

test('reset goes back to idle and keeps the remembered length', () => {
  const r = reset(start(newCountdown(150), T0));
  assert.equal(statusOf(r, T0 + 1), 'idle');
  assert.equal(r.length, 150);
});

test('after it finishes, start runs the same length again', () => {
  const done = start(newCountdown(45), T0);
  assert.equal(statusOf(done, T0 + 50_000), 'done');
  const again = start(done, T0 + 60_000);
  assert.equal(again.endsAt, T0 + 105_000);
});

test('setting the time is remembered and kept within limits', () => {
  assert.equal(setLength(1).length, MIN_COUNTDOWN);
  assert.equal(setLength(99999).length, MAX_COUNTDOWN);
  assert.equal(setLength(125.6).length, 126);
  assert.equal(newCountdown(Number.NaN).length, DEFAULT_COUNTDOWN);
});

test('setting the time mid-run resets the countdown to that time, stopped', () => {
  const running = start(newCountdown(60), T0);
  const edited = setLength(180);
  assert.equal(statusOf(edited, T0 + 1000), 'idle');
  assert.equal(secondsLeft(edited, T0 + 1000), 180);
  const paused = pause(running, T0 + 1000);
  assert.equal(secondsLeft(setLength(45), T0 + 2000), 45);
  const done = start(newCountdown(10), T0);
  assert.equal(statusOf(setLength(300), T0 + 20_000), 'idle');
});

test('typed text is read like a microwave, ignoring anything that is not a digit', () => {
  assert.equal(parseTyped('130'), 90, '1, 3, 0 reads 1:30');
  assert.equal(parseTyped('200'), 120);
  assert.equal(parseTyped('90'), 90, 'two digits are seconds');
  assert.equal(parseTyped('5'), 5);
  assert.equal(parseTyped('1:30'), 90, 'a typed colon is ignored, the digits are the same');
  assert.equal(parseTyped('2005'), 20 * 60 + 5);
  assert.equal(parseTyped('12345'), 3600 + 23 * 60 + 45, 'five digits read as 1:23:45');
  assert.equal(parseTyped('1020304'), 2 * 3600 + 3 * 60 + 4, 'only the last six digits count');
  assert.equal(formatTyped(''), '0:00', 'nothing typed shows zero');
  assert.equal(formatTyped('1'), '0:01');
  assert.equal(formatTyped('130'), '1:30');
  assert.equal(formatTyped('0:053'), '0:53');
  assert.equal(formatTyped('13000'), '1:30:00');
  assert.equal(formatTyped('1020304'), '2:03:04', 'capped at six digits');
  assert.equal(clock(5400), '1:30:00');
  assert.equal(parseTyped('abc'), null, 'no digits means keep the old time');
  assert.equal(parseTyped(''), null);
});

test('the clock reads minutes and seconds', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(65), '1:05');
  assert.equal(clock(600), '10:00');
});

test('the gym presets bring the countdown on; others do not; any tracker can switch it on and it survives editing', () => {
  const settings: Settings = { units: 'imperial' };
  const draft = (id: string, countdown?: boolean) => {
    const a = id === 'blank' ? answersFromPreset('blank') : TEMPLATES.find((x) => x.id === id)!.make();
    return draftFromAnswers(countdown === undefined ? a : { ...a, extras: { ...a.extras, countdown } }, settings);
  };
  assert.equal(draft('gym-split').tools.countdown, true);
  assert.equal(draft('full-body').tools.countdown, true);
  assert.equal(draft('habit').tools.countdown, undefined);
  assert.equal(draft('running').tools.countdown, undefined);
  const custom = draft('blank', true);
  assert.equal(custom.tools.countdown, true);
  const saved = { ...custom, id: 't1', systemId: null, createdAt: 0 };
  const back = answersFromTracker(saved, settings, false);
  assert.equal(back.extras.countdown, true, 'editing keeps it');
  assert.equal(draftFromAnswers({ ...back, extras: { ...back.extras, countdown: false } }, settings).tools.countdown, undefined, 'switching it off removes it');
});

test('the timer is a separate switch from the countdown, and a tracker can have both', () => {
  const settings: Settings = { units: 'imperial' };
  const a = answersFromPreset('blank');
  const both = draftFromAnswers({ ...a, extras: { ...a.extras, countdown: true, timer: true } }, settings);
  assert.equal(both.tools.countdown, true);
  assert.equal(both.tools.timer, true);
  const onlyTimer = draftFromAnswers({ ...a, extras: { ...a.extras, timer: true } }, settings);
  assert.equal(onlyTimer.tools.countdown, undefined);
  const saved = { ...both, id: 't2', systemId: null, createdAt: 0 };
  const back = answersFromTracker(saved, settings, false);
  assert.equal(back.extras.countdown, true);
  assert.equal(back.extras.timer, true);
});

test('typing past the limits shows the limit and says so', () => {
  assert.deepEqual(applyTyped('0:053'), { text: '0:53', maxed: false });
  assert.deepEqual(applyTyped('5000000'), { text: '24:00:00', maxed: true }, 'a seventh digit is ignored, the rest is capped');
  assert.deepEqual(applyTyped('1000000'), { text: '10:00:00', maxed: true }, 'a seventh digit is ignored');
  assert.deepEqual(applyTyped('500000'), { text: '24:00:00', maxed: true }, 'past 24 hours shows 24:00:00');
  assert.deepEqual(applyTyped('240000'), { text: '24:00:00', maxed: false });
  assert.deepEqual(applyTyped('2400000'), { text: '24:00:00', maxed: true });
});
