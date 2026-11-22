// Setting up motivation, shaped like adding a tracker: pick a style on its own screen, land on a summary of every
// part with what it is set to, and tap a line to change that part on its own screen. Editing reopens the summary
// (the style screen is only offered again under Manage, since choosing one replaces your settings).

import { useEffect, useState } from 'react';
import { BackHandler, Text, View } from 'react-native';
import { SCROLL } from '../constants';
import { MOTIVATION_PRESETS, defaultAlerts, gameRows } from '../core/motivation';
import { describeQuest } from '../core/quests';
import { addGame, createSystemWithConfig, removeGame, updateConfig, useAppState } from '../core/store';
import type { Consistency, SystemConfig } from '../core/types';
import { Button, Card, Icon, Muted, Option, ScreenHeader, Scroll, Stepper, Tap, Toggle, TrackerIcon, colors, s } from '../ui/kit';
import { AlertsPanel } from './AlertsPanel';
import { Goals } from './Goals';
import { PayEditor } from './PayEditor';
import { QuestBuilder } from './Quests';

type Step = 'start' | 'summary' | 'points' | 'levels' | 'hearts' | 'streaks' | 'alerts' | 'goals' | 'milestones' | 'rewards';

const QUESTIONS: Record<Step, string> = {
  start: 'How do you want to be motivated?', summary: 'Your motivation', points: 'How should points work?', levels: 'How fast should levels come?',
  hearts: 'When do you lose a heart?', streaks: 'What counts as a streak?', alerts: 'What should it nudge you about?',
  goals: 'What counts as a good day or week?', milestones: 'What are you working towards?', rewards: 'What is a goal worth?',
};
const STREAKS: { key: Consistency; title: string; sub: string; icon: string }[] = [
  { key: 'grace', title: 'Forgiving', sub: 'One missed day is allowed; two in a row break it.', icon: 'flame-outline' },
  { key: 'strict', title: 'Strict', sub: 'Any miss starts it over.', icon: 'flash-outline' },
  { key: 'score', title: 'Habit score', sub: 'Rises with hits and fades with misses, never resets.', icon: 'pulse-outline' },
  { key: 'none', title: 'No streaks', sub: 'Just count what you hit.', icon: 'remove-circle-outline' },
];
const LOSE: { key: 'any' | 'half' | 'all'; title: string; sub: string }[] = [
  { key: 'any', title: 'Any tracker missed', sub: 'One slip on a day costs a heart.' },
  { key: 'half', title: 'Half missed', sub: 'Half or more of the trackers due that day.' },
  { key: 'all', title: 'All missed', sub: 'Only a day where nothing got done.' },
];

const WEEKS: { pct: number; title: string; sub: string }[] = [
  { pct: 60, title: 'Most days', sub: 'About 4 of 7 days hit.' },
  { pct: 80, title: 'Nearly every day', sub: 'About 6 of 7 days hit.' },
  { pct: 100, title: 'Every day', sub: 'Not one miss.' },
];

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

function Line({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress}>
      <Card style={{ padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
          <Text style={{ color: colors.text, fontSize: 15 }}>{value}</Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.muted} />
      </Card>
    </Tap>
  );
}

function Amount({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
      <Text style={{ color: colors.text, fontSize: 15, flex: 1, marginRight: 10 }}>{label}</Text>
      {children}
    </View>
  );
}

export function GameFlow({ id, done, cancel }: { id?: string; done: () => void; cancel: () => void }) {
  const { state } = useAppState();
  const existing = state.systems.find((g) => g.id === id);
  const [config, setConfig] = useState<SystemConfig>(() => existing?.config ?? MOTIVATION_PRESETS.find((p) => p.id === 'standard')!.make());
  const [step, setStep] = useState<Step>(existing ? 'summary' : 'start');
  const [started, setStarted] = useState(!!existing); // a style has been chosen
  const [touched, setTouched] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [goalsFor, setGoalsFor] = useState<string | null>(null); // a tracker's goals, opened from the Goals step
  const [questFor, setQuestFor] = useState<string | null>(null); // a goal across trackers ('new' or its id)

  const set = (fn: (c: SystemConfig) => SystemConfig) => { setTouched(true); setConfig(fn); };
  const leave = () => (touched || (!existing && started) ? setConfirmLeave(true) : cancel());
  const back = () => {
    if (step === 'start') { if (started) setStep('summary'); else leave(); }
    else if (step === 'summary') leave();
    else setStep('summary');
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (goalsFor || questFor) return false; // those screens handle their own back
      if (confirmLeave) setConfirmLeave(false); else back();
      return true;
    });
    return () => sub.remove();
  });

  function finish() {
    if (existing) updateConfig(existing.id, () => config);
    else if (state.systems.length === 0) createSystemWithConfig(config);
    else addGame('Motivation', config);
    done();
  }

  const pick = (make: () => SystemConfig) => {
    setTouched(true);
    setConfig((c) => ({ ...make(), rules: c.rules, defaultPay: c.defaultPay }));
    setStarted(true);
    setStep('summary');
  };

  const inIt = existing ? state.trackers.filter((t) => t.systemId === existing.id) : state.trackers;

  // Goals are made on the tracker (its daily target and milestones) or across trackers, from here; they save as you make them.
  if (goalsFor) return <Goals id={goalsFor} back={() => setGoalsFor(null)} />;
  if (questFor && existing) return <QuestBuilder id={questFor} game={existing.id} back={() => setQuestFor(null)} />;

  if (confirmLeave) {
    return (
      <View style={s.screen}>
        <ScreenHeader label="Leave setup" />
        <View style={[s.content, { paddingTop: 20 }]}>
          <Card>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 6 }}>{existing ? 'Discard your changes?' : 'Discard this setup?'}</Text>
            <Muted style={{ marginBottom: 14 }}>{existing ? 'The changes you made here will be lost.' : 'What you have set up so far will be lost.'}</Muted>
            <Button label="Keep editing" onPress={() => setConfirmLeave(false)} style={{ marginBottom: 10 }} />
            <Button label="Discard" variant="danger" onPress={cancel} />
          </Card>
        </View>
      </View>
    );
  }

  const isStart = step === 'start';
  const isSummary = step === 'summary';
  const alerts = config.alerts ?? defaultAlerts();
  const mileCount = inIt.reduce((n, t) => n + (t.goals ?? []).length, 0);
  const across = existing?.quests ?? [];
    const milestonesValue = mileCount + across.length === 0 ? 'None yet' : [mileCount ? plural(mileCount, 'milestone') : '', across.length ? `${across.length} across trackers` : ''].filter(Boolean).join(', ');
  const rows = gameRows(config).flatMap((r) => (r.key === 'goals' ? [r, { key: 'milestones' as const, label: 'Milestones', value: milestonesValue }] : [r]));

  return (
    <View style={s.screen}>
      <ScreenHeader label={existing ? 'Motivation' : 'Cancel'} onBack={isStart && started ? () => setStep('summary') : !isStart && !isSummary ? () => setStep('summary') : leave} />
      <Scroll contentContainerStyle={[s.content, { paddingTop: 12, paddingBottom: isStart ? SCROLL.basePadding : SCROLL.footerPadding }]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: 4 }}>{QUESTIONS[step]}</Text>

        {/* 1 start: a style to begin from */}
        {isStart ? (
          <View style={{ marginTop: 6 }}>
            <Muted style={{ marginBottom: 12 }}>Pick a style, from a light touch to a strong push. Every part can be changed afterwards, including the alerts.{started ? ' This replaces your current settings.' : ''}</Muted>
            {MOTIVATION_PRESETS.map((p) => (
              <Tap key={p.id} onPress={() => pick(p.make)}>
                <View style={[s.row, { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: `${colors.border}88` }]}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, marginRight: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBg }}>
                    <Icon name={p.icon} size={22} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
                    <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={2}>{p.blurb}</Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color={colors.muted} />
                </View>
              </Tap>
            ))}
          </View>
        ) : null}

        {/* 2 summary: every part, what it is set to */}
        {isSummary ? (
          <View style={{ marginTop: 10 }}>
            {rows.map((r) => <Line key={r.key} label={r.label} value={r.value} onPress={() => setStep(r.key)} />)}
            {existing ? (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Manage</Text>
                <Button label="Start over with another style" variant="ghost" onPress={() => setStep('start')} style={{ marginBottom: 8 }} />
                <Button
                  label={confirmDelete ? 'Tap again to turn it off. Your trackers and entries stay.' : 'Turn off motivation'} variant="danger"
                  onPress={() => { if (confirmDelete) { removeGame(existing.id); done(); } else setConfirmDelete(true); }}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {step === 'points' ? (
          <View style={{ marginTop: 10 }}>
            <Muted style={{ marginBottom: 8 }}>Points are paid when a tracker has a good day (or a good week, or reaches a milestone), and can be taken back when it misses. You choose what counts in the Goals and Milestones steps.</Muted>
            <Toggle label="Points" sub="A running score" value={config.points.on} onChange={(on) => set((c) => ({ ...c, points: { ...c.points, on } }))} />
            {config.points.on ? (
              <View style={{ marginTop: 6 }}>
                <Amount label="Gained for each goal met"><Stepper value={config.points.reward} onChange={(v) => set((c) => ({ ...c, points: { ...c.points, reward: v } }))} min={1} step={1} width={88} /></Amount>
                <Amount label="Lost for each miss"><Stepper value={config.points.penalty} onChange={(v) => set((c) => ({ ...c, points: { ...c.points, penalty: v } }))} min={0} step={1} width={88} /></Amount>
                <Toggle label="Bonus for a clear day" sub="Extra points when every tracker due is hit" value={config.allClear.on} onChange={(on) => set((c) => ({ ...c, allClear: { ...c.allClear, on } }))} />
                {config.allClear.on ? <Amount label="Bonus size"><Stepper value={config.allClear.bonus} onChange={(v) => set((c) => ({ ...c, allClear: { ...c.allClear, bonus: v } }))} min={1} step={1} width={88} /></Amount> : null}
              </View>
            ) : <Muted>Levels need points, so they turn off too.</Muted>}
          </View>
        ) : null}

        {step === 'levels' ? (
          <View style={{ marginTop: 10 }}>
            <Toggle label="Levels" sub="Slow progress that never goes down" value={config.levels.on} onChange={(on) => set((c) => ({ ...c, levels: { ...c.levels, on } }))} disabled={!config.points.on} />
            {!config.points.on ? <Muted>Levels come from points. Turn points on first.</Muted> : null}
            {config.levels.on && config.points.on ? (
              <View style={{ marginTop: 6 }}>
                <Amount label="Points for the first step"><Stepper value={config.levels.perLevel ?? 25} onChange={(v) => set((c) => ({ ...c, levels: { ...c.levels, perLevel: v } }))} min={5} step={5} width={88} /></Amount>
                <Muted>Each level takes more than the one before it. A bigger number is slower.</Muted>
              </View>
            ) : null}
          </View>
        ) : null}

        {step === 'hearts' ? (
          <View style={{ marginTop: 10 }}>
            <Toggle label="Hearts" sub="A limited buffer you can lose" value={config.hearts.on} onChange={(on) => set((c) => ({ ...c, hearts: { ...c.hearts, on } }))} />
            {config.hearts.on ? (
              <View style={{ marginTop: 6 }}>
                <Amount label="How many hearts"><Stepper value={config.hearts.max} onChange={(v) => set((c) => ({ ...c, hearts: { ...c.hearts, max: v } }))} min={1} max={10} step={1} width={88} /></Amount>
                {LOSE.map((o) => <Option key={o.key} title={o.title} sub={o.sub} selected={(config.hearts.loseOn ?? 'any') === o.key} onPress={() => set((c) => ({ ...c, hearts: { ...c.hearts, loseOn: o.key } }))} />)}
                <Toggle label="Win hearts back" sub="A day with nothing missed gives one back" value={config.hearts.regain !== false} onChange={(v) => set((c) => ({ ...c, hearts: { ...c.hearts, regain: v } }))} />
              </View>
            ) : null}
          </View>
        ) : null}

        {step === 'streaks' ? (
          <View style={{ marginTop: 10 }}>
            {STREAKS.map((o) => <Option key={o.key} icon={o.icon} title={o.title} sub={o.sub} selected={config.consistency === o.key} onPress={() => set((c) => ({ ...c, consistency: o.key }))} />)}
          </View>
        ) : null}

        {step === 'alerts' ? (
          <View style={{ marginTop: 10 }}>
            <AlertsPanel alerts={alerts} config={config} trackers={inIt} onChange={(a) => set((c) => ({ ...c, alerts: a }))} />
          </View>
        ) : null}

        {step === 'goals' ? (
          <View style={{ marginTop: 10 }}>
            <Muted style={{ marginBottom: 12 }}>These apply to every tracker in your motivation. A good day is a tracker meeting its own daily rule, which you set on the tracker itself. Points, hearts and streaks all build on good days.</Muted>
            <Toggle label="Good weeks" sub="Counts a whole week too, not just each day" value={config.week?.on === true} onChange={(on) => set((c) => ({ ...c, week: { on, minPct: c.week?.minPct ?? 80 } }))} />
            {config.week?.on ? (
              <View style={{ marginTop: 6 }}>
                <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>A week is good when a tracker hit</Text>
                {WEEKS.map((o) => <Option key={o.pct} title={o.title} sub={o.sub} selected={(config.week?.minPct ?? 80) === o.pct} onPress={() => set((c) => ({ ...c, week: { on: true, minPct: o.pct } }))} />)}
                <Muted>Only the days a tracker was due count. A week is judged once it ends.</Muted>
              </View>
            ) : <Muted>Today's score still comes from each day.</Muted>}
          </View>
        ) : null}

        {step === 'milestones' ? (
          <View style={{ marginTop: 10 }}>
            <Muted style={{ marginBottom: 12 }}>Something to reach on a tracker, like 2 plates on bench or 100 workouts. Each one pays out when you get there. They save as you make them.</Muted>
            {existing ? (
              <View style={{ marginBottom: 6 }}>
                <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Across trackers</Text>
                {across.map((q) => <Line key={q.id} label="Goal" value={describeQuest(q, inIt)} onPress={() => setQuestFor(q.id)} />)}
                <Button label="Add a goal across trackers" variant="ghost" onPress={() => setQuestFor('new')} style={{ marginBottom: 12 }} />
              </View>
            ) : <Muted style={{ marginBottom: 12 }}>Goals across trackers can be added once motivation is set up.</Muted>}
            <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>On a tracker</Text>
            {inIt.length === 0 ? <Muted>No trackers yet.</Muted> : null}
            {inIt.map((t) => {
              const m = (t.goals ?? []).length;
              return (
                <Tap key={t.id} onPress={() => setGoalsFor(t.id)}>
                  <Card style={{ padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                    <TrackerIcon name={t.icon} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{t.name}</Text>
                      <Text style={{ color: colors.muted, fontSize: 13 }}>{m === 0 ? 'Nothing set' : plural(m, 'milestone')}</Text>
                    </View>
                    <Icon name="chevron-forward" size={18} color={colors.muted} />
                  </Card>
                </Tap>
              );
            })}
          </View>
        ) : null}

        {step === 'rewards' ? (
          <View style={{ marginTop: 10 }}>
            <Muted style={{ marginBottom: 12 }}>Every goal can set its own reward. This covers the goals that do not.</Muted>
            <PayEditor isDefault pay={config.defaultPay} config={config} onChange={(p) => set((c) => ({ ...c, defaultPay: p }))} />
          </View>
        ) : null}
      </Scroll>

      {!isStart ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, padding: 12, paddingBottom: 22 }}>
          <View style={s.row}>
            <Button label="Back" variant="ghost" onPress={back} style={{ marginRight: 10 }} />
            <Button label={isSummary ? (existing ? 'Save changes' : 'Start') : 'Done'} onPress={isSummary ? finish : () => setStep('summary')} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
