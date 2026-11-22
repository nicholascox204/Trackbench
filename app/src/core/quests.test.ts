import assert from 'node:assert/strict';
import test from 'node:test';
import { derive } from './derive';
import { defaultConfig } from './engine';
import { answersFromPreset, draftFromAnswers } from './setup';
import { describeQuest, questEvents, questProgress, questTrackers, valueOn } from './quests';
import type { Entry, Quest, Settings, System, Tracker } from './types';

const settings: Settings = { units: 'imperial' };
const day = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();
const habit = (id: string, name: string, created = day(2026, 1, 1)): Tracker => ({ ...draftFromAnswers({ ...answersFromPreset('check-in'), name }, settings), id, systemId: 's', createdAt: created });
const log = (trackerId: string, d: number): Entry => ({ id: `${trackerId}${d}${Math.random()}`, trackerId, at: d + 9 * 3600000, done: true, values: {} });
const quest = (extra: Partial<Quest>): Quest => ({ id: 'q', trackers: 'all', metric: 'trackersDone', how: 'day', value: 3, from: '2026-01-01', ...extra });

const a = habit('a', 'Water');
const b = habit('b', 'Reading');
const c = habit('c', 'Stretch');
const trackers = [a, b, c];
const today = day(2026, 11, 18); // a Wednesday

test('complete three trackers today: counts the trackers that had a good day', () => {
  const q = quest({});
  assert.equal(valueOn(q, trackers, [], today), 0);
  assert.equal(valueOn(q, trackers, [log('a', today), log('b', today)], today), 2);
  const p = questProgress(q, trackers, [log('a', today), log('b', today)], today, 'mon');
  assert.equal(p.status, 'active');
  assert.equal(p.headline, '2 of 3 trackers');
  assert.equal(p.detail, '1 more today');
  assert.equal(questProgress(q, trackers, [log('a', today), log('b', today), log('c', today)], today, 'mon').status, 'met');
});

test('a quest can be limited to the trackers chosen', () => {
  const q = quest({ trackers: ['a', 'b'], value: 2 });
  assert.equal(valueOn(q, questTrackers(q, trackers), [log('a', today), log('c', today)], today), 1, 'the third tracker is not counted');
  const gone = { ...q, trackers: ['gone'] };
  assert.equal(valueOn(gone, questTrackers(gone, trackers), [log('a', today)], today), 0, 'a tracker that no longer exists adds nothing');
});

test('perfect days: every chosen tracker that was due had a good day', () => {
  const q = quest({ metric: 'perfectDays', how: 'week', value: 3 });
  const week = [day(2026, 11, 16), day(2026, 11, 17), day(2026, 11, 18)]; // Monday to Wednesday
  const es = [...week.flatMap((d) => trackers.map((t) => log(t.id, d))), log('a', day(2026, 11, 18))];
  assert.equal(questProgress(q, trackers, es, today, 'mon').value, 3);
  const missing = week.flatMap((d) => (d === week[1] ? [log('a', d), log('b', d)] : trackers.map((t) => log(t.id, d))));
  assert.equal(questProgress(q, trackers, missing, today, 'mon').value, 2, 'one tracker missed on Tuesday, so that day is not perfect');
  assert.equal(valueOn(q, trackers, [], today), 0, 'nothing logged is not a perfect day');
});

test('entries logged, over a week and over a month', () => {
  const es = [log('a', day(2026, 11, 2)), log('a', day(2026, 11, 16)), log('b', day(2026, 11, 17)), log('b', day(2026, 11, 17)), log('c', day(2026, 10, 30))];
  assert.equal(questProgress(quest({ metric: 'entries', how: 'week', value: 5 }), trackers, es, today, 'mon').value, 3);
  assert.equal(questProgress(quest({ metric: 'entries', how: 'month', value: 5 }), trackers, es, today, 'mon').value, 4);
  assert.equal(questProgress(quest({ metric: 'entries', how: 'total', value: 5, from: '2026-10-01' }), trackers, es, today, 'mon').value, 5);
});

test('a quest by a date reads as missed once the date passes without it being met', () => {
  const q = quest({ metric: 'entries', how: 'total', value: 10, from: '2026-11-01', until: '2026-11-10' });
  const p = questProgress(q, trackers, [log('a', day(2026, 11, 3))], today, 'mon');
  assert.equal(p.status, 'missed');
  assert.equal(p.detail, 'The date passed');
});

test('quests read as plain sentences', () => {
  assert.equal(describeQuest(quest({}), trackers), 'Complete 3 trackers today');
  assert.equal(describeQuest(quest({ value: 1, metric: 'trackersDone' }), trackers), 'Complete 1 tracker today');
  assert.equal(describeQuest(quest({ metric: 'perfectDays', how: 'week', value: 5 }), trackers), 'Have 5 perfect days this week');
  assert.equal(describeQuest(quest({ metric: 'entries', how: 'month', value: 20, trackers: ['a', 'b'] }), trackers), 'Log 20 entries this month · Water, Reading');
  assert.equal(describeQuest(quest({ metric: 'entries', how: 'total', value: 100, until: '2026-12-31', trackers: ['a', 'b', 'c'] }), trackers), 'Log 100 entries by 31 Dec · 3 trackers');
  assert.equal(describeQuest(quest({ trackers: ['nope'] }), trackers), 'Complete 3 trackers today (no trackers left)');
});

test('meeting a quest over a finished week earns a result; a day quest does not, and the first part-week is not judged', () => {
  const q = quest({ metric: 'entries', how: 'week', value: 2, from: '2026-11-04' }); // began on a Wednesday
  const es = [log('a', day(2026, 11, 5)), log('b', day(2026, 11, 6)), log('a', day(2026, 11, 10)), log('b', day(2026, 11, 11)), log('c', day(2026, 11, 12))];
  const events = questEvents([q], trackers, es, today, 'mon');
  assert.deepEqual(events.map((e) => [e.day, e.success]), [[day(2026, 11, 15), true]].concat([]) as never[], 'only the full week Nov 9 to 15 had ended: 3 entries is at least 2');
  assert.equal(events[0].weight, 3);
  assert.match(events[0].title, /^Quest: Log 2 entries this week/);
  assert.deepEqual(questEvents([quest({})], trackers, [], today, 'mon'), []);
  const missed = questEvents([{ ...q, value: 9 }], trackers, es, today, 'mon');
  assert.equal(missed[0].success, false);
});

test('a quest by a date earns its result on the day it is met', () => {
  const q = quest({ metric: 'entries', how: 'total', value: 3, from: '2026-11-01', until: '2026-12-01' });
  const es = [log('a', day(2026, 11, 3)), log('b', day(2026, 11, 5)), log('c', day(2026, 11, 8)), log('a', day(2026, 11, 9))];
  const events = questEvents([q], trackers, es, today, 'mon');
  assert.equal(events.length, 1);
  assert.equal(events[0].day, day(2026, 11, 8), 'met on the third entry');
  assert.equal(events[0].success, true);
  assert.equal(events[0].weight, 10);
});

test('quests feed the points the system already keeps', () => {
  const system: System = { id: 's', name: 'My system', config: defaultConfig(), createdAt: day(2026, 1, 1), quests: [quest({ metric: 'entries', how: 'week', value: 2, from: '2026-11-02' })] };
  const es = [log('a', day(2026, 11, 3)), log('b', day(2026, 11, 4))];
  const withQuest = derive(trackers, es, [system], today, settings);
  const without = derive(trackers, es, [{ ...system, quests: [] }], today, settings);
  assert.ok(withQuest.result && without.result);
  assert.ok((withQuest.result?.earned ?? 0) > (without.result?.earned ?? 0), 'a met weekly quest adds points');
  assert.ok(withQuest.result?.ledger.some((l) => l.reason.startsWith('Goal met: Quest:')));
});
