// The Overview: one place to see how all your trackers are going together (see docs/hub-spec.md). A first live version to judge
// the look on real-shaped data. One measure runs through it, how much of your system you did on a day (core/overview.ts), drawn
// in the highlight colour you chose. The main picture can be switched: the ladder (months build on weeks build on days), a year
// of days, each tracker on its own, a reading as a line, or a ranking.
import { useMemo, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { mixHex } from '../core/colour';
import { periodOf } from '../core/goals';
import {
  activeStreak, bucketFor, buckets, DayIndex, periodShare, rangeFor, series, shareSeries, systemShare,
  type Point,
} from '../core/overview';
import { bestMeasure, dailyValues, limitOf, mainField, pagePanels, records, trendOf, type PanelSpec } from '../core/panels';
import { useAppState } from '../core/store';
import { addDays, startOfDay } from '../core/time';
import { formatFieldValue, formatMeasure } from '../core/units';
import type { Tracker } from '../core/types';
import { Card, ChoiceGrid, Icon, Scroll, Tap, colors, useTopPad } from '../ui/kit';
import { EDGE, px } from '../ui/theme';

const GAP = 3;

const dateText = (d: number): string => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const monthText = (d: number): string => new Date(d).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
const pct = (v: number | undefined): string => (v === undefined ? 'nothing due' : `${Math.round(v * 100)}%`);

// Five steps from the empty colour up to the highlight; the same scale at every size.
function stepColour(v: number | undefined): string {
  if (v === undefined) return 'transparent';
  const raised = colors.raised;
  const level = v < 0.01 ? 0 : v < 0.34 ? 1 : v < 0.67 ? 2 : v < 0.9 ? 3 : 4;
  return level === 0 ? raised : mixHex(raised, colors.accent, [0, 0.3, 0.55, 0.8, 1][level]);
}

function Cell({ v, h, radius = 3, outlined, edge }: { v: number | undefined; h: number; radius?: number; outlined?: boolean; edge?: boolean }) {
  return <View style={{ height: h, borderRadius: radius, backgroundColor: stepColour(v), borderWidth: v === undefined || edge ? px(1) : 0, borderColor: colors.border, ...(outlined ? { borderWidth: EDGE, borderColor: colors.text } : null) }} />;
}


const Caption = ({ children }: { children: string }) => <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6, marginTop: 14 }}>{children}</Text>;

export function Overview() {
  const { state } = useAppState();
  const top = useTopPad();
  const { width } = useWindowDimensions();
  const inner = Math.min(width, 600) - 32;
  const today = startOfDay(Date.now());
  const ws = state.settings.weekStart ?? 'mon';
  const [system, setSystem] = useState<'ladder' | 'year'>('ladder');
  const [selMonth, setSelMonth] = useState<number | null>(null);
  const [selWeek, setSelWeek] = useState<number | null>(null);
  const [edit, setEdit] = useState(false);
  const [hide, setHide] = useState<string[]>([]); // panels put away; kept for this visit only until the page layout is saved with the account

  const ix = useMemo(() => new DayIndex(state.trackers, state.entries), [state.trackers, state.entries]);
  const all = useMemo(() => rangeFor('all', today, ws, ix.first), [ix, today, ws]);
  const streak = useMemo(() => activeStreak(ix, today), [ix, today]);
  const recent = useMemo(() => {
    const r = rangeFor('30d', today, ws, ix.first);
    return { share: periodShare(ix, r.start, today, today, ws), label: r.label }; // each tracker at its own cadence, so a weekly task counts as much as a daily one
  }, [ix, today, ws]);

  if (ix.first === undefined) {
    return (
      <View style={{ flex: 1, paddingTop: top, paddingHorizontal: 16 }}>
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '700' }}>Overview</Text>
        <Text style={{ color: colors.muted, fontSize: 15, marginTop: 8 }}>Log something in any tracker and your whole picture starts to build here.</Text>
      </View>
    );
  }

  const cols = 12;
  const colW = (inner - GAP * (cols - 1)) / cols;

  // ----- the ladder -----
  function ladder() {
    const months = buckets(all, 'month', ws);
    const shown = months.length > 48 ? months.slice(months.length - 48) : months;
    const values = shown.map((m) => shareSeries(ix, { ...all, start: m.start, end: m.end }, 'month', today, ws)[0]?.value);
    const mi = selMonth !== null && selMonth < shown.length ? selMonth : shown.length - 1;
    const anchor = Math.min(shown[mi].end, today);
    const lastWeek = periodOf('week', anchor, ws).start;
    const starts = Array.from({ length: 12 }, (_, i) => addDays(lastWeek, -7 * (11 - i)));
    const wk = selWeek !== null && starts.includes(selWeek) ? selWeek : lastWeek;
    const dayVal = (d: number) => (d > today || (ix.first !== undefined && d < ix.first) ? undefined : systemShare(ix, d));
    const weekAvg = (s: number) => periodShare(ix, s, addDays(s, 6), today, ws);
    const tiles = [] as { v: number | undefined; i: number }[];
    values.forEach((v, i) => tiles.push({ v, i }));
    const rows: (typeof tiles)[] = [];
    for (let i = 0; i < tiles.length; i += cols) rows.push(tiles.slice(i, i + cols));
    return (
      <View>
        <Caption>{`All time, by month${months.length > 48 ? ' (latest four years)' : ''}`}</Caption>
        {rows.map((r, ri) => (
          <View key={ri} style={{ flexDirection: 'row', marginBottom: GAP }}>
            {r.map((t) => (
              <Tap key={t.i} onPress={() => { setSelMonth(t.i); setSelWeek(null); }} style={{ width: colW, marginRight: GAP }}>
                <Cell v={t.v} h={34} radius={4} outlined={t.i === mi} />
              </Tap>
            ))}
          </View>
        ))}
        <Text style={{ color: colors.muted, fontSize: 12 }}>{`${monthText(shown[mi].start)} · ${pct(values[mi])}`}</Text>

        <Caption>Twelve weeks to then</Caption>
        <View style={{ flexDirection: 'row' }}>
          {starts.map((s) => (
            <Tap key={s} onPress={() => setSelWeek(s)} style={{ width: colW, marginRight: GAP }}>
              <View style={{ gap: 2, padding: s === wk ? 0 : 0, borderRadius: 4, borderWidth: s === wk ? EDGE : 0, borderColor: colors.text, margin: s === wk ? -EDGE : 0 }}>
                {Array.from({ length: 7 }, (_, i) => <Cell key={i} v={dayVal(addDays(s, i))} h={14} radius={2} />)}
              </View>
            </Tap>
          ))}
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>{`Week of ${dateText(wk)} · ${pct(weekAvg(wk))}`}</Text>

        <Caption>That week, day by day</Caption>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {Array.from({ length: 7 }, (_, i) => {
            const d = addDays(wk, i);
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ alignSelf: 'stretch' }}><Cell v={dayVal(d)} h={38} radius={6} /></View>
                <Text style={{ color: colors.muted, fontSize: 10, marginTop: 3 }}>{new Date(d).toLocaleDateString(undefined, { weekday: 'narrow' })}</Text>
                <Text style={{ color: colors.muted, fontSize: 10 }}>{new Date(d).getDate()}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  // ----- a year of days -----
  function year() {
    const r = rangeFor('year', today, ws, ix.first);
    const first = periodOf('week', r.start, ws).start;
    const n = Math.round((periodOf('week', today, ws).start - first) / 604800000) + 1;
    const cw = Math.min(22, (inner - GAP * (n - 1)) / n);
    return (
      <View>
        <Caption>{`${r.label}, a square for each day`}</Caption>
        <View style={{ flexDirection: 'row' }}>
          {Array.from({ length: n }, (_, c) => {
            const s = addDays(first, c * 7);
            return (
              <View key={c} style={{ width: cw, marginRight: GAP, gap: 2 }}>
                {Array.from({ length: 7 }, (_, i) => {
                  const d = addDays(s, i);
                  const off = d > today || (ix.first !== undefined && d < ix.first);
                  return <Cell key={i} v={off ? undefined : systemShare(ix, d)} h={cw} radius={Math.max(2, cw / 6)} />;
                })}
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  // ----- one panel per tracker, each in its own shape -----
  const hidden = new Set(hide);
  const cardW = inner - 30;
  function habitGrid(t: Tracker) {
    const from = Math.max(addDays(today, -27), ix.firstOf(t.id) ?? today);
    const days = Array.from({ length: Math.round((today - from) / 86400000) + 1 }, (_, i) => addDays(from, i));
    let due = 0; let good = 0;
    const cells = days.map((d) => {
      const r = ix.result(t, d);
      if (r.expected) due++;
      if (r.expected && r.success) good++;
      return r.expected || r.success ? ix.progress(t, d) : undefined;
    });
    const logged = days.filter((d) => ix.on(t.id, d).some((e) => e.done)).length;
    return (
      <View>
        <View style={{ flexDirection: 'row', gap: 2 }}>{cells.map((v, i) => <View key={i} style={{ flex: 1 }}><Cell v={v} h={22} radius={3} edge /></View>)}</View>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>{due > 0 ? `${good} good days of the ${due} it asked for, last ${days.length}` : `Logged on ${logged} of the last ${days.length} days`}</Text>
      </View>
    );
  }
  function limitBars(t: Tracker) {
    const lim = limitOf(t)!;
    const pts = dailyValues(t, ix, lim.measure.id, addDays(today, -27), today, today);
    const top = Math.max(lim.max * 1.4, ...pts.map((p) => p.value ?? 0)) || 1;
    const H = 70;
    const over = pts.filter((p) => (p.value ?? 0) > lim.max).length;
    return (
      <View>
        <View style={{ height: H, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
          {pts.map((p, i) => <View key={i} style={{ flex: 1, height: Math.max(2, ((p.value ?? 0) / top) * H), borderRadius: 2, backgroundColor: (p.value ?? 0) === 0 ? colors.raised : (p.value ?? 0) > lim.max ? colors.muted : colors.accent }} />)}
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: (lim.max / top) * H, height: 1, backgroundColor: colors.text, opacity: 0.6 }} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>{`${over === 0 ? 'Never over' : `Over on ${over} of 28 days,`} the limit of ${formatMeasure(t, lim.measure, lim.max, state.settings)}`}</Text>
      </View>
    );
  }
  function readingLine(t: Tracker) {
    const f = mainField(t)!;
    const range = rangeFor('90d', today, ws, ix.first);
    const src = { kind: 'field', trackerId: t.id, field: f.id, agg: f.reading ? 'latest' : 'sum' } as const;
    const pts = series(src, ix, range, bucketFor(range), today, ws).filter((p) => !p.future);
    const tr = trendOf(pts);
    return (
      <View>
        {tr ? <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>{tr.change === 0 ? `Level since ${dateText(tr.since)}` : `${tr.change < 0 ? 'Down' : 'Up'} ${formatFieldValue(f, Math.abs(tr.change), state.settings)} since ${dateText(tr.since)}`}</Text> : null}
        <Chart pts={pts} shape="line" w={cardW} fmt={(n) => formatFieldValue(f, n, state.settings)} />
      </View>
    );
  }
  function bestStairs(t: Tracker) {
    const m = bestMeasure(t);
    if (!m) return null;
    const span = rangeFor('all', today, ws, ix.first);
    const r = records(t, ix, span, bucketFor(span) === 'day' ? 'week' : bucketFor(span), today, ws);
    const recent = r.days.filter((d) => d >= addDays(today, -89)).length;
    return (
      <View style={{ marginTop: 14 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>{r.best === undefined ? 'No best yet' : `Best ${m.name.toLowerCase()} ${formatMeasure(t, m, r.best, state.settings)}${recent > 0 ? `, ${recent} new in 90 days` : ''}`}</Text>
        <Chart pts={r.points.filter((p) => !p.future)} shape="line" w={cardW} fmt={(n) => formatMeasure(t, m, n, state.settings)} />
      </View>
    );
  }
  function panelCard(p: PanelSpec) {
    const t = p.tracker;
    return (
      <View key={p.id} style={{ marginTop: 12, padding: 15, borderRadius: 14, borderWidth: EDGE, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Icon name={t.icon} size={16} color={colors.muted} />
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginLeft: 8, flex: 1 }}>{t.name}</Text>
          {edit ? <Tap onPress={() => setHide([...hide, p.id])}><Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>Hide</Text></Tap> : null}
        </View>
        {p.kind === 'reading' ? readingLine(t) : p.kind === 'limit' ? limitBars(t) : habitGrid(t)}
        {p.kind === 'plan' ? bestStairs(t) : null}
      </View>
    );
  }
  const specs = pagePanels(ix, today, addDays(today, -89));
  const shown = specs.filter((p) => !hidden.has(p.id));
  const tucked = specs.filter((p) => hidden.has(p.id));

  return (
    <Scroll contentContainerStyle={{ paddingTop: top, paddingHorizontal: 16, paddingBottom: 40, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{state.settings.name ? `${state.settings.name}, ${ix.first === undefined ? '' : daysSince(ix.first, today)}` : daysSince(ix.first, today)}</Text>
      <Text style={{ color: colors.accent, fontSize: 56, fontWeight: '700', lineHeight: 62, marginTop: 2 }}>{recent.share === undefined ? '–' : `${Math.round(recent.share * 100)}%`}</Text>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{`of your system done, ${recent.label.toLowerCase()}`}</Text>
      <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>{`Streak ${streak.current} ${streak.current === 1 ? 'day' : 'days'} · best ${streak.best}`}</Text>

      <View style={{ marginTop: 16, padding: 15, borderRadius: 14, borderWidth: EDGE, borderColor: colors.border }}>
        <ChoiceGrid cols={2} value={system} onPick={(k) => setSystem(k as 'ladder' | 'year')} options={[{ key: 'ladder', label: 'Ladder' }, { key: 'year', label: 'Year' }]} />
        {system === 'ladder' ? ladder() : year()}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
          <Text style={{ color: colors.muted, fontSize: 11, marginRight: 6 }}>Less</Text>
          {[0, 0.2, 0.5, 0.8, 1].map((v) => <View key={v} style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: stepColour(v), marginRight: 4 }} />)}
          <Text style={{ color: colors.muted, fontSize: 11 }}>more of your system done</Text>
        </View>
      </View>

      {shown.map(panelCard)}

      {edit && tucked.length > 0 ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Put away</Text>
          <Card style={{ padding: 0 }}>{tucked.map((p, i) => (
            <Tap key={p.id} onPress={() => setHide(hide.filter((h) => h !== p.id))}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 15 }}>{p.tracker.name}</Text>
                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>Show</Text>
              </View>
            </Tap>
          ))}</Card>
        </View>
      ) : null}
      <Tap onPress={() => setEdit(!edit)} style={{ alignSelf: 'center', paddingVertical: 14, marginTop: 8 }}>
        <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>{edit ? 'Done' : 'Edit this page'}</Text>
      </Tap>
    </Scroll>
  );
}


function daysSince(first: number, today: number): string {
  const n = Math.round((today - first) / 86400000) + 1;
  return `${n} ${n === 1 ? 'day' : 'days'} of tracking`;
}

// A reading drawn as a line or as bars; slices with nothing to say are skipped, not dropped to zero.
function Chart({ pts, shape, w, fmt }: { pts: Point[]; shape: 'line' | 'bar'; w: number; fmt: (n: number) => string }) {
  const h = 150;
  const vals = pts.map((p) => p.value).filter((v): v is number => v !== undefined);
  if (vals.length < 2) return <Text style={{ color: colors.muted, fontSize: 13 }}>Not enough readings in this period yet.</Text>;
  const lo = Math.min(...vals); const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.15 || 1;
  const min = shape === 'bar' ? 0 : lo - pad; const max = hi + pad;
  const x = (i: number) => 6 + (i * (w - 12)) / Math.max(1, pts.length - 1);
  const y = (v: number) => 8 + (1 - (v - min) / (max - min)) * (h - 16);
  let d = ''; let pen = false;
  pts.forEach((p, i) => { if (p.value === undefined) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)} `; pen = true; });
  const last = [...pts].reverse().find((p) => p.value !== undefined);
  const lastI = last ? pts.lastIndexOf(last) : -1;
  const bw = Math.max(2, Math.min(24, (w - 12) / pts.length - 2));
  return (
    <View>
      <Svg width={w} height={h}>
        <Rect x={0} y={h - 1} width={w} height={1} fill={colors.border} />
        {shape === 'line' ? <Path d={d} fill="none" stroke={colors.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" /> : pts.map((p, i) => (p.value === undefined ? null : <Rect key={i} x={x(i) - bw / 2} y={y(p.value)} width={bw} height={Math.max(1, h - 8 - y(p.value))} rx={2} fill={colors.accent} />))}
        {shape === 'line' && last && last.value !== undefined ? <Circle cx={x(lastI)} cy={y(last.value)} r={5} fill={colors.accent} stroke={colors.bg} strokeWidth={2} /> : null}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{`${dateText(pts[0].start)}`}</Text>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{last?.value === undefined ? '' : `Latest ${fmt(last.value)}`}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{`${dateText(pts[pts.length - 1].end)}`}</Text>
      </View>
    </View>
  );
}
