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

// ---- judged at each tracker's own cadence, never by how often you log ----
import { attainment, periodShare, systemShare } from './overview';
import type { Entry, Schedule, Tracker } from './types';

const WEEK0 = addDays(TODAY, -6); // the Monday of the current week (today is a Sunday)
const mkEntry = (t: Tracker, day: number, i = 0): Entry => ({ id: `e${t.id}${day}${i}`, trackerId: t.id, at: day + 12 * 3600000, done: true, values: {} });
const base = () => { const p = person('regular'); return { water: byTemplate(new DayIndex(p.trackers, p.entries), 'water'), mood: byTemplate(new DayIndex(p.trackers, p.entries), 'mood') }; };
const withSchedule = (t: Tracker, schedule: Schedule): Tracker => ({ ...t, schedule, createdAt: 0, window: undefined });
const lastFullWeek = addDays(WEEK0, -7);

test('a once-a-week task done once is a full week, and the days around it are rest, not misses', () => {
  const { water } = base();
  const t = withSchedule(water, { kind: 'times', n: 1, per: 'week' });
  const entries = [-5, -4, -3].map((w) => mkEntry(t, addDays(WEEK0, 7 * w + 2))); // a Wednesday in each of three earlier weeks
  const ix = new DayIndex([t], entries);
  assert.equal(periodShare(ix, lastFullWeek, addDays(lastFullWeek, 6), TODAY, 'mon'), 0, 'a finished week with the task not done is a miss: that is what it was set up to ask');
  const wk = addDays(WEEK0, -7 * 3);
  assert.equal(periodShare(ix, wk, addDays(wk, 6), TODAY, 'mon'), 1, 'done once in a week that asked once is a full week');
  const firstWeek = addDays(WEEK0, -7 * 5);
  assert.equal(periodShare(ix, firstWeek, addDays(firstWeek, 6), TODAY, 'mon'), 1, 'the week they began part way through is not judged against the schedule, but they logged, so it counts as showing up');
  assert.equal(systemShare(ix, addDays(WEEK0, -7 * 4 + 1)), undefined, 'a day with nothing due and nothing logged is rest');
  assert.equal(systemShare(ix, addDays(WEEK0, -7 * 4 + 2)), 1, 'logging on a day where nothing was due is a full day of showing up');
});

test('weekly attainment: two of three is two thirds, and an unfinished week is not judged', () => {
  const { water } = base();
  const t = withSchedule(water, { kind: 'times', n: 3, per: 'week' });
  const w1 = addDays(WEEK0, -14); const w2 = addDays(WEEK0, -7);
  const entries = [w1, addDays(w1, 2), addDays(w1, 4), w2, addDays(w2, 3)].map((d) => mkEntry(t, d));
  const ix = new DayIndex([t], entries);
  assert.equal(attainment(ix, t, w2, addDays(w2, 6), addDays(w2, 6), TODAY, 'mon'), 2 / 3);
  assert.equal(attainment(ix, t, w1, addDays(w1, 6), addDays(w1, 6), TODAY, 'mon'), 1, 'began on the Monday, so the first week is whole and met');
  assert.equal(attainment(ix, t, WEEK0, TODAY, addDays(WEEK0, 6), TODAY, 'mon'), undefined, 'this week is still going');
});

test('a weekly tracker counts as much as a daily one in a week, not one day in seven', () => {
  const { water, mood } = base();
  const weekly = withSchedule(water, { kind: 'times', n: 1, per: 'week' });
  const daily = withSchedule(mood, { kind: 'daily' });
  const w = addDays(WEEK0, -7);
  const earlier = addDays(WEEK0, -14);
  const entries = [mkEntry(weekly, earlier), mkEntry(daily, earlier), mkEntry(weekly, addDays(w, 3)), ...[0, 1, 2].map((i) => mkEntry(daily, addDays(w, i)))];
  const ix = new DayIndex([weekly, daily], entries);
  const share = periodShare(ix, w, addDays(w, 6), TODAY, 'mon')!;
  const expected = (1 + 3 / 7) / 2; // weekly task done (1) and the daily one kept on three of its seven days
  assert.ok(Math.abs(share - expected) < 1e-9, `${share} vs ${expected}`);
});

test('"whenever" is never judged, and logging it still counts as showing up', () => {
  const { water } = base();
  const t = withSchedule(water, { kind: 'whenever' });
  const ix = new DayIndex([t], [mkEntry(t, addDays(WEEK0, -20)), mkEntry(t, addDays(WEEK0, -3))]);
  const w = addDays(WEEK0, -7);
  assert.equal(periodShare(ix, w, addDays(w, 6), TODAY, 'mon'), 1, 'logged in that week');
  const quiet = addDays(WEEK0, -14);
  assert.equal(periodShare(ix, quiet, addDays(quiet, 6), TODAY, 'mon'), undefined, 'a week with nothing logged and nothing owed is not a miss');
});

test('the streak is not broken by rest days', () => {
  const { water } = base();
  const t = withSchedule(water, { kind: 'weekdays', days: [1, 3, 5] }); // Mon Wed Fri
  const entries: Entry[] = [];
  for (let d = addDays(WEEK0, -21); d <= TODAY; d = addDays(d, 1)) if ([1, 3, 5].includes(new Date(d).getDay())) entries.push(mkEntry(t, d));
  const ix = new DayIndex([t], entries);
  const s = activeStreak(ix, TODAY);
  assert.ok(s.current >= 9, `kept every due day, so the run covers them all, got ${s.current}`);
});
