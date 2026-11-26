// Setup: turns the plain answers from the guided flow into a tracker, and back.
// People never see fields, measures or targets; they answer short questions and
// this builds the same universal tracker the engine already understands.

import { MAX_LISTS, dayKeyOf, emptyPlanDays, syncSame, versionFor, WEEKDAYS } from './plan';
import { canTimerFill } from './duration';
import { DAYS_MEASURE, goalToBase, goalToDisplay, describeGoal as describeGoalDef } from './goals';
import { normalizeSchedule, scheduleOf, scheduleText, weekdaysOf } from './schedule';
import { getPreset } from './presets';
import { stepsFieldIn } from './autoFields';
import { DEFAULT_TERMS, plural, SETS_TERMS } from './terms';
import { fieldUnit, formatNumber, measureFromDisplay, measureToDisplay, measureUnit, round2, unitForSystem } from './units';
import { canRecordRun } from './runImport';
import { spanPair } from './spanClock';
import { HEALTH_LABEL, healthKind, type HealthKind } from './healthImport';

// What a tracker can take in besides typing: the phone's steps, a kind of Health Connect reading, and files (runs, lifting history).
export function bringOptions(draft: TrackerDraft): { steps: boolean; health?: HealthKind; files: boolean; any: boolean } {
  const steps = !!stepsFieldIn(draft.fields);
  const health = healthKind(draft as unknown as Tracker);
  const files = canRecordRun(draft.fields) || (draft.input === 'plan' && draft.fields.some((f) => f.unitKind === 'weight'));
  return { steps, ...(health ? { health } : {}), files, any: steps || !!health || files };
}
import type {
  Field, InputKind, Measure, PlanDay, PlanVersion, Schedule, ScheduleWindow, Settings, SuccessRule, Target, Tracker, TrackerDraft, UnitKind, Terms, GoalDef,
} from './types';

const LB = 0.45359237;

export type RecordMode = 'done' | 'count' | 'numbers';

export interface Chip {
  id: string;
  name: string;
  type: 'number' | 'text' | 'duration';
  unitKind?: UnitKind;
  unit?: string;
  step?: number;
  default?: number | string;
  agg: 'sum' | 'latest';
}

// What a person can say they write down. Ids match the presets so edits line up.
export const CHIPS: Chip[] = [
  { id: 'weight', name: 'Weight', type: 'number', unitKind: 'weight', default: 45 * LB, agg: 'latest' },
  { id: 'reps', name: 'Reps', type: 'number', step: 1, default: 8, agg: 'sum' },
  { id: 'minutes', name: 'Time', type: 'duration', unit: 'min', step: 5, default: 25, agg: 'sum' },
  { id: 'kcal', name: 'Calories', type: 'number', unit: 'kcal', step: 50, default: 500, agg: 'sum' },
  { id: 'protein', name: 'Protein', type: 'number', unit: 'g', step: 5, default: 30, agg: 'sum' },
  { id: 'distance', name: 'Distance', type: 'number', unitKind: 'distance', step: 0.5, default: 5, agg: 'sum' },
  { id: 'note', name: 'Note', type: 'text', default: '', agg: 'sum' },
];

// Every kind of thing is on offer for every tracker; a starting point only decides what is pre-selected.
export function chipsFor(_presetId: string, _selected: string[]): Chip[] {
  return CHIPS;
}

// One repeating goal, in display units. A range uses value as the low end and value2 as the high end.
// The measure 'count' on a tracker you log freely means "how many entries a day" (show up).
export interface Goal {
  id: string;
  measure: string;
  cmp: 'min' | 'max' | 'range';
  value: number;
  value2: number;
}

const rowWord = (a: { terms?: Terms }): string => a.terms?.row ?? DEFAULT_TERMS.row; // what one entry of a plan item is called

// A number built from two of your fields, added up across entries (like weight times reps).
// How two numbers combine: multiply (added up over the entries), add, subtract, divide (the day's totals), or the hours between two times.
export type ComboFn = 'mul' | 'add' | 'sub' | 'div' | 'span';
export interface Combo { id: string; name: string; a: string; b: string; fn?: ComboFn }

export interface Answers {
  presetId: string;
  name: string;
  icon: string;
  record: RecordMode;
  chips: string[]; // chip ids
  custom: Field[]; // fields that are not chips (kept when editing)
  log: 'free' | 'plan';
  schedule: Schedule; // when it is expected: the one place the days are chosen, for a plan too
  window?: ScheduleWindow; // only active between two dates
  planMode: 'asigo' | 'example'; // start empty and add as you go (the default), or start from an example
  dayNames: Record<number, string>; // what each training day is called (Push, Pull...), optional
  samePlan: boolean; // one list for every training day
  rotation: string[]; // the names of lists taken in turn (Push, Pull, Legs), not tied to weekdays; empty is off
  startGoals: GoalDef[]; // goals over time chosen while setting up, saved with the tracker
  planStyle: 'sets' | 'items'; // planned items are filled in each time, or ticked with their own numbers
  combos: Combo[]; // numbers built from two fields
  units: 'default' | 'imperial' | 'metric'; // this tracker's units: follow the app default, or its own
  avoid: boolean; // a check-in where you log slips (nothing logged is a good day)
  streak: boolean; // an avoid tracker shows its clean streak (on unless switched off)
  daily: boolean; // one reading a day; saving again replaces it
  countStep: number; // a counter: how much each tap adds (1 by default)
  countUnit: string; // a counter: what it counts, like glasses or ml (blank for plain taps)
  terms?: Terms; // what a planned tracker calls things
  sample?: PlanDay[]; // a ready-made plan this starting point brings
  templateId?: string; // set when it came from a template: those go straight to the summary
  goal: 'none' | 'plan' | 'number';
  goals: Goal[]; // used when goal is 'number'
  finishPlan: boolean; // a good day also needs most of the plan done
  extraTargets: Target[]; // other targets carried over from a preset or an existing tracker
  extras: { previous: boolean; lockPast: boolean; average: boolean; auto?: boolean; countdown?: boolean; timer?: boolean; timerInto?: string; countdownInto?: string; gps?: boolean; clock?: boolean; stock?: boolean; photos?: boolean; health?: boolean };
  system: boolean;
}

export const START_IDS = ['counter', 'check-in', 'set-plan', 'measurement', 'time-blocks', 'checklist-totals', 'blank'];

export const newGoal = (measure: string, cmp: Goal['cmp'] = 'min', value = 1, value2 = value): Goal => ({ id: `g${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`, measure, cmp, value, value2 });
const goal = (measure: string, cmp: Goal['cmp'], value: number): Goal => ({ id: 'g0', measure, cmp, value, value2: value });

function blank(): Answers {
  return {
    presetId: 'blank', name: 'New tracker', icon: 'apps-outline', record: 'numbers', chips: [], custom: [],
    log: 'free', schedule: { kind: 'daily' }, planMode: 'asigo', dayNames: {}, samePlan: false, rotation: [], startGoals: [], planStyle: 'sets', combos: [], units: 'default', avoid: false, streak: true, daily: false, countStep: 1, countUnit: '', goal: 'none', goals: [], finishPlan: false,
    extraTargets: [], extras: { previous: true, lockPast: false, average: false }, system: true,
  };
}

export function answersFromPreset(presetId: string): Answers {
  const base = blank();
  const preset = getPreset(presetId);
  if (!preset) return base;
  const a: Answers = { ...base, presetId, name: preset.title, icon: preset.trackerIcon };
  switch (presetId) {
    case 'counter':
      return { ...a, record: 'count' };
    case 'check-in':
      return { ...a, record: 'done' };
    case 'set-plan':
      return { ...a, record: 'numbers', chips: ['weight', 'reps'], log: 'plan', schedule: { kind: 'weekdays', days: [1, 3, 5] }, planMode: 'asigo', terms: SETS_TERMS };
    case 'measurement':
      return { ...a, record: 'numbers', chips: ['weight'], extras: { ...a.extras, average: true } };
    case 'time-blocks':
      return { ...a, record: 'numbers', chips: ['minutes', 'note'] };
    case 'checklist-totals':
      return {
        ...a, record: 'numbers', chips: ['protein', 'kcal'], log: 'plan', planStyle: 'items', planMode: 'asigo', samePlan: true,
        extras: { ...a.extras, previous: false },
      };
    default:
      return base;
  }
}

// Which units a tracker uses: its own system when every unit field is set to the same one, else the app default.
function unitsOfTracker(t: Tracker): Answers['units'] {
  const unitFields = t.fields.filter((f) => f.unitKind);
  if (unitFields.length === 0) return 'default';
  for (const sys of ['imperial', 'metric'] as const) {
    if (unitFields.every((f) => f.unitOverride === unitForSystem(f.unitKind as UnitKind, sys))) return sys;
  }
  return 'default';
}

// Whether a tracker's Steps are filled from the phone: only said when it was chosen (an unchosen one follows the phone's ability).
function autoOf(t: Tracker): { auto?: boolean } {
  const f = stepsFieldIn(t.fields);
  const s = f ? t.sources?.[f.id] : undefined;
  return s ? { auto: s !== 'manual' } : {};
}

// Rebuild answers from a tracker so editing reopens the same flow.
export function answersFromTracker(t: Tracker, settings: Settings, hasSystem: boolean): Answers {
  // Every field is held as itself, in the order the form shows them. (Splitting preset ones out used to move a note to the front.)
  const chips: string[] = [];
  const custom = t.input === 'tap' ? [] : t.fields; // a counter's amount is its own setting, not a thing entered
  const latest = t.plan.length ? versionFor(t.plan, Date.now()) : null;
  const sched = scheduleOf(t);
  const goalIds = t.success.mode === 'target' ? [t.success.targetId] : t.success.mode === 'targets' ? t.success.targetIds : [];
  const goalTargets = goalIds.map((id) => t.targets.find((x) => x.id === id)).filter((x): x is Target => !!x);
  const disp = (measure: string, base: number | undefined): number => {
    const gm = t.measures.find((m) => m.id === measure);
    return base === undefined ? 1 : gm ? round2(measureToDisplay(t, gm, base, settings)) : base;
  };
  const goals: Goal[] = goalTargets.map((x, i) => ({
    id: i === 0 ? 'g0' : `g${i}`, measure: x.measure,
    cmp: x.min !== undefined && x.max !== undefined ? 'range' : x.max !== undefined ? 'max' : 'min',
    value: disp(x.measure, x.min ?? x.max), value2: disp(x.measure, x.max ?? x.min),
  }));
  const goalSet = new Set(goalTargets.map((x) => x.id));
  return {
    presetId: t.presetId, name: t.name, icon: t.icon, ...(t.templateId ? { templateId: t.templateId } : {}),
    record: t.input === 'check' ? 'done' : t.input === 'tap' ? 'count' : 'numbers',
    chips, custom,
    log: t.input === 'plan' ? 'plan' : 'free',
    schedule: sched, ...(t.window ? { window: t.window } : {}), planMode: 'asigo', dayNames: latest ? Object.fromEntries(latest.days.map((d, i) => [i, d.label] as const).filter(([, l]) => l)) : {}, samePlan: !!(t.plan.length && versionFor(t.plan, Date.now())?.same), rotation: latest?.rotation ? latest.days.map((d) => d.label) : [],
    goal: goals.length > 0 ? 'number' : 'none',
    goals,
    finishPlan: t.success.mode === 'plan' || (t.success.mode === 'targets' && t.success.planMinPct !== undefined),
    extraTargets: t.targets.filter((x) => !goalSet.has(x.id)),
    extras: { previous: t.tools.previous, lockPast: t.tools.lockPast, average: t.derived.length > 0, ...autoOf(t), ...(t.tools.countdown ? { countdown: true } : {}), ...(t.tools.timer ? { timer: true } : {}), ...(t.tools.timerInto ? { timerInto: t.tools.timerInto } : {}), ...(t.tools.countdownInto ? { countdownInto: t.tools.countdownInto } : {}), ...(t.tools.gps ? { gps: true } : {}), ...(t.tools.clock ? { clock: true } : {}), ...(t.tools.stock ? { stock: true } : {}), ...(t.tools.photos ? { photos: true } : {}), ...(t.tools.health ? { health: true } : {}) },
    planStyle: t.planStyle ?? (t.measures.some((m) => m.id === 'sets') ? 'sets' : 'items'),
    combos: t.measures.filter((m) => m.calc.op === 'sumProduct' || m.calc.op === 'sumExpr' || m.calc.op === 'ratio').map((m) => ({
      id: m.id, name: m.name, a: (m.calc as { a: string }).a, b: (m.calc as { b: string }).b,
      fn: (m.calc.op === 'sumProduct' ? 'mul' : m.calc.op === 'ratio' ? 'div' : (m.calc as { fn: 'add' | 'sub' | 'span' }).fn) as ComboFn,
    })),
    countStep: t.input === 'tap' ? t.fields.find((f) => f.id === 'n')?.step ?? 1 : 1,
    countUnit: t.input === 'tap' ? t.fields.find((f) => f.id === 'n')?.unit ?? '' : '',
    units: unitsOfTracker(t), avoid: !!t.avoid, streak: t.streak !== false, daily: !!t.daily, terms: t.terms,
    startGoals: [],
    system: hasSystem && t.systemId !== null,
  };
}

export function chipField(c: Chip): Field {
  return { id: c.id, name: c.name, type: c.type, unitKind: c.unitKind, unit: c.unit, step: c.step, default: c.default, ...(c.agg === 'latest' ? { reading: true } : {}) };
}

// What to suggest, greyed out, when naming the nth training day: the example plan's names if this start has one.
export function dayNameHint(a: Answers, n: number): string {
  const sample = a.sample ?? exampleDays(a.presetId);
  const label = sample[n % Math.max(1, sample.length)]?.label;
  return label || `Day ${String.fromCharCode(65 + (n % 26))}`;
}

// Does this starting point come with a sample plan?
export const hasSample = (presetId: string): boolean => exampleDays(presetId).length > 0;

function exampleDays(presetId: string): PlanDay[] {
  const p = getPreset(presetId);
  if (!p) return [];
  return (p.sample?.() ?? []).filter((d) => d.slots.length > 0);
}

export function draftFromAnswers(a: Answers, settings: Settings, existing?: Tracker): TrackerDraft {
  const prev = new Map((existing?.fields ?? []).map((f) => [f.id, f] as const));
  let fields: Field[] = [];
  let measures: Measure[] = [];
  let input: InputKind = 'check';
  let primary = 'done';

  const amounts = a.record === 'count' && (a.countStep > 1 || a.countUnit.trim() !== '');
  if (a.record === 'count') {
    input = 'tap';
    if (amounts) {
      // Each tap adds an amount, so the counter holds one number field and totals it.
      const unit = a.countUnit.trim();
      fields = [{ id: 'n', name: unit || 'Amount', type: 'number', step: Math.max(1, a.countStep), default: Math.max(1, a.countStep), ...(unit ? { unit } : {}) }];
      measures = [{ id: 'n', name: unit ? unit[0].toUpperCase() + unit.slice(1) : 'Total', calc: { op: 'sum', field: 'n' } }, { id: 'count', name: 'Taps', calc: { op: 'count' } }];
      primary = 'n';
    } else {
      measures = [{ id: 'count', name: 'Count', calc: { op: 'count' } }];
      primary = 'count';
    }
  } else if (a.record === 'numbers') {
    input = a.log === 'plan' ? 'plan' : 'form';
    const fromChips = CHIPS.filter((c) => a.chips.includes(c.id)).map((c) => prev.get(c.id) ?? chipField(c));
    const all = [...fromChips, ...a.custom.filter((f) => !fromChips.some((x) => x.id === f.id))];
    const blanks = all.filter((f) => !f.name.trim()).length;
    let unnamed = 0;
    const taken = new Set(all.filter((f) => f.name.trim()).map((f) => f.name.trim().toLowerCase()));
    fields = all
      // never save a nameless thing: one gets its type's word, several are Unnamed 1, 2, 3 so none is mistaken for another (and none repeats a name already there)
      .map((f) => {
        if (f.name.trim()) return f;
        const base = blanks > 1 ? `Unnamed ${++unnamed}` : ({ number: 'Number', rating: 'Rating', time: 'Time', duration: 'Duration', choice: 'Choice', text: 'Note' } as const)[f.type];
        let name = base;
        for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
        taken.add(name.toLowerCase());
        return { ...f, name };
      })
      .map((f) => {
      if (!f.unitKind) return f;
      const { unitOverride: _drop, ...rest } = f;
      return a.units === 'default' ? rest : { ...rest, unitOverride: unitForSystem(f.unitKind, a.units) };
    });
    const nums = fields.filter((f) => f.type === 'number' || f.type === 'rating' || f.type === 'time' || f.type === 'duration');
    if (input === 'plan' && a.planStyle === 'sets') measures.push({ id: 'sets', name: plural(rowWord(a), 2), calc: { op: 'count' } });
    for (const f of nums) {
      // A reading (a weight, a rating, a time, or any daily value) shows its latest value; amounts add up.
      const latest = ((f.type !== 'number' && f.type !== 'duration') || f.reading === true || a.daily) && input !== 'plan';
      // Adding up the weights of a day's sets means nothing; the heaviest is what is read.
      const heaviest = !latest && input === 'plan' && a.planStyle === 'sets' && f.unitKind === 'weight';
      measures.push({ id: f.id, name: f.name, calc: latest ? { op: 'latest', field: f.id } : heaviest ? { op: 'max', field: f.id } : { op: 'sum', field: f.id }, unitFrom: f.unitKind ? f.id : undefined });
    }
    for (const c of a.combos) {
      if (nums.some((f) => f.id === c.a) && nums.some((f) => f.id === c.b)) {
        const fn = c.fn ?? 'mul';
        const calc: Measure['calc'] = fn === 'mul' ? { op: 'sumProduct', a: c.a, b: c.b } : fn === 'div' ? { op: 'ratio', a: c.a, b: c.b } : { op: 'sumExpr', a: c.a, b: c.b, fn };
        measures.push({ id: c.id, name: c.name, calc, ...(fn === 'mul' || fn === 'add' || fn === 'sub' ? { unitFrom: c.a } : {}) });
      }
    }
    const combo = measures.find((m) => m.calc.op === 'sumProduct');
    primary = combo?.id ?? nums[0]?.id ?? (input === 'plan' && a.planStyle === 'sets' ? 'sets' : 'done');
    if (fields.length === 0) {
      const sets = input === 'plan' && a.planStyle === 'sets';
      measures = sets ? [{ id: 'sets', name: plural(rowWord(a), 2), calc: { op: 'count' } }] : [];
      primary = sets ? 'sets' : 'done';
    }
  }

  // The goal.
  const shell = { fields, measures } as Pick<Tracker, 'fields' | 'measures'>;
  let targets: Target[] = [];
  let success: SuccessRule = a.avoid && a.record === 'done' ? { mode: 'clean' } : { mode: 'logged' };
  const wantPlan = a.finishPlan && input === 'plan';
  if (wantPlan && !(a.goal === 'number' && a.goals.length > 0)) {
    success = { mode: 'plan', minPct: 80 };
    targets = a.extraTargets.filter((x) => measures.some((m) => m.id === x.measure));
  } else if (a.goal === 'number' && a.goals.length > 0) {
    const made: Target[] = [];
    a.goals.forEach((g, i) => {
      const gm = amounts && g.measure === 'count' ? 'n' : g.measure; // a goal on "the count" of a counter that adds amounts is on the amount
      const m = measures.find((x) => x.id === gm);
      const conv = (v: number) => (m ? measureFromDisplay(shell as Tracker, m, v, settings) : v);
      const id = i === 0 ? 't-goal' : `t-goal${i}`;
      if (!m && gm !== 'count') return;
      made.push({
        id, measure: gm,
        ...(g.cmp === 'min' ? { min: conv(g.value) } : g.cmp === 'max' ? { max: conv(g.value) } : { min: conv(Math.min(g.value, g.value2)), max: conv(Math.max(g.value, g.value2)) }),
      });
    });
    if (made.length > 0) {
      targets = [...made, ...a.extraTargets.filter((x) => !made.some((y) => y.id === x.id) && measures.some((mm) => mm.id === x.measure))];
      success = made.length === 1 && !wantPlan ? { mode: 'target', targetId: made[0].id } : { mode: 'targets', targetIds: made.map((x) => x.id), ...(wantPlan ? { planMinPct: 80 } : {}) };
    }
  } else {
    targets = a.extraTargets.filter((x) => measures.some((m) => m.id === x.measure));
  }

  const latestM = measures.find((m) => m.calc.op === 'latest');
  const derived = a.extras.average && latestM ? [{ id: 'avg3', name: '3-day average', measure: latestM.id, days: 3 }] : [];

  // The plan.
  let plan: PlanVersion[] = existing?.plan ?? [];
  if (input === 'plan' && a.rotation.length >= 2) {
    // Lists taken in turn: just the lists, in order. Lists already built are kept by position, so changing layout loses nothing.
    const today = dayKeyOf(Date.now());
    const cur0 = existing?.plan.length ? versionFor(existing.plan, Date.now()) : null;
    const old = cur0?.rotation ? cur0.days : (cur0?.days ?? []).filter((d) => d.slots.length > 0);
    const sample = a.planMode === 'example' ? (a.sample ?? exampleDays(a.presetId)) : [];
    const days: PlanDay[] = a.rotation.slice(0, MAX_LISTS).map((name, i) => ({ ...(old[i] ?? { slots: sample[i] ? JSON.parse(JSON.stringify(sample[i].slots)) : [] }), label: name.trim() }));
    plan = [...(existing?.plan ?? []).filter((v) => v.from !== today), { from: today, days, rotation: true }].sort((x, y) => (x.from < y.from ? -1 : 1));
  } else if (input === 'plan') {
    const today = dayKeyOf(Date.now());
    const planDays = weekdaysOf(scheduleFromAnswers(a));
    const cur = existing?.plan.length ? versionFor(existing.plan, Date.now())?.days : undefined;
    const sample = a.planMode === 'example' ? (a.sample ?? exampleDays(a.presetId)) : [];
    let k = 0;
    const days: PlanDay[] = emptyPlanDays().map((_, wd) => {
      const chosen = planDays.includes(wd);
      const was = cur?.[wd];
      const named = (a.dayNames[wd] ?? '').trim();
      if (was && (was.slots.length > 0 || (!chosen && was.label))) return { ...was, ...(named ? { label: named } : {}) };
      if (!chosen) return { label: '', slots: [] };
      const src = sample.length ? sample[k++ % sample.length] : null;
      return src ? { label: named || was?.label || src.label, slots: JSON.parse(JSON.stringify(src.slots)) } : { label: named || was?.label || '', slots: [] };
    });
    if (a.samePlan) {
      const si = days.findIndex((d, i) => planDays.includes(i) && d.slots.length > 0);
      if (si >= 0) syncSame(days, si, planDays);
    }
    plan = [...(existing?.plan ?? []).filter((v) => v.from !== today), { from: today, days, ...(a.samePlan ? { same: true } : {}) }].sort((x, y) => (x.from < y.from ? -1 : 1));
  } else {
    plan = existing?.plan ?? [];
  }

  // A schedule of "times a week or month" is the goal of that many days; it is kept as one goal so it is never listed twice.
  const sched = scheduleFromAnswers(a);
  const timesGoal: GoalDef[] = sched.kind === 'times'
    ? [{ id: 'sched', measure: DAYS_MEASURE, agg: 'days', how: sched.per, cmp: 'min', value: sched.n, from: dayKeyOf(Date.now()) }]
    : [];
  // A goal about something that is no longer recorded (a thing that was removed) would point at nothing, so it is dropped.
  const stillThere = (g: GoalDef): boolean =>
    (!g.field || fields.some((f) => f.id === g.field))
    && (g.measure === 'count' || g.measure === DAYS_MEASURE || fields.some((f) => f.id === g.measure) || measures.some((m) => m.id === g.measure))
    && (!g.where || fields.some((f) => f.id === g.where?.field));
  const goalsOut: GoalDef[] = [...(existing?.goals ?? []).filter((g) => g.id !== 'sched'), ...a.startGoals.filter((g) => g.id !== 'sched'), ...timesGoal].filter(stillThere);

  const stepsF = stepsFieldIn(fields);
  const sources: Tracker['sources'] = stepsF && a.extras.auto !== undefined ? { ...(existing?.sources ?? {}), [stepsF.id]: a.extras.auto ? 'sensor' : 'manual' } : existing?.sources;

  return {
    name: a.name.trim() || 'New tracker',
    icon: a.icon || 'apps-outline',
    presetId: a.presetId,
    ...(a.templateId ? { templateId: a.templateId } : {}),
    input,
    fields,
    measures,
    primaryMeasure: primary,
    targets,
    derived,
    success,
    plan,
    schedule: scheduleFromAnswers(a),
    ...(a.window ? { window: a.window } : {}),
    tools: { previous: a.extras.previous, lockPast: a.extras.lockPast, ...(a.extras.countdown ? { countdown: true } : {}), ...(a.extras.timer ? { timer: true } : {}), ...(a.extras.timer && a.extras.timerInto && fields.some((f) => f.id === a.extras.timerInto && canTimerFill(f)) && input === 'form' ? { timerInto: a.extras.timerInto } : {}), ...(a.extras.countdown && a.extras.countdownInto && fields.some((f) => f.id === a.extras.countdownInto && canTimerFill(f)) && input === 'form' ? { countdownInto: a.extras.countdownInto } : {}), ...(a.extras.gps && input === 'form' && canRecordRun(fields) ? { gps: true } : {}), ...(a.extras.clock && input === 'form' && spanPair({ fields, measures }) ? { clock: true } : {}), ...(a.extras.stock && input === 'plan' && a.planStyle === 'items' ? { stock: true } : {}), ...(a.extras.photos && input === 'form' ? { photos: true } : {}), ...(a.extras.health ? { health: true } : {}) },
    ...(a.terms ? { terms: a.terms } : {}),
    ...(goalsOut.length > 0 || existing?.goals ? { goals: goalsOut } : {}),
    ...(input === 'plan' ? { planStyle: a.planStyle } : {}),
    ...(a.avoid && a.record === 'done' ? { avoid: true, ...(a.streak ? {} : { streak: false }) } : {}),
    ...(a.daily && input === 'form' ? { daily: true } : {}),
    ...(sources ? { sources } : {}),
  };
}

// The schedule to store: the one the person chose, tidied.
export function scheduleFromAnswers(a: Answers): Schedule {
  // Lists taken in turn belong to no particular day: it can only be a number of times, or whenever.
  if (a.rotation.length >= 2 && a.schedule.kind !== 'times' && a.schedule.kind !== 'whenever') return { kind: 'whenever' };
  return normalizeSchedule(a.schedule);
}

// ---------- plain-language descriptions ----------

export function chipLabel(c: Chip, settings: Settings): string {
  // The unit follows the default and shows next to the number when you log, so the name stays plain.
  void settings;
  return c.name;
}

export function daysLabel(days: number[]): string {
  if (days.length === 7) return 'every day';
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.filter((d) => days.includes(d)).map((d) => WEEKDAYS[d].slice(0, 3)).join(' ') || 'no days';
}

export function describeGoal(g: Goal, a: Answers, draft: TrackerDraft, settings: Settings): string {
  const gm = a.record === 'count' && g.measure === 'count' && draft.fields.some((f) => f.id === 'n') ? 'n' : g.measure; // a counter that adds amounts counts the amount
  const m = draft.measures.find((x) => x.id === gm);
  if (g.measure === 'count' && a.record !== 'count') {
    return g.value <= 1 ? 'log it every day' : `log it ${formatNumber(g.value)} times a day`;
  }
  const unit = m ? measureUnit(draft as unknown as Tracker, m, settings) : undefined;
  const u = unit ? ' ' + unit : g.measure === 'count' && a.record === 'count' && a.countUnit.trim() ? ' ' + a.countUnit.trim() : ''; // a counter's own word (cups)
  const name = m && m.id !== 'count' && m.name.toLowerCase() !== (unit ?? '').toLowerCase() ? m.name.toLowerCase() + ' ' : '';
  const perDay = m?.calc.op === 'latest' ? '' : ' a day'; // a reading like weight is not added up over the day
  if (g.cmp === 'range') return `${name}${formatNumber(Math.min(g.value, g.value2))} to ${formatNumber(Math.max(g.value, g.value2))}${u}${perDay}`;
  return `${name}${g.cmp === 'min' ? 'at least' : 'at most'} ${formatNumber(g.value)}${u}${perDay}`;
}

// What makes a good day for this tracker, in words, for the summary: its target, or what simply counts.
export function targetText(a: Answers, draft: TrackerDraft, settings: Settings): string {
  if (a.avoid && a.record === 'done') return 'A day with nothing logged';
  const cap = (t: string): string => t.replace(/^./, (c) => c.toUpperCase());
  const parts: string[] = [];
  if (a.goal === 'number') for (const g of a.goals) parts.push(cap(describeGoal(g, a, draft, settings)));
  if (a.finishPlan && draft.input === 'plan') parts.push(a.goal === 'number' && a.goals.length ? 'and finish most of the plan' : 'Finish most of the plan');
  if (parts.length) return parts.join(' · ');
  return draft.input === 'check' ? 'Tapping it counts' : 'Any entry counts';
}

// Switch this tracker's units and carry any goal numbers across, so 150 lb becomes 68 kg and not 150 kg.
export function changeUnits(a: Answers, to: Answers['units'], settings: Settings): Answers {
  const before = draftFromAnswers(a, settings);
  const after = draftFromAnswers({ ...a, units: to }, settings);
  const goals = a.goals.map((g) => {
    const m = before.measures.find((x) => x.id === g.measure);
    const m2 = after.measures.find((x) => x.id === g.measure);
    if (!m || !m2) return g;
    const conv = (v: number) => round2(measureToDisplay(after as unknown as Tracker, m2, measureFromDisplay(before as unknown as Tracker, m, v, settings), settings));
    return { ...g, value: conv(g.value), value2: conv(g.value2) };
  });
  return { ...a, units: to, goals };
}

const shellOf = (draft: TrackerDraft): Tracker => ({ ...draft, id: 'new', systemId: null, createdAt: 0 });

export function nameProblem(name: string, others: string[]): '' | 'empty' | 'taken' {
  const n = name.trim().toLowerCase();
  if (!n) return 'empty';
  return others.some((o) => o.trim().toLowerCase() === n) ? 'taken' : '';
}

// How a plan's lists are described: one list shared by every day, or a list for each day (with the days' names if they have them).
export function planWords(a: Answers): string {
  if (a.rotation.length >= 2) return `Choose each time (${a.rotation.map((n) => n.trim()).filter(Boolean).join(', ') || `${a.rotation.length} lists`})`;
  if (a.samePlan) return 'The same list';
  const order = a.schedule.kind === 'blocks' ? weekdaysOf(a.schedule) : [1, 2, 3, 4, 5, 6, 0].filter((d) => weekdaysOf(a.schedule).includes(d));
  const named = order.map((d) => (a.dayNames[d] ?? '').trim()).filter(Boolean).join(', ');
  return `A list per weekday${named ? ` (${named})` : ''}`;
}

// The rows on the summary: what you log, what it shows, its tools and its options, each with its current contents. Rows that do not
// apply to a tracker are left out. Each opens the screen where it is set.
export type SummaryStep = 'record' | 'target' | 'shows' | 'tools' | 'bring' | 'options';

export function summaryLines(a: Answers, settings: Settings, editing = false): { label: string; value: string; step: SummaryStep }[] {
  void editing;
  const draft = draftFromAnswers(a, settings);
  const lines: { label: string; value: string; step: SummaryStep }[] = [];
  const cap = (s: string): string => s.replace(/^./, (c) => c.toUpperCase());

  // What you log: how it is logged and what is written down.
  const names = draft.fields.filter((f) => !f.label).map((f) => f.name).join(', ');
  const named = draft.fields.some((f) => f.label) ? ', each named' : '';
  const logging =
    a.record === 'done' ? (a.avoid ? 'Tap once to log a slip' : 'Tap once when done')
    : a.record === 'count' ? (a.countStep > 1 || a.countUnit.trim() ? `Tap to count${a.countStep > 1 ? `, ${a.countStep} at a time` : ''}${a.countUnit.trim() ? ` (${a.countUnit.trim()})` : ''}` : 'Tap to count')
    : `${a.log === 'plan' ? (a.planStyle === 'items' && a.samePlan && a.rotation.length < 2 ? `Tick off each ${(a.terms?.item ?? DEFAULT_TERMS.item).toLowerCase()}` : planWords(a)) : a.daily ? 'One value a day' : `Add entries as you go${named}`}${names ? `: ${names}` : ''}`;
  lines.push({ label: 'You log', value: logging, step: 'record' });
  // No Target row: goals and progress are worked out after the fact, apart from setup (decided 2026-11-26). A preset's own
  // target (Caffeine at most 4) still applies; the Target screen stays in the code for when goals are reworked. // what makes a good day: where progress is measured from

  // What it shows: the numbers it works out, and the small things shown beside your entries.
  const hasLatest = draft.measures.some((m) => m.calc.op === 'latest');
  const shows: string[] = a.combos.map((c) => c.name);
  if (hasLatest && a.extras.average) shows.push('3-day average');
  const hasNumbers = draft.fields.some((f) => f.type !== 'text');
  if (a.record === 'numbers' && hasNumbers && a.extras.previous) shows.push('previous numbers');
  if ((a.record === 'numbers' && hasNumbers) || a.combos.length > 0 || hasLatest) lines.push({ label: 'It shows', value: shows.length ? cap(shows.join(' · ')) : 'Nothing extra', step: 'shows' });

  // Tools.
  const tools: string[] = [];
  const into = (id: string | undefined): string => (id ? ` into ${draft.fields.find((f) => f.id === id)?.name ?? 'a field'}` : '');
  if (a.extras.timer) tools.push(`stopwatch${into(draft.tools.timerInto)}`);
  if (a.extras.countdown) tools.push(`countdown${into(draft.tools.countdownInto)}`);
  if (draft.tools.gps) tools.push('record runs with GPS');
  if (draft.tools.stock) tools.push('count what is left');
  if (draft.tools.photos) tools.push('photos');
  if (draft.tools.clock) tools.push(`clock for ${spanPair(draft)?.measure.name.toLowerCase() ?? 'the times'}`);
  lines.push({ label: 'Tools', value: tools.length ? cap(tools.join(', ')) : 'None', step: 'tools' });

  // Bring in: where numbers can come from besides typing them (the phone, Health Connect, another app's export).
  const bring = bringOptions(draft);
  if (bring.any) {
    const on: string[] = [];
    if (bring.steps && a.extras.auto) on.push('steps from your phone');
    if (bring.health && a.extras.health) on.push(`${HEALTH_LABEL[bring.health]} from Health Connect`);
    lines.push({ label: 'Bring in', value: on.length ? cap(on.join(', ')) : 'Off', step: 'bring' });
  }

  // Past days (and units, where the tracker has numbers with units): named for what is in it, and it says how things are set.
  const hasUnits = draft.fields.some((f) => f.unitKind);
  const state = a.extras.lockPast ? 'Locked' : 'Editable';
  // The units it uses, by name: lb, kg, mi, km.
  const unitsSaid = hasUnits ? `, ${[...new Set(draft.fields.filter((f) => f.unitKind).map((f) => fieldUnit(f, settings)))].join(', ')}` : '';
  lines.push({ label: hasUnits ? 'Past days and units' : 'Past days', value: `${state}${unitsSaid}`, step: 'options' });
  return lines;
}

export function previewText(a: Answers, settings: Settings): string {
  const parts: string[] = [];
  if (a.record === 'done') parts.push('done or not');
  else if (a.record === 'count') parts.push('tap +1');
  else parts.push([...CHIPS.filter((c) => a.chips.includes(c.id)).map((c) => c.name.toLowerCase()), ...a.custom.map((f) => f.name.toLowerCase())].join(' · ') || 'pick what you record');
  if (a.record === 'numbers' && a.log === 'plan') parts.push(a.rotation.length >= 2 ? 'plan, choosing each time' : a.schedule.kind === 'blocks' ? `plan, blocks of ${a.schedule.n} days` : `plan ${daysLabel(weekdaysOf(a.schedule))}`);
  return parts.join(' · ');
}

// Which screens this person sees, in order. Simple trackers skip most of them.
export type StepKey = 'start' | 'record' | 'target' | 'shows' | 'tools' | 'bring' | 'options' | 'summary';
// A starting point already answers what is recorded and how, so it goes straight to the summary: start, summary. Building
// your own is three screens: start, one screen for the name and what is entered, summary. Everything else (days, goals,
// extras) is one tap from the summary, where it has a sensible default. Editing opens on the summary.
export function stepsFor(a: Answers, editing: boolean): StepKey[] {
  if (editing) return ['summary'];
  if (a.templateId) return ['start', 'summary'];
  return ['start', 'record', 'summary'];
}
