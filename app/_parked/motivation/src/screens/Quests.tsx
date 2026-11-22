// Quests: goals that belong to the system and span the trackers you choose (or all of them). They have their own spot
// in Progress, apart from each tracker's own goals. The builder is a few compact rows under a pinned sentence.

import { useEffect, useState } from 'react';
import { BackHandler, Text, View } from 'react-native';
import { dayKey, periodOf } from '../core/goals';
import { METRIC_HINT, METRIC_LABEL, describeQuest, questProgress, questTrackers } from '../core/quests';
import { removeQuest, saveQuest, useAppState } from '../core/store';
import { PayEditor } from './PayEditor';
import { addDays, startOfDay } from '../core/time';
import type { Quest, QuestMetric } from '../core/types';
import { Dropdown } from '../ui/Dropdown';
import { GoalBar } from '../ui/GoalBar';
import { BackButton, Button, Card, Chip, Muted, Scroll, Stepper, Tap, colors, s, topPad } from '../ui/kit';

const newId = (): string => `q${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
type How = Quest['how'];
const HOW_LABEL: Record<How, string> = { day: 'Each day', week: 'Each week', month: 'Each month', total: 'In total' };
const HOW_HINT: Record<How, string> = {
  day: 'Reach it today. It starts again tomorrow.', week: 'Reach it within each calendar week.', month: 'Reach it within each calendar month.',
  total: 'Add it up from the day you begin, optionally by a date.',
};

export function QuestBuilder({ id, game, back }: { id: string; game?: string; back: () => void }) {
  const { state } = useAppState();
  const system = state.systems.find((x) => (x.quests ?? []).some((q) => q.id === id)) ?? state.systems.find((x) => x.id === game) ?? state.systems[0];
  const inSystem = system ? state.trackers.filter((t) => t.systemId === system.id) : [];
  const existing = (system?.quests ?? []).find((q) => q.id === id);
  const [pay, setPay] = useState(existing?.pay);
  const today = startOfDay(Date.now());

  const [chosen, setChosen] = useState<string[]>(existing && existing.trackers !== 'all' ? existing.trackers : []); // none chosen means all
  const [metric, setMetric] = useState<QuestMetric>(existing?.metric ?? 'trackersDone');
  const [how, setHow] = useState<How>(existing?.how ?? 'day');
  const [value, setValue] = useState(existing?.value ?? Math.max(1, Math.min(3, inSystem.length)));
  const [until, setUntil] = useState<string | undefined>(existing?.until);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => sub.remove();
  });

  const effHow: How = metric === 'perfectDays' && how === 'day' ? 'week' : how; // a perfect day is one day, so it is counted over a period
  const quest: Quest = {
    id: existing?.id ?? newId(), trackers: chosen.length === 0 ? 'all' : chosen, metric, how: effHow, value: Math.max(1, Math.round(value)),
    from: existing?.from ?? dayKey(today), ...(effHow === 'total' && until ? { until } : {}), ...(pay ? { pay } : {}),
  };
  const toggle = (tid: string) => setChosen((c) => (c.includes(tid) ? c.filter((x) => x !== tid) : [...c, tid]));
  const untilOptions: { key: string; label: string }[] = [
    { key: '', label: 'No date' },
    { key: dayKey(periodOf('month', today, 'mon').end), label: 'End of month' },
    { key: dayKey(addDays(today, 28)), label: '4 weeks' },
    { key: dayKey(addDays(today, 56)), label: '8 weeks' },
    { key: dayKey(addDays(today, 84)), label: '12 weeks' },
  ];
  const hows = (['day', 'week', 'month', 'total'] as How[]).filter((h) => !(metric === 'perfectDays' && h === 'day'));

  return (
    <View style={s.screen}>
      <View style={{ paddingHorizontal: 16, paddingTop: topPad, paddingBottom: 10, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        <BackButton label="Motivation" onPress={back} />
        <View style={{ backgroundColor: colors.accentBg, borderColor: colors.accent, borderWidth: 2, borderRadius: 12, padding: 12, marginTop: 4 }}>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 2 }}>Your goal</Text>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{describeQuest(quest, inSystem)}</Text>
        </View>
      </View>
      <Scroll contentContainerStyle={[s.content, { paddingTop: 12, paddingBottom: 60 }]} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Trackers</Text>
          <View style={s.wrap}>
            <Chip label="All" active={chosen.length === 0} onPress={() => setChosen([])} />
            {inSystem.map((t) => <Chip key={t.id} label={t.name} active={chosen.includes(t.id)} onPress={() => toggle(t.id)} />)}
          </View>
          <Dropdown
            compact label="Count" value={METRIC_LABEL[metric]} selected={metric}
            options={(Object.keys(METRIC_LABEL) as QuestMetric[]).map((m) => ({ key: m, label: METRIC_LABEL[m], sub: METRIC_HINT[m] }))}
            onSelect={(k) => setMetric(k as QuestMetric)}
          />
          <Dropdown
            compact label="Over" value={HOW_LABEL[effHow]} selected={effHow}
            options={hows.map((h) => ({ key: h, label: HOW_LABEL[h], sub: HOW_HINT[h] }))} onSelect={(k) => setHow(k as How)}
          />
          <View style={[s.row, { justifyContent: 'space-between', marginTop: 4 }]}>
            <Text style={{ color: colors.text, fontSize: 15 }}>At least</Text>
            <Stepper value={value} onChange={setValue} min={1} step={1} width={64} />
          </View>
          {effHow === 'total' ? (
            <View style={{ marginTop: 12 }}>
              <Dropdown
                compact label="By when" value={until ? (untilOptions.find((o) => o.key === until)?.label ?? `On ${until}`) : 'No date'} selected={until ?? ''}
                options={untilOptions} onSelect={(k) => setUntil(k || undefined)}
              />
            </View>
          ) : null}
          {system ? <View style={{ marginTop: 12 }}><PayEditor pay={pay} config={system.config} onChange={setPay} /></View> : null}
          <View style={[s.row, { marginTop: 16 }]}>
            <Button label="Cancel" variant="ghost" onPress={back} style={{ marginRight: 10 }} />
            <Button label={existing ? 'Save goal' : 'Add goal'} onPress={() => { saveQuest(quest, system?.id); back(); }} style={{ flex: 1 }} />
          </View>
          {existing ? <Button label="Remove this goal" variant="danger" onPress={() => { removeQuest(existing.id); back(); }} style={{ marginTop: 10 }} /> : null}
        </Card>
        {questTrackers(quest, inSystem).length === 0 ? <Muted style={{ marginTop: 8 }}>Pick at least one tracker, or leave it on All.</Muted> : null}
      </Scroll>
    </View>
  );
}
