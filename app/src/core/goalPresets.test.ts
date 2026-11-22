import assert from 'node:assert/strict';
import test from 'node:test';
import { NAV, itemWidthFor } from '../constants/layout';
import { suggestGoals } from './goalPresets';
import { dailyGoals, dayKey, describeGoal, goalEvents, goalProgress, withDailyGoal, withoutDailyGoal } from './goals';
import { answersFromPreset, dayGoalDefs, dayGoalFromDef, draftFromAnswers, goalText } from './setup';
import { SHAPES, TEMPLATES } from './templates';
import { termsOf } from './terms';
import { addDays, startOfDay } from './time';
import type { Entry, GoalDef, Tracker } from './types';

const metric = { units: 'metric' as const };
const make = (id: string, over: Partial<Tracker> = {}): Tracker => ({ ...draftFromAnswers({ ...TEMPLATES.find((t) => t.id === id)!.make(), planMode: 'example' }, metric), id: 't', systemId: 's', createdAt: 0, ...over });
const now = new Date(2026, 10, 18, 12).getTime();
const today = startOfDay(now);
const entry = (at: number, values: Entry['values'] = {}): Entry => ({ id: `e${at}`, trackerId: 't', at: at + 3600000, done: true, values });

test('suggestions come from the tracker\u2019s own shape and fields', () => {
  const gym = suggestGoals(make('gym-split'), [], metric, now);
  const keys = gym.map((x) => x.key);
  assert.ok(keys.includes('show-up'));
  assert.ok(keys.includes('finish-plan'));
  assert.ok(keys.includes('best-weight'));
  assert.equal(gym.find((x) => x.key === 'finish-plan')!.goal.value, 50); // every planned set in a normal week
  assert.equal(gym.find((x) => x.key === 'show-up')!.goal.value, 3);

  const weigh = suggestGoals(make('weigh-in'), [entry(today - 86400000, { weight: 80 })], metric, now);
  const down = weigh.find((x) => x.key === 'down-weight')!.goal;
  assert.equal(down.cmp, 'reach');
  assert.equal(down.start, 80);
  assert.equal(down.value, 77.5); // a small, realistic step from where you are
  assert.equal(weigh.find((x) => x.key === 'up-weight')!.goal.value, 82.5);

  assert.equal(suggestGoals(make('mood'), [], metric, now).find((x) => x.key === 'avg-mood')!.goal.value, 4);
  assert.equal(suggestGoals(make('water'), [], metric, now).find((x) => x.key === 'count-week')!.goal.value, 56); // 8 a day, scaled to a week
  assert.deepEqual(suggestGoals(make('quit-smoking'), [], metric, now).map((x) => x.key), ['slips-week', 'slips-month', 'slips-30']);
});

test('every suggestion is a complete goal that reads and measures cleanly', () => {
  for (const tp of TEMPLATES) {
    const t = make(tp.id);
    const list = suggestGoals(t, [], metric, now);
    assert.ok(list.length > 0, tp.id);
    for (const x of list) {
      assert.ok(describeGoal(t, x.goal, metric).length > 0, `${tp.id} ${x.key}`);
      assert.ok(x.why.length > 10, `${tp.id} ${x.key} says why`);
      const p = goalProgress({ ...t, goals: [x.goal] }, x.goal, [], today, metric, 'mon');
      assert.ok(Number.isFinite(p.fraction), `${tp.id} ${x.key}`);
      goalEvents([{ ...t, goals: [x.goal] }], [], today, metric, 'mon'); // does not throw
    }
  }
});

test('a limit over your own dates is judged at the end, not on the first day', () => {
  const t = make('quit-smoking');
  const g: GoalDef = { id: 'g', measure: 'count', agg: 'count', how: 'total', cmp: 'max', value: 0, from: dayKey(addDays(today, -30)), until: dayKey(addDays(today, -1)) };
  const tr = { ...t, goals: [g] };
  const clean = goalEvents([tr], [], today, metric, 'mon');
  assert.equal(clean.length, 1);
  assert.equal(clean[0].success, true);
  assert.equal(clean[0].day, addDays(today, -1));
  const slipped = goalEvents([tr], [entry(addDays(today, -10))], today, metric, 'mon');
  assert.equal(slipped[0].success, false);
  const running = goalEvents([{ ...tr, goals: [{ ...g, until: dayKey(addDays(today, 10)) }] }], [], today, metric, 'mon');
  assert.equal(running.length, 0); // still in progress: nothing to reward yet
});

test('a goal can aim at one item of a plan, and suggestions use that item\u2019s own history', () => {
  const t = make('gym-split');
  const slots = t.plan.flatMap((v) => v.days.flatMap((d) => d.slots));
  const a = slots[0];
  const b = slots.find((s) => s.name.toLowerCase() !== a.name.toLowerCase())!;
  const log = (slotId: string, at: number, weight: number): Entry => ({ ...entry(at, { weight, reps: 5 }), id: `${slotId}${at}`, slotId });
  const entries = [log(a.id, addDays(today, -5), 100), log(a.id, addDays(today, -3), 110), log(b.id, addDays(today, -4), 200)];
  const g: GoalDef = { id: 'g', measure: 'weight', field: 'weight', item: a.name, agg: 'max', how: 'total', cmp: 'min', value: 120, from: dayKey(addDays(today, -10)) };
  const tr = { ...t, goals: [g] };
  assert.equal(goalProgress(tr, g, entries, today, metric, 'mon').value, 110); // not the other lift's 200
  assert.equal(goalProgress(tr, { ...g, item: b.name }, entries, today, metric, 'mon').value, 200);
  assert.equal(goalProgress(tr, { ...g, item: undefined }, entries, today, metric, 'mon').value, 200); // the whole tracker
  assert.ok(describeGoal(tr, g, metric).startsWith(`${a.name}: `));
  const sug = suggestGoals(tr, entries, metric, now).filter((x) => x.goal.item);
  assert.ok(sug.some((x) => x.goal.item === a.name && x.goal.value > 110), 'aims a step past that item\u2019s own best');
  // renaming a slot is a different item; an item with no matching entries counts nothing
  assert.equal(goalProgress(tr, { ...g, item: 'Nothing like this' }, entries, today, metric, 'mon').value, 0);
});

test('wording is neutral unless a starting point or the person chooses it', () => {
  const planned: Tracker = { ...draftFromAnswers(SHAPES.find((x) => x.id === 'planned')!.make(), metric), id: 't', systemId: 's', createdAt: 0 };
  assert.equal(termsOf(planned).item, 'Item');
  assert.equal(planned.measures.find((m) => m.id === 'sets')?.name, 'Rounds');
  const gym = make('gym-split');
  assert.equal(termsOf(gym).item, 'Exercise');
  assert.equal(gym.measures.find((m) => m.id === 'sets')?.name, 'Sets');
  const own = { ...planned, terms: { item: 'Route', row: 'Attempt', target: 'Grade' } };
  assert.equal(termsOf(own).row, 'Attempt');
  // goals read in the tracker's own words
  assert.ok(describeGoal(gym, { id: 'g', measure: 'count', agg: 'count', how: 'week', cmp: 'min', value: 20, from: '2026-11-01' }, metric).includes('sets'));
});

test('item suggestions follow what you do now, and skip items with no number to beat', () => {
  const t = make('gym-split');
  const slots = t.plan.flatMap((v) => v.days.flatMap((d) => d.slots));
  const names = [...new Set(slots.map((s) => s.name))];
  const idOf = (n: string) => slots.find((s) => s.name === n)!.id;
  const [old, now1, zero] = names;
  const log = (n: string, daysAgo: number, weight: number): Entry => ({ ...entry(addDays(today, -daysAgo), { weight, reps: 5 }), id: `${n}${daysAgo}${weight}`, slotId: idOf(n) });
  const entries = [
    ...[100, 101, 102, 103, 104].map((d, i) => log(old, d, 50 + i)), // lots of entries, but all long ago
    log(now1, 3, 60), log(now1, 10, 62), // fewer, but recent
    log(zero, 2, 0), log(zero, 5, 0), log(zero, 8, 0), // always zero
  ];
  const items = suggestGoals(t, entries, metric, now).filter((x) => x.goal.item).map((x) => x.goal.item);
  assert.deepEqual(items, [now1, old]); // recent beats old; the zero item is left out
});

test('a daily goal is one of the daily targets, edited like any goal', () => {
  const plain = make('water');
  const t = { ...plain, ...withDailyGoal(plain, { id: 'g0', measure: 'n', how: 'day' as const, cmp: 'min' as const, value: 8, from: '2026-11-01' }) };
  const [g] = dailyGoals(t);
  assert.equal(g.how, 'day');
  assert.equal(g.value, 8);
    assert.ok(describeGoal(t, g, metric).includes('a day'));
  // progress reads today's entries only
  const p = goalProgress(t, g, [entry(today, { n: 1 }), entry(today, { n: 1 }), entry(today, { n: 1 })], today, metric, 'mon');
  assert.equal(p.value, 3);
  assert.equal(p.fraction, 3 / 8);
  // adding a second daily goal keeps both in the daily rule
  const second = { id: 'g2', measure: 'count', how: 'day' as const, cmp: 'max' as const, value: 20, from: '2026-11-01' };
  const both = { ...t, ...withDailyGoal(t, second) };
  assert.equal(both.success.mode, 'targets');
  assert.equal(dailyGoals(both).length, 2);
  // removing every one falls back to showing up
  const none = { ...both, ...withoutDailyGoal({ ...both }, 'g2') };
  const gone = { ...none, ...withoutDailyGoal(none, g.id) };
  assert.equal(gone.success.mode, 'logged');
  assert.equal(dailyGoals(gone).length, 0);
  // a plan rule is kept when daily amount goals come and go
  const gym = make('gym-split', { success: { mode: 'plan', minPct: 80 } });
  const planned = { ...gym, ...withDailyGoal(gym, { id: 'd', measure: 'volume', how: 'day' as const, cmp: 'min' as const, value: 1000, from: '2026-11-01' }) };
  assert.equal(planned.success.mode, 'targets');
  assert.equal((planned.success as { planMinPct?: number }).planMinPct, 80);
  assert.equal({ ...planned, ...withoutDailyGoal(planned, 'd') }.success.mode, 'plan');
});

test('a goal can count only the entries where a choice has a given option', () => {
  const base = make('reading');
  const t = { ...base, fields: [...base.fields, { id: 'kind', name: 'Kind', type: 'choice' as const, options: ['Run', 'Swim'] }] };
  const e = (daysAgo: number, kind: string) => entry(addDays(today, -daysAgo), { kind });
  const entries = [e(1, 'Run'), e(2, 'Swim'), e(3, 'Run'), e(10, 'Run')];
  const g: GoalDef = { id: 'g', measure: 'days', agg: 'days', how: 'week', cmp: 'min', value: 3, from: dayKey(addDays(today, -30)), where: { field: 'kind', equals: 'Run' } };
  const p = goalProgress({ ...t, goals: [g] }, g, entries, today, metric, 'mon');
  assert.ok(p.value <= 2, 'swims and old runs are not counted');
  assert.ok(describeGoal(t, g, metric).endsWith('when kind is Run'));
  const sug = suggestGoals(t, [], metric, now).find((x) => x.key === 'choice-kind');
  assert.ok(sug && sug.goal.where?.equals === 'Run');
});

test('a time field gets a steady-window suggestion', () => {
  const base = make('mood');
  const t = { ...base, fields: [...base.fields, { id: 'bed', name: 'Bedtime', type: 'time' as const, default: 22 * 60 }] };
  const s = suggestGoals(t, [], metric, now).find((x) => x.key === 'window-bed')!;
  assert.equal(s.goal.cmp, 'range');
  assert.equal(s.goal.value, 22 * 60 - 30);
  assert.equal(s.goal.value2, 22 * 60 + 30);
});

test('goals chosen during setup are saved with the new tracker', () => {
  const a = TEMPLATES.find((x) => x.id === 'weigh-in')!.make();
  const draft = draftFromAnswers(a, metric);
  const t = { ...draft, id: 'new', systemId: null, createdAt: 0 } as Tracker;
  const pick = suggestGoals(t, [], metric, now)[0];
  const withGoal = draftFromAnswers({ ...a, startGoals: [{ ...pick.goal, id: 's-1' }] }, metric);
  assert.equal(withGoal.goals?.length, 1);
  assert.equal(draft.goals, undefined);
});

test('the bottom bar aims for five across, fewer on a narrow phone, and shares the width when there are few', () => {
  const edge = 2 * NAV.edge;
  const a53 = 411 - edge; // a Galaxy A53 is about 411 dp wide
  const six = itemWidthFor(a53, 6);
  assert.equal(six.visible, 5);
  assert.equal(six.fits, false);
  assert.ok(Math.abs(six.width * 5 - a53) < 1e-9, 'exactly five items fill the width');
  const few = itemWidthFor(375 - edge, 3);
  assert.equal(few.fits, true);
  assert.ok(few.width <= NAV.maxItem);
  assert.equal(itemWidthFor(320 - edge, 9).visible, 4, 'a narrow phone shows fewer, never squeezed below the minimum');
  assert.ok(itemWidthFor(320 - edge, 9).width >= NAV.minItem);
});

test('plans start empty, and day names entered in setup become the days’ titles', () => {
  const a = { ...TEMPLATES.find((x) => x.id === 'gym-split')!.make(), dayNames: { 1: 'Push', 3: 'Pull', 5: ' Legs ' } };
  const d = draftFromAnswers(a, metric);
  const days = d.plan[0].days;
  assert.ok(days.every((x) => x.slots.length === 0), 'nothing is pre-filled');
  assert.equal(days[1].label, 'Push');
  assert.equal(days[3].label, 'Pull');
  assert.equal(days[5].label, 'Legs');
  assert.equal(days[0].label, '', 'a day left out is just unnamed');
  assert.ok(!('rest' in days[0]), 'there is no rest flag');
  // an example can still be asked for, and your own names win over its names
  const ex = draftFromAnswers({ ...a, planMode: 'example', dayNames: { 1: 'Mine' } }, metric).plan[0].days;
  assert.equal(ex[1].label, 'Mine');
  assert.ok(ex[1].slots.length > 0);
});

test('default names are short enough to fit the bar, headers and cards without being cut off', () => {
  for (const tp of TEMPLATES) assert.ok(tp.name.length <= 16, `${tp.id}: "${tp.name}" is ${tp.name.length} characters`);
});
