// The Target screen, opened from the summary: what makes a good day for this tracker. One plain choice (any entry counts, finish the
// plan, or a number: at least, at most, between), because every tracker's own number already says what progress means, so the Overview
// never has to understand the shape. Progress against it is read as a share of the target, 0 to 100%.
import { Text, View } from 'react-native';
import { targetText, type Answers } from '../core/setup';
import { measureUnit } from '../core/units';
import type { Settings, Tracker, TrackerDraft } from '../core/types';
import { Dropdown } from '../ui/Dropdown';
import { Chip, Stepper, colors } from '../ui/kit';

type Mode = 'logged' | 'plan' | 'min' | 'max' | 'range';

export function TargetStep({ a, set, draft, settings }: { a: Answers; set: (p: Partial<Answers>) => void; draft: TrackerDraft; settings: Settings }) {
  const shell = draft as unknown as Tracker;
  const measures = draft.measures.filter((m) => m.id !== 'done');
  const planned = draft.input === 'plan';
  const canNumber = measures.length > 0 && draft.input !== 'check';
  const g = a.goal === 'number' ? a.goals[0] : undefined;
  const mode: Mode = g ? g.cmp : a.finishPlan && planned ? 'plan' : 'logged';
  const defaultMeasure = a.record === 'count' ? (measures.some((m) => m.id === 'n') ? 'n' : 'count') : measures[0]?.id ?? 'count';
  const measure = measures.find((m) => m.id === (g?.measure ?? defaultMeasure)) ?? measures[0];
  const fieldStep = (id: string): number => (id === 'count' || id === 'n' ? Math.max(1, a.countStep) : draft.fields.find((f) => f.id === id)?.step ?? 1);
  const step = measure ? fieldStep(measure.id) : 1;
  const unit = measure ? measureUnit(shell, measure, settings) : undefined;
  const perDay = measure?.calc.op === 'latest' ? '' : ' a day';
  const start = (g?.value ?? step * 4) || 1;

  const pick = (m: Mode) => {
    if (m === 'logged') return set({ goal: 'none', goals: [], finishPlan: false });
    if (m === 'plan') return set({ goal: 'none', goals: [], finishPlan: true });
    if (!measure) return;
    set({ goal: 'number', finishPlan: false, goals: [{ id: 'g0', measure: measure.id, cmp: m, value: start, value2: m === 'range' ? start + step * 2 : start }] });
  };
  const change = (patch: Partial<NonNullable<typeof g>>) => g && set({ goals: [{ ...g, ...patch }, ...a.goals.slice(1)] });

  if (a.avoid && a.record === 'done') {
    return <Text style={{ color: colors.muted, fontSize: 14, marginTop: 8 }}>This one is something you are avoiding, so a good day is a day with nothing logged.</Text>;
  }
  return (
    <View style={{ marginTop: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 14, marginBottom: 12 }}>What makes a good day. Your progress is shown as a share of this, from 0 to 100%.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Chip label={draft.input === 'check' ? 'Tapping it' : 'Any entry'} active={mode === 'logged'} onPress={() => pick('logged')} />
        {planned ? <Chip label="Finish most of the plan" active={mode === 'plan'} onPress={() => pick('plan')} /> : null}
        {canNumber ? <Chip label="At least" active={mode === 'min'} onPress={() => pick('min')} /> : null}
        {canNumber ? <Chip label="At most" active={mode === 'max'} onPress={() => pick('max')} /> : null}
        {canNumber ? <Chip label="Between" active={mode === 'range'} onPress={() => pick('range')} /> : null}
      </View>

      {g && measures.length > 1 ? (
        <View style={{ marginTop: 6 }}>
          <Dropdown compact label="Measured by" value={measure?.name ?? ''} selected={g.measure} options={measures.map((m) => ({ key: m.id, label: m.name }))} onSelect={(k) => change({ measure: k })} />
        </View>
      ) : null}

      {g && measure ? (
        <View style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Stepper value={g.value} min={0} max={99999} step={step} onChange={(v) => change({ value: v, ...(g.cmp === 'range' ? { value2: Math.max(g.value2, v) } : { value2: v }) })} />
            {g.cmp === 'range' ? <Text style={{ color: colors.muted, fontSize: 14, marginHorizontal: 8 }}>to</Text> : null}
            {g.cmp === 'range' ? <Stepper value={g.value2} min={0} max={99999} step={step} onChange={(v) => change({ value2: Math.max(v, g.value) })} /> : null}
            <Text style={{ color: colors.muted, fontSize: 14, marginLeft: 10, flexShrink: 1 }}>{`${a.record === 'count' && a.countUnit.trim() && !unit ? a.countUnit.trim() : unit ?? ''}${perDay}`.trim()}</Text>
          </View>
        </View>
      ) : null}

      {mode === 'plan' ? <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>Counts when most of the day's plan is done.</Text> : null}
      <Text style={{ color: colors.text, fontSize: 14, marginTop: 16 }}>{`Reads: ${targetText(a, draft, settings)}`}</Text>
    </View>
  );
}
