// Adding or editing a tracker is its own short onboarding: one plain question
// per screen, a default already chosen, and a small live preview of the tracker
// that updates as you answer. Editing reopens the same flow.

import * as Clipboard from 'expo-clipboard';
import { canTimerFill } from '../core/duration';
import { stepsFieldIn } from '../core/autoFields';
import { counterAvailable } from '../core/stepCounter';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { BackHandler, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { PRESETS, getPreset } from '../core/presets';
import {
  Answers, CHIPS, START_IDS, changeUnits, chipsFor, StepKey, answersFromPreset, answersFromTracker, chipLabel, draftFromAnswers,
  hasSample, nameProblem, previewText, stepsFor, summaryLines,
} from '../core/setup';
import { SCROLL } from '../constants';
import { LIMITS } from '../constants/layout';
import { isChanged } from '../core/dirty';
import { removeTracker, saveSetup, useAppState } from '../core/store';
import { getState } from '../core/store';
import { exportReadable, exportStructure } from '../core/transfer';
import { measureUnit } from '../core/units';
import type { Field, FieldType, Tracker } from '../core/types';
import { ScheduleSection } from './ScheduleSection';
import { TargetStep } from './TargetStep';
import { Totals } from './RecordStep';
import { RecordStep } from './RecordStep';
import { BackButton, ScreenHeader } from '../ui/kit';
import { Dropdown } from '../ui/Dropdown';
import { NameCard } from './NameCard';
import { StartPicker } from './StartPicker';
import type { Template } from '../core/templates';
import { Button, Card, Chip, Icon, Muted, Option, Stepper, Toggle, colors, s, topPad, Tap, Scroll, useTopPad } from '../ui/kit';
import { SmallButton } from '../ui/kit';
import { px } from '../ui/theme';
import { canRecordRun } from '../core/runImport';
import { bringOptions } from '../core/setup';
import { RunFileImport } from './RunFileImport';
import { LiftFileImport } from './LiftFileImport';
import { HealthImportCard } from './HealthImportCard';
import { bringIn } from '../core/healthRead';
import { liftFields } from '../core/records';
import { spanPair } from '../core/spanClock';

const QUESTIONS: Record<StepKey, string> = {
  start: 'What do you want to track?',
  record: 'What do you enter?',
  target: 'Target',
  shows: 'What it shows',
  tools: 'Tools',
  bring: 'Bring in',
  options: 'Options',
  summary: 'Here is your tracker',
};

export function SetupFlow({
  trackerId, done, cancel, toWelcome,
}: { trackerId?: string; done: (id: string) => void; cancel: () => void; toWelcome?: () => void }) {
  const { state } = useAppState();
  const top = useTopPad();
  const settings = state.settings;
  const existing: Tracker | undefined = trackerId ? state.trackers.find((t) => t.id === trackerId) : undefined;
  const hasSystem = state.systems.length > 0;
  const editing = !!existing;

  const [a, setA] = useState<Answers>(() =>
    existing ? answersFromTracker(existing, settings, hasSystem) : { ...answersFromPreset('blank'), system: hasSystem },
  );
  const [idx, setIdx] = useState(0);
  const [detour, setDetour] = useState<StepKey | null>(null); // a screen opened from the summary; Done returns there
  const [customName, setCustomName] = useState('');
  const [nameNudge, setNameNudge] = useState(false); // you pressed on without a name
  const [recordNudge, setRecordNudge] = useState(false); // you pressed on with nothing to enter
  const nameRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [newType, setNewType] = useState<FieldType>('number');
  const [newMax, setNewMax] = useState(5);
  const [newOptions, setNewOptions] = useState('');
  const [newReading, setNewReading] = useState(false);
  const [comboA, setComboA] = useState('');
  const [comboB, setComboB] = useState('');
  const [comboName, setComboName] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const base = useRef<Answers>(a); // how this setup was when it opened, or when its starting point was picked; leaving only asks when it now differs
  const [confirmLeave, setConfirmLeave] = useState(false);

  const steps = stepsFor(a, editing);
  const step: StepKey = detour ?? steps[Math.min(idx, steps.length - 1)];
  const scratch = step === 'record' && !editing && !detour && !a.templateId; // building your own: the name is asked on this screen
  const draft = useMemo(() => draftFromAnswers(a, settings, existing), [a, settings, existing]);

  const set = (patch: Partial<Answers>) => setA((p) => ({ ...p, ...patch }));
  // The same choice sits under the countdown and under the timer: which Duration field gets its time (if any).
  const intoPicker = (key: 'timerInto' | 'countdownInto') => {
    if (draft.input !== 'form' || !draft.fields.some(canTimerFill)) return null;
    const cur = a.extras[key];
    return (
      <View style={{ paddingHorizontal: 12, paddingTop: 4 }}>
        <Dropdown
          label="Fills"
          value={draft.fields.find((f) => f.id === cur)?.name ?? 'Nowhere'}
          selected={cur && draft.fields.some((f) => f.id === cur) ? cur : 'none'}
          options={[{ key: 'none', label: 'Nowhere' }, ...draft.fields.filter(canTimerFill).map((f) => ({ key: f.id, label: f.name }))]}
          onSelect={(k) => set({ extras: { ...a.extras, [key]: k === 'none' ? undefined : k } })}
        />
      </View>
    );
  };
  const dirty = isChanged(base.current, a);
  const leave = () => (dirty ? setConfirmLeave(true) : cancel());
  const go = (k: StepKey) => setDetour(k);
  const next = () => (detour ? setDetour(null) : setIdx((i) => Math.min(i + 1, steps.length - 1)));
  const back = () => (detour ? setDetour(null) : idx === 0 ? leave() : setIdx((i) => i - 1));

  // The system back button or gesture steps back the way the on-screen buttons do.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (confirmLeave) setConfirmLeave(false);
      else if (detour) setDetour(null);
      else if (idx > 0) setIdx((i) => i - 1);
      else if (existing || state.trackers.length > 0) leave();
      else toWelcome?.(); // the very first tracker: back goes to the name and look
      return true;
    });
    return () => sub.remove();
  });

  function finish() {
    const id = saveSetup(draft, a.system, existing?.id);
    // A new tracker set to bring readings in from Health Connect starts with the last 30 days.
    if (!existing && draft.tools.health) { const t = getState().trackers.find((x) => x.id === id); if (t) void bringIn(t, 30); }
    done(id);
  }

  function pickStart(id: string) {
    const start = { ...answersFromPreset(id), name: '', system: hasSystem };
    base.current = start;
    setA(start);
    setIdx(1);
  }

  function begin(ans: Answers) {
    const start = { ...ans, system: hasSystem };
    base.current = start;
    setA(start);
    setNameNudge(false);
    setRecordNudge(false);
    setIdx(1);
  }
  const pickTemplate = (tp: Template) => begin(tp.make());

  async function copy(text: string, label: string) {
    try {
      await Clipboard.setStringAsync(text);
      setMsg(`${label} copied (${text.length.toLocaleString()} characters).`);
    } catch {
      setMsg('Could not reach the clipboard.');
    }
  }

  function addField() {
    const name = customName.trim();
    if (!name) return;
    const id = `c${Date.now().toString(36)}`;
    let fld: Field;
    if (newType === 'rating') fld = { id, name, type: 'rating', max: newMax };
    else if (newType === 'choice') fld = { id, name, type: 'choice', options: newOptions.split(',').map((x) => x.trim()).filter(Boolean) };
    else if (newType === 'time') fld = { id, name, type: 'time', default: 480 };
    else if (newType === 'text') fld = { id, name, type: 'text', default: '' };
    else fld = { id, name, type: 'number', step: 1, default: 0, ...(newReading ? { reading: true } : {}) };
    set({ custom: [...a.custom, fld] });
    setCustomName('');
    setNewOptions('');
  }

  const numericFields = [
    ...CHIPS.filter((c) => a.chips.includes(c.id) && c.type === 'number').map((c) => ({ id: c.id, name: c.name })),
    ...a.custom.filter((x) => x.type === 'number').map((x) => ({ id: x.id, name: x.name })),
  ];
  function addCombo() {
    const fa = numericFields.find((x) => x.id === comboA);
    const fb = numericFields.find((x) => x.id === comboB);
    if (!fa || !fb) return;
    set({ combos: [...a.combos, { id: `x${Date.now().toString(36)}`, name: comboName.trim() || `${fa.name} × ${fb.name}`, a: fa.id, b: fb.id }] });
    setComboA(''); setComboB(''); setComboName('');
  }

  const example = getPreset(a.presetId)?.examples[0]; // a starting point's own example is fine; a blank one gets a plain description
  const namePlaceholder = example ? `e.g. ${example}` : 'Tracker name';
  const otherNames = state.trackers.filter((x) => x.id !== existing?.id).map((x) => x.name);
  const nameIssue = nameProblem(a.name, otherNames);
  const nameMsg = nameIssue === 'taken' ? 'You already have a tracker with this name.' : nameIssue === 'empty' && nameNudge ? 'Give it a name to continue.' : '';
  const hasThings = draft.fields.some((f) => !f.label);
  // What stops you going on from here, if anything. The button then looks unavailable but still answers.
  const blocked =
    step === 'summary' ? nameIssue !== '' :
    step === 'record' ? (scratch && nameIssue !== '') || (a.record === 'numbers' && a.log !== 'plan' && !hasThings) : false;
  const isStart = step === 'start';
  const isSummary = step === 'summary';
  const planned = a.record === 'numbers' && a.log === 'plan';
  const nudgeName = () => { setNameNudge(true); nameRef.current?.focus(); };
  const pressNext = () => {
    if (blocked) return step === 'record' && !(scratch && nameIssue !== '') ? setRecordNudge(true) : nudgeName();
    return isSummary ? finish() : next();
  };
  // Saving from the leave sheet: go ahead if it is complete, otherwise show what is missing.
  function saveFromSheet() {
    setConfirmLeave(false);
    const complete = nameIssue === '' && !(a.record === 'numbers' && a.log !== 'plan' && !hasThings);
    if (complete) return finish();
    if (detour) setDetour(null);
    if (nameIssue !== '') { setNameNudge(true); setTimeout(() => nameRef.current?.focus(), 150); }
    else setRecordNudge(true);
  }
  // The very first start has no bar: the system back goes to the name and look, and the room goes to the list.
  const firstStart = isStart && !existing && state.trackers.length === 0;
  const unchanged = editing && isSummary && !dirty; // nothing to save yet

  return (
    <View style={s.screen}>
      {firstStart ? null : <ScreenHeader
        label={existing ? existing.name : state.trackers.length > 0 ? 'Cancel' : ''} onBack={existing || state.trackers.length > 0 ? leave : undefined}
        right={<View style={s.row}>{(detour || isStart || steps.length < 2 ? [] : steps).map((k, i) => (<View key={k} style={{ width: 8, height: 8, borderRadius: 4, marginLeft: 5, backgroundColor: i === idx ? colors.accent : colors.border }} />))}</View>}
      />}
      <Scroll resetKey={step} focusToTop={searchFocused} contentContainerStyle={[s.content, { paddingTop: firstStart ? top : 12, paddingBottom: isStart ? SCROLL.basePadding : SCROLL.footerPadding }]} keyboardShouldPersistTaps="handled">
        {firstStart && Platform.OS === 'ios' ? <BackButton label="Name and look" onPress={() => toWelcome?.()} /> : null}
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: 4 }}>
          {editing && step === 'summary' ? 'Your tracker' : scratch ? 'Build your tracker' : step === 'options' ? (draft.fields.some((f) => f.unitKind) ? 'Past days and units' : 'Past days') : QUESTIONS[step]}
        </Text>

        {/* 1 start: templates, or build your own */}
        {step === 'start' ? <StartPicker onTemplate={pickTemplate} onScratch={() => pickStart('blank')} /> : null}

        {/* 2 record: when building your own it also holds the name, so it is one screen */}
        {step === 'record' ? (
          <View>
            {scratch ? (
              <View style={{ marginTop: 10, marginBottom: 6 }}>
                <NameCard
                  name={a.name} icon={a.icon} onName={(v) => { set({ name: v }); if (v.trim()) setNameNudge(false); }} onIcon={(n) => set({ icon: n })}
                  message={nameMsg} inputRef={nameRef} placeholder={namePlaceholder} onSearchFocus={setSearchFocused}
                />
              </View>
            ) : null}
            <RecordStep a={a} set={set} fields={draft.fields} settings={settings} nudge={recordNudge} />
          </View>
        ) : null}

        {/* days, opened from the summary */}

        {/* target: what makes a good day */}
        {step === 'target' ? <TargetStep a={a} set={set} draft={draft} settings={settings} /> : null}

        {/* what it shows: calculations and the small things beside your entries */}
        {step === 'shows' ? (
          <View style={{ marginTop: 6 }}>
            <Card style={{ paddingVertical: 4 }}>
              {a.record === 'numbers' ? <Toggle label="Previous numbers" value={a.extras.previous} onChange={(v) => set({ extras: { ...a.extras, previous: v } })} /> : null}
              {draft.measures.some((m) => m.calc.op === 'latest') ? <Toggle label="3-day average" value={a.extras.average} onChange={(v) => set({ extras: { ...a.extras, average: v } })} /> : null}
            </Card>
            {a.record === 'numbers' ? <Totals fields={draft.fields} combos={a.combos} setCombos={(combos) => set({ combos })} /> : null}
          </View>
        ) : null}

        {/* tools */}
        {step === 'tools' ? (
          <View style={{ marginTop: 6 }}>
            <Card style={{ paddingVertical: 4 }}>
              <Toggle label="Stopwatch" value={!!a.extras.timer} onChange={(v) => set({ extras: { ...a.extras, timer: v } })} />
              {a.extras.timer ? intoPicker('timerInto') : null}
              <Toggle label="Countdown" value={!!a.extras.countdown} onChange={(v) => set({ extras: { ...a.extras, countdown: v } })} />
              {a.extras.countdown ? intoPicker('countdownInto') : null}
              {draft.input === 'form' && canRecordRun(draft.fields) ? <Toggle label="Record runs with GPS" value={!!a.extras.gps} onChange={(v) => set({ extras: { ...a.extras, gps: v } })} /> : null}
              {draft.input === 'form' ? <Toggle label="Photos" value={!!a.extras.photos} onChange={(v) => set({ extras: { ...a.extras, photos: v } })} /> : null}
              {draft.input === 'plan' && a.planStyle === 'items' ? <Toggle label="Count what is left" value={!!a.extras.stock} onChange={(v) => set({ extras: { ...a.extras, stock: v } })} /> : null}
              {draft.input === 'form' && spanPair(draft) ? <Toggle label={`Clock for ${spanPair(draft)!.measure.name.toLowerCase()}`} value={!!a.extras.clock} onChange={(v) => set({ extras: { ...a.extras, clock: v } })} /> : null}
            </Card>
          </View>
        ) : null}

        {/* bring in: the phone's steps, Health Connect, and files from other apps */}
        {step === 'bring' ? (
          <View style={{ marginTop: 6 }}>
            {stepsFieldIn(draft.fields) ? (
              <Card style={{ paddingVertical: 4 }}>
                <Toggle label="Steps from my phone" value={a.extras.auto ?? counterAvailable()} onChange={(v) => set({ extras: { ...a.extras, auto: v } })} />
              </Card>
            ) : null}
            <HealthImportCard t={existing ?? ({ ...draft, id: 'new', systemId: null, createdAt: 0 } as Tracker)} saved={!!existing} keep={!!a.extras.health} setKeep={(v) => set({ extras: { ...a.extras, health: v } })} />
            {existing && canRecordRun(existing.fields) ? <RunFileImport t={existing} /> : null}
            {existing && existing.input === 'plan' && liftFields(existing).weight ? <LiftFileImport t={existing} settings={settings} /> : null}
            {!existing && bringOptions(draft).files ? <Text style={{ color: colors.muted, fontSize: 13, marginTop: 10 }}>Files from other apps can be brought in here once the tracker is saved.</Text> : null}
          </View>
        ) : null}

        {/* options: past days, units for this tracker, and copying it */}
        {step === 'options' ? (
          <View style={{ marginTop: 6 }}>
            <Card style={{ paddingVertical: 4 }}>
              <Toggle label="Lock past days" value={a.extras.lockPast} onChange={(v) => set({ extras: { ...a.extras, lockPast: v } })} />
            </Card>
            {draft.fields.some((f) => f.unitKind) ? (
              <Card style={{ padding: 12, marginTop: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 8 }}>Units</Text>
                <View style={s.wrap}>
                  {(['default', 'imperial', 'metric'] as const).map((u) => (
                    <Chip key={u} label={u === 'default' ? 'My default' : u === 'imperial' ? 'Imperial' : 'Metric'} active={a.units === u} onPress={() => setA(changeUnits(a, u, settings))} />
                  ))}
                </View>
              </Card>
            ) : null}
          </View>
        ) : null}

        {/* 6 summary */}

        {step === 'summary' ? (
          <View style={{ marginTop: 10 }}>
            <NameCard
              name={a.name} icon={a.icon} onName={(v) => { set({ name: v }); if (v.trim()) setNameNudge(false); }} onIcon={(n) => set({ icon: n })}
              message={nameMsg} inputRef={nameRef} onSearchFocus={setSearchFocused}
            />
            <ScheduleSection a={a} set={set} planned={planned} />
            {summaryLines(a, settings, editing).map((l) => (
              <Tap key={l.label} onPress={() => go(l.step)}>
                <Card style={{ padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{l.label}</Text>
                    <Text style={{ color: colors.text, fontSize: 15 }}>{l.value}</Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color={colors.muted} />
                </Card>
              </Tap>
            ))}
            {existing ? (
              <View style={{ marginTop: 8 }}>
                <Button label="Copy tracker to share" variant="ghost" onPress={() => copy(exportStructure(existing), 'Tracker')} style={{ marginBottom: 8 }} />
                {msg ? <Text style={{ color: colors.done, marginBottom: 8 }}>{msg}</Text> : null}
                <Button
                  label={confirmDelete ? 'Tap again to delete' : 'Delete tracker'} variant="danger"
                  onPress={() => { if (confirmDelete) { removeTracker(existing.id); cancel(); } else setConfirmDelete(true); }}
                />
                {/* the line is always there, so confirming changes no spacing */}
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6, opacity: confirmDelete ? 1 : 0 }}>You can restore it from Settings.</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Scroll>

      {!isStart ? (
        <View style={{ borderTopWidth: px(1), borderTopColor: colors.border, backgroundColor: colors.card, padding: 12, paddingBottom: 22 }}>
          <View style={s.row}>
            <Button label="Back" variant="ghost" onPress={back} style={{ marginRight: 10 }} />
            <Button
              label={isSummary ? (editing ? 'Save changes' : 'Start logging') : detour ? 'Done' : 'Next'}
              onPress={pressNext}
              disabled={unchanged}
              style={{ flex: 1, opacity: blocked || unchanged ? 0.4 : 1 }}
            />
          </View>
        </View>
      ) : null}

      {confirmLeave ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setConfirmLeave(false)} accessibilityLabel="Keep editing" />
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: px(1), borderColor: colors.border, padding: 16, paddingBottom: 26 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 4 }}>{existing ? 'Save your changes?' : 'Save this tracker?'}</Text>
            <Muted style={{ marginBottom: 14 }}>{existing ? 'Leave without saving and the changes you made are lost.' : 'Leave without saving and what you set up so far is lost.'}</Muted>
            <Button label={existing ? 'Save changes' : 'Start logging'} onPress={saveFromSheet} style={{ marginBottom: 10 }} />
            <Button label={existing ? 'Keep editing' : 'Keep building'} variant="ghost" onPress={() => setConfirmLeave(false)} style={{ marginBottom: 10 }} />
            <Button label={existing ? 'Discard changes' : 'Discard tracker'} variant="danger" onPress={cancel} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
