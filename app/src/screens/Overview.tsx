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
  PERIOD_CHOICES, activeStreak, bucketChoices, bucketFor, buckets, DayIndex, rangeFor, rankTrackers, series, shapesFor, shareSeries, systemShare,
  type Bucket, type PeriodChoice, type Point,
} from '../core/overview';
import { useAppState } from '../core/store';
import { addDays, startOfDay } from '../core/time';
import { formatFieldValue } from '../core/units';
import type { Tracker } from '../core/types';
import { Icon, Scroll, Tap, colors, useTopPad } from '../ui/kit';
import { EDGE, px } from '../ui/theme';

type View_ = 'ladder' | 'year' | 'trackers' | 'lines' | 'rank';
const VIEWS: { id: View_; label: string }[] = [
  { id: 'ladder', label: 'Ladder' }, { id: 'year', label: 'Year' }, { id: 'trackers', label: 'Trackers' }, { id: 'lines', label: 'Lines' }, { id: 'rank', label: 'Ranking' },
];
const PERIOD_LABEL: Record<PeriodChoice, string> = { week: 'Week', month: 'Month', '30d': '30 days', '90d': '90 days', year: 'Year', all: 'All' };
const BUCKET_LABEL: Record<Bucket, string> = { day: 'Days', week: 'Weeks', month: 'Months' };
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

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Tap onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: EDGE, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentBg : 'transparent', marginRight: 6, marginBottom: 6 }}>
      <Text style={{ color: on ? colors.text : colors.muted, fontSize: 13, fontWeight: on ? '700' : '600' }}>{label}</Text>
    </Tap>
  );
}

const Caption = ({ children }: { children: string }) => <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6, marginTop: 14 }}>{children}</Text>;

export function Overview() {
  const { state } = useAppState();
  const top = useTopPad();
  const { width } = useWindowDimensions();
  const inner = Math.min(width, 600) - 32;
  const today = startOfDay(Date.now());
  const ws = state.settings.weekStart ?? 'mon';
  const [view, setView] = useState<View_>('ladder');
  const [period, setPeriod] = useState<PeriodChoice>('90d');
  const [grain, setGrain] = useState<Bucket | null>(null);
  const [selMonth, setSelMonth] = useState<number | null>(null);
  const [selWeek, setSelWeek] = useState<number | null>(null);
  const [lineId, setLineId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const ix = useMemo(() => new DayIndex(state.trackers, state.entries), [state.trackers, state.entries]);
  const all = useMemo(() => rangeFor('all', today, ws, ix.first), [ix, today, ws]);
  const streak = useMemo(() => activeStreak(ix, today), [ix, today]);
  const recent = useMemo(() => {
    const r = rangeFor('30d', today, ws, ix.first);
    let sum = 0; let n = 0;
    for (let d = r.start; d <= today; d = addDays(d, 1)) { const v = systemShare(ix, d); if (v !== undefined) { sum += v; n++; } }
    return { share: n === 0 ? undefined : sum / n, label: r.label };
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
    const weekAvg = (s: number) => { const v = Array.from({ length: 7 }, (_, i) => dayVal(addDays(s, i))).filter((x): x is number => x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };
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

  // ----- each tracker on its own -----
  function perTracker() {
    const r = rangeFor('90d', today, ws, ix.first);
    const ranked = rankTrackers(ix, r, today);
    const list = showAll ? ranked : ranked.slice(0, 6);
    const wr = rangeFor('90d', today, ws, ix.first);
    return (
      <View>
        <Caption>{`Good days a week, ${wr.label.toLowerCase()}`}</Caption>
        {list.map(({ tracker, days }) => {
          const pts = series({ kind: 'goodDays', trackerId: tracker.id }, ix, wr, 'week', today, ws);
          return (
            <View key={tracker.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 96, flexDirection: 'row', alignItems: 'center' }}>
                <Icon name={tracker.icon} size={16} color={colors.muted} />
                <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, marginLeft: 6, flex: 1 }}>{tracker.name}</Text>
              </View>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', height: 26, gap: 2 }}>
                {pts.map((p, i) => <View key={i} style={{ flex: 1, height: Math.max(2, ((p.value ?? 0) / 7) * 26), borderRadius: 2, backgroundColor: p.value === undefined ? 'transparent' : p.value === 0 ? colors.raised : colors.accent, opacity: p.future ? 0.2 : 1 }} />)}
              </View>
              <Text style={{ color: colors.muted, fontSize: 12, width: 44, textAlign: 'right' }}>{`${days} d`}</Text>
            </View>
          );
        })}
        {ranked.length > 6 ? (
          <Tap onPress={() => setShowAll(!showAll)} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{showAll ? 'Show the top six' : `Show all ${ranked.length}`}</Text>
          </Tap>
        ) : null}
      </View>
    );
  }

  // ----- a reading over time -----
  function lines() {
    const withNumber = state.trackers.filter((t) => t.fields.some((f) => f.type === 'number')).sort((a, b) => readingScore(b) - readingScore(a)); // one-reading-a-day trackers and true readings (a weigh-in) first
    if (withNumber.length === 0) return <Caption>None of your trackers records a number yet.</Caption>;
    const t: Tracker = withNumber.find((x) => x.id === lineId) ?? withNumber[0];
    const f = t.fields.find((x) => x.type === 'number' && x.reading) ?? t.fields.find((x) => x.type === 'number')!;
    const range = rangeFor(period, today, ws, ix.first);
    const choices = bucketChoices(range, ws);
    const b: Bucket = grain && choices.includes(grain) ? grain : choices.includes(bucketFor(range)) ? bucketFor(range) : choices[0] ?? 'day';
    const src = { kind: 'field', trackerId: t.id, field: f.id, agg: f.reading ? 'latest' : 'sum' } as const;
    const pts = series(src, ix, range, b, today, ws).filter((p) => !p.future);
    const shape = shapesFor(src, range)[0];
    return (
      <View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>{withNumber.map((x) => <Chip key={x.id} label={x.name} on={x.id === t.id} onPress={() => setLineId(x.id)} />)}</View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{PERIOD_CHOICES.map((p) => <Chip key={p} label={PERIOD_LABEL[p]} on={p === period} onPress={() => { setPeriod(p); setGrain(null); }} />)}</View>
        {choices.length > 1 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{choices.map((c) => <Chip key={c} label={BUCKET_LABEL[c]} on={c === b} onPress={() => setGrain(c)} />)}</View> : null}
        <Caption>{`${t.name}: ${f.name.toLowerCase()}, ${range.label.toLowerCase()}, by ${BUCKET_LABEL[b].toLowerCase()}`}</Caption>
        <Chart pts={pts} shape={shape === 'line' ? 'line' : 'bar'} w={inner} fmt={(n) => formatFieldValue(f, n, state.settings)} />
      </View>
    );
  }

  // ----- who gets the most days -----
  function ranking() {
    const range = rangeFor(period, today, ws, ix.first);
    const ranked = rankTrackers(ix, range, today);
    const max = Math.max(1, ...ranked.map((x) => x.days));
    const list = showAll ? ranked : ranked.slice(0, 6);
    return (
      <View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>{PERIOD_CHOICES.map((p) => <Chip key={p} label={PERIOD_LABEL[p]} on={p === period} onPress={() => setPeriod(p)} />)}</View>
        <Caption>{`Days logged, ${range.label.toLowerCase()}`}</Caption>
        {list.map(({ tracker, days }) => (
          <View key={tracker.id} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={{ color: colors.text, fontSize: 13 }}>{tracker.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{days}</Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.raised }}><View style={{ height: 8, borderRadius: 4, width: `${(days / max) * 100}%`, backgroundColor: colors.accent }} /></View>
          </View>
        ))}
        {ranked.length > 6 ? (
          <Tap onPress={() => setShowAll(!showAll)} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{showAll ? 'Show the top six' : `Show all ${ranked.length}`}</Text>
          </Tap>
        ) : null}
      </View>
    );
  }

  return (
    <Scroll contentContainerStyle={{ paddingTop: top, paddingHorizontal: 16, paddingBottom: 40, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{state.settings.name ? `${state.settings.name}, ${ix.first === undefined ? '' : daysSince(ix.first, today)}` : daysSince(ix.first, today)}</Text>
      <Text style={{ color: colors.accent, fontSize: 56, fontWeight: '700', lineHeight: 62, marginTop: 2 }}>{recent.share === undefined ? '–' : `${Math.round(recent.share * 100)}%`}</Text>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{`of your system done, ${recent.label.toLowerCase()}`}</Text>
      <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>{`Streak ${streak.current} ${streak.current === 1 ? 'day' : 'days'} · best ${streak.best}`}</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 }}>{VIEWS.map((v) => <Chip key={v.id} label={v.label} on={v.id === view} onPress={() => { setView(v.id); setShowAll(false); }} />)}</View>

      {view === 'ladder' ? ladder() : view === 'year' ? year() : view === 'trackers' ? perTracker() : view === 'lines' ? lines() : ranking()}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20 }}>
        <Text style={{ color: colors.muted, fontSize: 11, marginRight: 6 }}>Less</Text>
        {[0, 0.2, 0.5, 0.8, 1].map((v) => <View key={v} style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: stepColour(v), marginRight: 4 }} />)}
        <Text style={{ color: colors.muted, fontSize: 11 }}>more of your system done</Text>
      </View>
    </Scroll>
  );
}

const readingScore = (t: Tracker): number => (t.daily ? 2 : 0) + (t.fields.some((f) => f.type === 'number' && f.reading) ? 1 : 0);

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
