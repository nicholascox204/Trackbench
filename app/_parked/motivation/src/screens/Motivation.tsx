// Motivation: its own tab. One box: your score at the top, the trackers that count toward it with their streaks and
// goals, then any goals that span them. Trackers left out sit in a box of their own and can be turned back on.
// How it all works is set up in a flow of its own, behind "Edit". (The data allows several systems; the screen offers one.)

import { Text, View } from 'react-native';
import type { DayMark } from '../core/engine';
import { describeGoal } from '../core/goals';
import { describeQuest, questProgress } from '../core/quests';
import { setTrackerGame, useDerived } from '../core/store';
import { formatDay, startOfDay } from '../core/time';
import { GoalBar } from '../ui/GoalBar';
import { Button, Card, Icon, Muted, ScreenHeader, Scroll, SmallButton, Tap, TrackerIcon, colors, s } from '../ui/kit';
import { ranked } from './Goals';

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;
const markColor = (m: DayMark): string => (m === 'hit' ? colors.done : m === 'miss' ? colors.danger : m === 'rest' ? colors.raised : 'transparent');

// A line at the foot of a box that opens a page.
function Line({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{label}</Text>
      <Icon name="chevron-forward" size={18} color={colors.muted} />
    </Tap>
  );
}

export function Motivation({ page, setPage, openGoals, openQuest, openGame }: {
  page: string | undefined; setPage: (p: string | undefined) => void;
  openGoals: (trackerId: string) => void; openQuest: (id: string, game: string) => void; openGame: (id?: string) => void;
}) {
  const { state, days, games } = useDerived();
  const today = startOfDay(Date.now());
  const weekStart = state.settings.weekStart ?? 'mon';
  const main = games[0];

  // ----- the score history page -----
  if (page === 'history' && main) {
    const { inSystem, result } = main;
    const perfect = days.filter((d) => { const exp = inSystem.filter((t) => d.results[t.id]?.expected); return d.closed && exp.length > 0 && exp.every((t) => d.results[t.id].success); }).length;
    const ledger = [...result.ledger].reverse().slice(0, 40);
    return (
      <View style={s.screen}>
        <ScreenHeader label="Motivation" onBack={() => setPage(undefined)} />
        <Scroll contentContainerStyle={[s.content, { paddingTop: 12, paddingBottom: 40 }]}>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 12 }}>Score history</Text>
          <Card>
            <Muted style={{ marginBottom: 8 }}>{plural(perfect, 'perfect day')} so far. Why your score changed:</Muted>
            {ledger.length === 0 ? <Muted>Nothing yet. Hit a goal and it shows up here.</Muted> : null}
            {ledger.map((l, i) => (
              <View key={i} style={[s.row, { justifyContent: 'space-between', paddingVertical: 3 }]}>
                <Text style={{ color: colors.muted, width: 64, fontSize: 13 }}>{formatDay(l.day)}</Text>
                <Text style={{ color: colors.text, flex: 1, fontSize: 14 }}>{l.reason}</Text>
                <Text style={{ color: l.delta > 0 ? colors.done : colors.danger, fontWeight: '700', fontSize: 14 }}>{l.delta > 0 ? '+' : ''}{l.delta} {l.unit}</Text>
              </View>
            ))}
          </Card>
        </Scroll>
      </View>
    );
  }

  // ----- the tab itself -----
  const outside = state.trackers.filter((t) => !main || t.systemId !== main.system.id);

  return (
    <View style={s.screen}>
      <ScreenHeader label="Motivation" />
      <Scroll contentContainerStyle={[s.content, { paddingTop: 12, paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        {!main ? (
          <Card>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>Motivation is off</Text>
            <Muted style={{ marginBottom: 10 }}>Choose how you want to be motivated: points, levels, hearts, streaks and goals, and how often it nudges you. It is optional.</Muted>
            <Button label="Set up motivation" onPress={() => openGame()} />
          </Card>
        ) : null}

        {main ? (() => {
          const { system: g, inSystem, result } = main;
          const c = g.config;
          const stats = [c.points.on ? `${result.points} points` : '', c.levels.on && c.points.on ? `level ${result.level}` : '', c.hearts.on ? `${result.hearts}/${result.maxHearts} hearts` : ''].filter(Boolean).join(' · ');
          const across = g.quests ?? [];
          return (
            <Card style={{ paddingBottom: 4 }}>
              <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Your progress</Text>
                  <Text style={{ color: colors.muted, fontSize: 14, marginTop: 2 }}>{stats || 'Streaks and goals only'}</Text>
                </View>
                <SmallButton label="Edit" icon="options-outline" onPress={() => openGame(g.id)} />
              </View>

              {inSystem.length === 0 ? <Muted style={{ marginBottom: 10 }}>No trackers count toward it yet. Turn one on from below.</Muted> : null}
              {inSystem.map((t) => {
                const st = result.perTracker[t.id];
                const headline = c.consistency === 'score' ? `${st.score}%` : c.consistency === 'none' ? `${st.hits}` : `${st.streak}`;
                const mine = ranked(t, state.entries.filter((e) => e.trackerId === t.id), today, state.settings).filter((x) => x.g.how === 'day' || x.p.status === 'active' || x.p.status === 'over' || x.p.status === 'met');
                return (
                  <View key={t.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10 }}>
                    <Tap onPress={() => openGoals(t.id)}>
                      <View style={s.row}>
                        <TrackerIcon name={t.icon} size={30} />
                        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginLeft: 10, flex: 1 }}>{t.name}</Text>
                        {c.consistency === 'strict' || c.consistency === 'grace' ? <Icon name="flame" size={18} color={colors.warn} /> : null}
                        <Text style={{ color: colors.warn, fontSize: 18, fontWeight: '800', marginLeft: 2, marginRight: 4 }}>{headline}</Text>
                      </View>
                      <View style={[s.row, { marginTop: 8 }]}>
                        {st.history.slice(-14).map((m, i) => (
                          <View key={i} style={{ width: 12, height: 12, borderRadius: 3, marginRight: 3, backgroundColor: markColor(m), borderWidth: m === 'pending' ? 1 : 0, borderColor: colors.muted }} />
                        ))}
                      </View>
                      {mine.map(({ g: goal, p }) => (
                        <View key={goal.id} style={{ marginTop: 10 }}><GoalBar title={describeGoal(t, goal, state.settings)} p={p} compact /></View>
                      ))}
                    </Tap>
                    <View style={[s.row, { justifyContent: 'space-between', marginTop: 8 }]}>
                      <Tap onPress={() => openGoals(t.id)}><Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{mine.length ? 'Edit goals' : 'Add a goal'}</Text></Tap>
                      <Tap onPress={() => setTrackerGame(t.id, null)}><Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>Turn off for this</Text></Tap>
                    </View>
                  </View>
                );
              })}

              {across.length > 0 ? (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, paddingBottom: 6 }}>
                  <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 8 }}>Across trackers</Text>
                  {across.map((q) => (
                    <Tap key={q.id} onPress={() => openQuest(q.id, g.id)} style={{ marginBottom: 10 }}>
                      <GoalBar title={describeQuest(q, inSystem)} p={questProgress(q, inSystem, state.entries, today, weekStart)} compact />
                    </Tap>
                  ))}
                </View>
              ) : null}
              <Line label="Score history" onPress={() => setPage('history')} />
            </Card>
          );
        })() : null}

        {main && outside.length > 0 ? (
          <Card>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 2 }}>Left out</Text>
            <Muted style={{ marginBottom: 6 }}>These are only logs: no points, streaks, goals or alerts.</Muted>
            {outside.map((t) => (
              <View key={t.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10 }}>
                <View style={s.row}>
                  <TrackerIcon name={t.icon} size={30} />
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginLeft: 10, flex: 1 }}>{t.name}</Text>
                  <SmallButton label="Turn on" onPress={() => setTrackerGame(t.id, main.system.id)} />
                </View>
              </View>
            ))}
          </Card>
        ) : null}
      </Scroll>
    </View>
  );
}
