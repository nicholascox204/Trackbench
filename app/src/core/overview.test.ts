import assert from 'node:assert/strict';
import test from 'node:test';
import { activeStreak, allGoals, bucketChoices, bucketFor, buckets, DayIndex, goalHistory, previewGoal, rangeFor, rankTrackers, series, shapesFor, startingPanels, MAX_ROWS } from './overview';
import { buildPersona, PERSONAS } from './personas';
import { addDays, startOfDay } from './time';
import type { GoalDef, Quest, Settings } from './types';

const SETTINGS = { units: 'metric', weekStart: 'mon' } as unknown as Settings;
const NOW = new Date(2026, 10, 22, 12).getTime(); // a Sunday
const TODAY = startOfDay(NOW);
const person = (id: string) => buildPersona(PERSONAS.find((p) => p.id === id)!, SETTINGS, null, NOW);
const indexOf = (id: string) => { const { trackers, entries } = person(id); return new DayIndex(trackers, entries); };
const byTemplate = (ix: DayIndex, tpl: string) => ix.trackers.find((t) => t.id.endsWith(tpl))!;

test('a period longer than the history is cut back to it and says so', () => {
  const ix = indexOf('sprawl'); // 28 days
  const year = rangeFor('year', TODAY, 'mon', ix.first);
  assert.equal(year.clamped, true);
  assert.ok(year.days <= 29 && year.days >= 27, `clamped to the history, got ${year.days}`);
  assert.match(year.label, /^All \d+ days$/);
  const v = indexOf('veteran');
  const y = rangeFor('year', TODAY, 'mon', v.first);
  assert.equal(y.clamped, false);
  assert.equal(y.days, 365);
});

test('the grain follows the length, and the toggle only offers readable ones', () => {
  const v = indexOf('veteran');
  const all = rangeFor('all', TODAY, 'mon', v.first);
  assert.equal(bucketFor(all), 'month');
  assert.ok(!bucketChoices(all, 'mon').includes('day'), 'three years is not offered by the day');
  const week = rangeFor('week', TODAY, 'mon', v.first);
  assert.equal(bucketFor(week), 'day');
  assert.deepEqual(buckets(week, 'day', 'mon').length, 7);
  const m = rangeFor('30d', TODAY, 'mon', v.first);
  assert.equal(bucketFor(m), 'day');
  assert.deepEqual(bucketChoices(m, 'mon'), ['day', 'week']);
});

test('weekly buckets are clipped to the range and cover it exactly', () => {
  const r = rangeFor('90d', TODAY, 'mon', addDays(TODAY, -400));
  const b = buckets(r, 'week', 'mon');
  assert.equal(b[0].start, r.start);
  assert.equal(b[b.length - 1].end, r.end);
  for (let i = 1; i < b.length; i++) assert.equal(b[i].start, addDays(b[i - 1].end, 1));
});

test('series: counts are zero when nothing happened, readings are undefined, the future is marked', () => {
  const ix = indexOf('regular');
  const water = byTemplate(ix, 'water');
  const weight = byTemplate(ix, 'weigh-in');
  const range = rangeFor('week', TODAY, 'mon', ix.first);
  const days = series({ kind: 'daysLogged', trackerId: water.id }, ix, range, 'day', TODAY, 'mon');
  assert.equal(days.length, 7);
  assert.ok(days.every((p) => p.value === undefined ? p.future : p.value >= 0));
  const field = weight.fields.find((f) => f.type === 'number')!;
  const long = rangeFor('all', TODAY, 'mon', ix.first);
  const line = series({ kind: 'field', trackerId: weight.id, field: field.id, agg: 'latest' }, ix, long, 'month', TODAY, 'mon');
  assert.ok(line.length >= 9 && line.length <= 12, `about ten months, got ${line.length}`);
  assert.ok(line.filter((p) => p.value !== undefined).length >= 8, 'a reading in most months');
});

test('which shapes suit a week and all time are not the same', () => {
  const ix = indexOf('veteran');
  const weight = byTemplate(ix, 'weigh-in');
  const f = weight.fields.find((x) => x.type === 'number')!;
  const src = { kind: 'field', trackerId: weight.id, field: f.id, agg: 'latest' } as const;
  assert.equal(shapesFor(src, rangeFor('week', TODAY, 'mon', ix.first))[0], 'bar');
  assert.equal(shapesFor(src, rangeFor('all', TODAY, 'mon', ix.first))[0], 'line');
  assert.equal(shapesFor({ kind: 'daysLogged', trackerId: weight.id }, rangeFor('90d', TODAY, 'mon', ix.first))[0], 'grid');
  assert.equal(shapesFor({ kind: 'goal' }, rangeFor('week', TODAY, 'mon', ix.first))[0], 'progress');
});

test('the starting Overview is built from the data, for every kind of person', () => {
  const kinds: Record<string, string[]> = {};
  for (const p of PERSONAS) {
    const ix = indexOf(p.id);
    const panels = startingPanels(ix, TODAY, []);
    kinds[p.id] = panels.map((x) => x.id);
    assert.ok(panels.some((x) => x.id === 'week') && panels.some((x) => x.id === 'streak'), `${p.id} always has the week and a streak`);
    assert.ok(panels.every((x) => x.rows === undefined || x.rows <= MAX_ROWS), `${p.id} panels stay within ${MAX_ROWS} rows`);
  }
  assert.ok(!kinds.fresh.includes('ranked'), 'five days is too little for a ranking');
    assert.ok(kinds.regular.includes('ranked') && kinds.regular.includes('line'));
  assert.ok(kinds.deep.includes('ranked'));
  assert.ok(kinds.sprawl.includes('week'));
  const v = startingPanels(indexOf('veteran'), TODAY, []).find((x) => x.id === 'line');
  assert.equal(v?.period, '90d');
  assert.equal(startingPanels(indexOf('sprawl'), TODAY, []).find((x) => x.id === 'ranked')?.period, 'all', 'a month of data ranks over all of it');
});

test('a goals panel appears only when there are goals', () => {
  const ix = indexOf('regular');
  const t = byTemplate(ix, 'water');
  const def: GoalDef = { id: 'g1', measure: 'days', agg: 'days', how: 'week', cmp: 'min', value: 4, from: '2026-01-05' };
  const goals = allGoals([{ ...t, goals: [def] }], []);
  assert.ok(startingPanels(ix, TODAY, goals).some((p) => p.id === 'goals'));
  assert.ok(!startingPanels(ix, TODAY, []).some((p) => p.id === 'goals'));
});

test('goal history judges finished weeks only, and counts the runs', () => {
  const ix = indexOf('regular');
  const t = byTemplate(ix, 'water');
  const def: GoalDef = { id: 'g1', measure: 'days', agg: 'days', how: 'week', cmp: 'min', value: 4, from: '1970-01-01' };
  const h = goalHistory({ kind: 'tracker', tracker: t, def }, ix, TODAY, 'mon')!;
  assert.ok(h.periods.length >= 38 && h.periods.length <= 43, `about 300 days of weeks, got ${h.periods.length}`);
  assert.ok(h.periods.every((p) => p.end < TODAY), 'nothing unfinished is judged');
  assert.equal(h.met, h.periods.filter((p) => p.met).length);
  assert.ok(h.best >= h.current && h.best <= h.met);
  const first = ix.firstOf(t.id)!;
  assert.ok(h.periods[0].start >= first, 'nothing before they started');
  const total: GoalDef = { ...def, how: 'total' };
  assert.equal(goalHistory({ kind: 'tracker', tracker: t, def: total }, ix, TODAY, 'mon'), undefined);
});

test('a harder goal is met less often than an easier one on the same history', () => {
  const ix = indexOf('regular');
  const t = byTemplate(ix, 'water');
  const mk = (value: number): GoalDef => ({ id: 'g', measure: 'days', agg: 'days', how: 'week', cmp: 'min', value, from: '1970-01-01' });
  const easy = goalHistory({ kind: 'tracker', tracker: t, def: mk(2) }, ix, TODAY, 'mon')!;
  const hard = goalHistory({ kind: 'tracker', tracker: t, def: mk(7) }, ix, TODAY, 'mon')!;
  assert.ok(easy.met >= hard.met);
});

test('the preview tries a goal on the last periods of real history', () => {
  const ix = indexOf('casual');
  const t = byTemplate(ix, 'water');
  const def: GoalDef = { id: 'g', measure: 'days', agg: 'days', how: 'week', cmp: 'min', value: 3, from: '2026-11-22' };
  const p = previewGoal(t, def, ix, TODAY, 'mon', 6)!;
  assert.equal(p.of, 6);
  assert.ok(p.met >= 0 && p.met <= 6);
  assert.ok(p.periods.every((x) => x.end < TODAY));
  const fresh = indexOf('fresh');
  const pf = previewGoal(byTemplate(fresh, 'water'), def, fresh, TODAY, 'mon', 6)!;
  assert.ok(pf.of < 6, 'five days of history gives no full weeks to try it on');
  assert.equal(previewGoal(t, { ...def, how: 'total' }, ix, TODAY, 'mon'), undefined);
});

test('a quest over all trackers has a history too', () => {
  const ix = indexOf('deep');
  const mk = (value: number): Quest => ({ id: 'q1', trackers: 'all', metric: 'trackersDone', how: 'week', value, from: '1970-01-01' });
  const sums = goalHistory({ kind: 'quest', quest: mk(0) }, ix, TODAY, 'mon')!.periods.map((p) => p.value as number).sort((a, b) => a - b);
  const median = sums[Math.floor(sums.length / 2)];
  const h = goalHistory({ kind: 'quest', quest: mk(median) }, ix, TODAY, 'mon')!;
  assert.ok(h.periods.length > 70);
  assert.ok(h.met > 0 && h.met < h.periods.length, 'some weeks met, some not');
});

test('the streak across trackers: best is never below current, and a long history has a real best', () => {
  for (const p of PERSONAS) {
    const s = activeStreak(indexOf(p.id), TODAY);
    assert.ok(s.best >= s.current, p.id);
  }
  assert.ok(activeStreak(indexOf('veteran'), TODAY).best >= 5);
  const reg = indexOf('regular');
  assert.ok(activeStreak(reg, TODAY).best < 250, 'a regular person skips days, so the best run is not every day of 300');
});

test('trackers rank by days logged, most first', () => {
  const ix = indexOf('deep');
  const r = rankTrackers(ix, rangeFor('90d', TODAY, 'mon', ix.first), TODAY);
  assert.equal(r.length, 18);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].days >= r[i].days);
});

test('the biggest example person is fast enough to draw', () => {
  const ix = indexOf('deep');
  const t0 = Date.now();
  startingPanels(ix, TODAY, []);
  const all = rangeFor('all', TODAY, 'mon', ix.first);
  for (const t of ix.trackers) series({ kind: 'goodDays', trackerId: t.id }, ix, all, 'month', TODAY, 'mon');
  series({ kind: 'trackersDone' }, ix, all, 'month', TODAY, 'mon');
  activeStreak(ix, TODAY);
  const ms = Date.now() - t0;
  console.log(`  18 trackers, 540 days: starting panels, 19 series and the streak in ${ms} ms`);
  assert.ok(ms < 8000, `took ${ms} ms`);
});

test('the share of the system done: a day is 0 to 1, a rest day is undefined, and levels nest', async () => {
  const { systemShare, shareSeries } = await import('./overview');
  for (const p of PERSONAS) {
    const ix = indexOf(p.id);
    const all = rangeFor('all', TODAY, 'mon', ix.first);
    const days = shareSeries(ix, all, 'day', TODAY, 'mon');
    assert.ok(days.every((d) => d.value === undefined || (d.value >= 0 && d.value <= 1)), p.id);
    assert.ok(days.filter((d) => d.value !== undefined).length > days.length * 0.5, `${p.id} most days have something in play`);
  }
  const ix = indexOf('regular');
  assert.equal(systemShare(ix, addDays(TODAY, -2000)), undefined, 'before they started there is nothing in play');
  const all = rangeFor('all', TODAY, 'mon', ix.first);
  const months = shareSeries(ix, all, 'month', TODAY, 'mon');
  const mean = (a: (number | undefined)[]) => { const v = a.filter((x): x is number => x !== undefined); return v.reduce((s, x) => s + x, 0) / v.length; };
  const overall = mean(shareSeries(ix, all, 'day', TODAY, 'mon').map((d) => d.value));
  assert.ok(Math.abs(mean(months.map((m) => m.value)) - overall) < 0.06, 'months roughly average to the whole');
});
