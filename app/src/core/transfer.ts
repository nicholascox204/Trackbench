// Plain-text transfer. Three things:
//  1. readable data export (for an AI to review),
//  2. a machine-readable backup that merges back in (import data),
//  3. a tracker's structure as validated JSON (export and import structure),
//     which an AI can edit and which doubles as the sharing format.

import { iconFromEmoji } from './icons';
import { canTimerFill } from './duration';
import { dayKeyOf, emptyPlanDays, isRowSlot, planFor, stripRest, versionFor, WEEKDAYS } from './plan';
import { computeDay } from './measures';
import { entriesOnDay } from './derive';
import { normalizeSchedule } from './schedule';
import { addDays, startOfDay } from './time';
import { fieldUnit, formatMeasure, formatNumber, round2, toDisplay, formatFieldValue } from './units';
import type { AppState, Entry, Field, PlanDay, Schedule, ScheduleWindow, Settings, Tracker, TrackerDraft } from './types';
import { plural, termsOf } from './terms';

const INPUTS = ['check', 'tap', 'form', 'plan'];
const OPS = ['done', 'count', 'sum', 'max', 'latest', 'sumProduct', 'sumExpr', 'ratio', 'completion'];
const MODES = ['logged', 'plan', 'target', 'targets', 'clean'];

// ---------- structure ----------

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const dayKey = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

// A schedule from outside: only a well-formed one comes in. Anything else is reported.
function readSchedule(x: unknown): Schedule | null {
  if (!isObj(x)) return null;
  switch (x.kind) {
    case 'daily': return { kind: 'daily' };
    case 'weekdays': return Array.isArray(x.days) && x.days.every((d) => num(d) && d >= 0 && d <= 6) ? normalizeSchedule({ kind: 'weekdays', days: x.days as number[] }) : null;
    case 'interval': return num(x.n) && x.n >= 1 && dayKey(x.from) ? { kind: 'interval', n: Math.round(x.n), from: x.from } : null;
    case 'times': return num(x.n) && x.n >= 1 && (x.per === 'week' || x.per === 'month') ? { kind: 'times', n: Math.round(x.n), per: x.per } : null;
    case 'monthly': return x.day === 'last' || (num(x.day) && x.day >= 1 && x.day <= 31) ? { kind: 'monthly', day: x.day === 'last' ? 'last' : Math.round(x.day as number) } : null;
    case 'blocks': return num(x.n) ? normalizeSchedule({ kind: 'blocks', n: x.n }) : null;
    case 'whenever': return { kind: 'whenever' };
    default: return null;
  }
}

function readWindow(x: unknown): ScheduleWindow | undefined {
  if (!isObj(x)) return undefined;
  const w: ScheduleWindow = {};
  if (dayKey(x.from)) w.from = x.from;
  if (dayKey(x.until)) w.until = x.until;
  return w.from || w.until ? w : undefined;
}

export function exportStructure(t: Tracker): string {
  const v = t.plan.length > 0 ? t.plan.reduce((a, b) => (b.from > a.from ? b : a)) : null;
  const payload = {
    format: 'tracker-structure',
    version: 1,
    tracker: {
      name: t.name,
      icon: t.icon,
      presetId: t.presetId,
      input: t.input,
      fields: t.fields,
      measures: t.measures,
      primaryMeasure: t.primaryMeasure,
      targets: t.targets,
      derived: t.derived,
      success: t.success,
      tools: t.tools,
      terms: t.terms,
      avoid: t.avoid,
      streak: t.streak,
      daily: t.daily,
      schedule: t.schedule,
      window: t.window,
      planStyle: t.planStyle,
      planSame: v?.same === true,
      planRotation: v?.rotation === true,
      plan: v ? v.days : null,
    },
  };
  return [
    '# TRACKER STRUCTURE (v1)',
    '# Edit the JSON below (for example with an AI), then import it with Add tracker > Import structure.',
    '# Numbers in fields with a unit kind (weight, distance, length, volume) are in base units: kg, km, cm, ml.',
    JSON.stringify(payload, null, 2),
  ].join('\n');
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function jsonFrom(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON found. Paste the whole structure text.');
  return JSON.parse(text.slice(start, end + 1));
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function parseStructure(text: string): ParseResult<TrackerDraft> {
  let raw: unknown;
  try {
    raw = jsonFrom(text);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  const errors: string[] = [];
  if (!isObj(raw) || raw.format !== 'tracker-structure') errors.push('Not a tracker structure (missing format).');
  const t = isObj(raw) && isObj(raw.tracker) ? raw.tracker : null;
  if (!t) return { ok: false, errors: [...errors, 'Missing tracker.'] };

  if (typeof t.name !== 'string' || !t.name.trim()) errors.push('name must be text.');
  if (!INPUTS.includes(String(t.input))) errors.push(`input must be one of ${INPUTS.join(', ')}.`);

  const fields = Array.isArray(t.fields) ? t.fields : [];
  fields.forEach((f, i) => {
    if (!isObj(f) || typeof f.id !== 'string' || typeof f.name !== 'string') errors.push(`fields[${i}] needs id and name.`);
    else if (!['number', 'text', 'rating', 'choice', 'time', 'duration'].includes(String(f.type))) errors.push(`fields[${i}].type must be number, text, rating, choice, time or duration.`);
  });
  const fieldIds = new Set(fields.filter(isObj).map((f) => String(f.id)));

  const measures = Array.isArray(t.measures) ? t.measures : [];
  const measureIds = new Set<string>(['done', 'count', 'completion']);
  measures.forEach((m, i) => {
    if (!isObj(m) || typeof m.id !== 'string' || typeof m.name !== 'string' || !isObj(m.calc)) {
      errors.push(`measures[${i}] needs id, name and calc.`);
      return;
    }
    measureIds.add(m.id);
    if (!OPS.includes(String(m.calc.op))) errors.push(`measures[${i}].calc.op is unknown.`);
    for (const key of ['field', 'a', 'b']) {
      const ref = (m.calc as Record<string, unknown>)[key];
      if (typeof ref === 'string' && !fieldIds.has(ref)) errors.push(`measures[${i}] refers to unknown field "${ref}".`);
    }
  });

  const targets = Array.isArray(t.targets) ? t.targets : [];
  targets.forEach((x, i) => {
    if (!isObj(x) || typeof x.id !== 'string' || typeof x.measure !== 'string' || !measureIds.has(x.measure))
      errors.push(`targets[${i}] needs id and a known measure.`);
  });
  const derived = Array.isArray(t.derived) ? t.derived : [];
  derived.forEach((x, i) => {
    if (!isObj(x) || typeof x.id !== 'string' || typeof x.measure !== 'string' || typeof x.days !== 'number')
      errors.push(`derived[${i}] needs id, measure and days.`);
  });

  if (!isObj(t.success) || !MODES.includes(String(t.success.mode))) errors.push('success.mode must be logged, plan, target or targets.');

  let planDays: PlanDay[] | null = null;
  if (t.plan !== null && t.plan !== undefined) {
    const turns = t.planRotation === true; // lists taken in turn: two to seven lists, not tied to weekdays
    if (!Array.isArray(t.plan) || (turns ? t.plan.length < 2 || t.plan.length > 7 : t.plan.length !== 7)) errors.push(turns ? 'a rotation needs 2 to 7 lists.' : 'plan must have 7 days (Sunday to Saturday) or be null.');
    else {
      t.plan.forEach((d, i) => {
        if (!isObj(d) || !Array.isArray(d.slots)) errors.push(`plan[${i}] needs slots.`);
        else
          d.slots.forEach((s, j) => {
            if (!isObj(s) || typeof s.id !== 'string' || typeof s.name !== 'string') errors.push(`plan[${i}].slots[${j}] needs id and name.`);
          });
      });
      planDays = stripRest(t.plan as PlanDay[]);
    }
  }
  if (t.input === 'plan' && !planDays) errors.push('A planned tracker needs a plan.');
  if (t.schedule !== undefined && t.schedule !== null && !readSchedule(t.schedule)) errors.push('schedule is not valid.');
  if (errors.length > 0) return { ok: false, errors };

  const tools = isObj(t.tools) ? t.tools : {};
  const draft: TrackerDraft = {
    name: String(t.name).trim(),
    icon: typeof t.icon === 'string' ? t.icon : iconFromEmoji(typeof t.emoji === 'string' ? t.emoji : undefined),
    presetId: typeof t.presetId === 'string' ? t.presetId : 'imported',
    input: t.input as TrackerDraft['input'],
    fields: fields as Field[],
    measures: measures as TrackerDraft['measures'],
    primaryMeasure: typeof t.primaryMeasure === 'string' ? t.primaryMeasure : 'done',
    targets: targets as TrackerDraft['targets'],
    derived: derived as TrackerDraft['derived'],
    success: t.success as TrackerDraft['success'],
    plan: planDays ? [{ from: dayKeyOf(Date.now()), days: planDays, ...(t.planSame === true ? { same: true } : {}), ...(t.planRotation === true ? { rotation: true } : {}) }] : [],
    tools: { previous: tools.previous !== false, lockPast: tools.lockPast === true, ...(tools.countdown === true ? { countdown: true } : {}), ...(tools.timer === true ? { timer: true } : {}), ...(tools.countdown === true && typeof tools.countdownInto === 'string' && fields.some((f) => f.id === tools.countdownInto && canTimerFill(f as Field)) ? { countdownInto: tools.countdownInto } : {}), ...(tools.timer === true && typeof tools.timerInto === 'string' && fields.some((f) => f.id === tools.timerInto && canTimerFill(f as Field)) ? { timerInto: tools.timerInto } : {}), ...(tools.gps === true ? { gps: true } : {}), ...(tools.clock === true ? { clock: true } : {}) },
  };
  const schedule = readSchedule(t.schedule);
  if (schedule) draft.schedule = schedule;
  const window = readWindow(t.window);
  if (window) draft.window = window;
  if (t.planStyle === 'sets' || t.planStyle === 'items') draft.planStyle = t.planStyle;
  if (t.avoid === true) draft.avoid = true;
  if (t.streak === false) draft.streak = false;
  if (t.daily === true) draft.daily = true;
  if (isObj(t.terms)) {
    const terms: Record<string, string> = {};
    for (const k of ['item', 'row', 'target']) if (typeof t.terms[k] === 'string' && String(t.terms[k]).trim()) terms[k] = String(t.terms[k]).trim().slice(0, 24);
    if (Object.keys(terms).length > 0) draft.terms = terms;
  }
  return { ok: true, value: draft };
}

// ---------- backup (machine-readable) ----------

export function exportBackup(state: AppState): string {
  const payload = {
    format: 'tracker-backup',
    version: 1,
    settings: state.settings,
    trackers: state.trackers,
    systems: state.systems,
    entries: state.entries,
  };
  return ['# TRACKER BACKUP (v1)', '# Import it with System > Data > Import backup. Entries merge by id.', JSON.stringify(payload)].join('\n');
}

export interface Backup {
  settings?: Settings;
  trackers: Tracker[];
  systems: AppState['systems'];
  entries: Entry[];
}

export function parseBackup(text: string): ParseResult<Backup> {
  let raw: unknown;
  try {
    raw = jsonFrom(text);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  if (!isObj(raw) || raw.format !== 'tracker-backup') return { ok: false, errors: ['Not a tracker backup (missing format).'] };
  const errors: string[] = [];
  if (!Array.isArray(raw.trackers)) errors.push('trackers must be a list.');
  if (!Array.isArray(raw.entries)) errors.push('entries must be a list.');
  if (errors.length) return { ok: false, errors };
  const trackers = (raw.trackers as unknown[]).filter((t): t is Tracker => isObj(t) && typeof t.id === 'string' && typeof t.name === 'string');
  const entries = (raw.entries as unknown[]).filter(
    (e): e is Entry => isObj(e) && typeof e.id === 'string' && typeof e.trackerId === 'string' && typeof e.at === 'number',
  );
  return {
    ok: true,
    value: {
      settings: isObj(raw.settings) ? (raw.settings as unknown as Settings) : undefined,
      trackers,
      systems: Array.isArray(raw.systems) ? (raw.systems as AppState['systems']) : [],
      entries,
    },
  };
}

// ---------- readable export for an AI ----------

function fmtField(f: Field, e: Entry, settings: Settings): string {
  const v = e.values[f.id];
  if (v === undefined || v === '') return '';
  return formatFieldValue(f, v, settings);
}

export function exportReadable(state: AppState, trackerIds: string[] | null, daysBack = 14, now = Date.now()): string {
  const { settings } = state;
  const today = startOfDay(now);
  const lines: string[] = [
    '# TRACKER DATA EXPORT',
    `# Generated: ${dayKeyOf(now)}`,
    `# Range: last ${daysBack} days`,
    `# Unit system: ${settings.units}`,
    '# Plain text for review. Use Export structure to get an editable version of a tracker.',
    '',
  ];
  const trackers = state.trackers.filter((t) => !trackerIds || trackerIds.includes(t.id));
  for (const t of trackers) {
    const entries = state.entries.filter((e) => e.trackerId === t.id);
    lines.push(`## ${t.name} (${t.input === 'plan' ? 'planned' : t.input})`);
    lines.push(
      `Fields: ${t.fields.map((f) => `${f.name}${fieldUnit(f, settings) ? ' (' + fieldUnit(f, settings) + ')' : ''}`).join(', ') || 'none'}`,
    );
    for (const tg of t.targets) {
      const m = t.measures.find((x) => x.id === tg.measure);
      const name = m?.name ?? tg.measure;
      const val = (n: number) => (m ? formatMeasure(t, m, n, settings) : String(n));
      lines.push(`Target: ${name} ${tg.min !== undefined ? 'at least ' + val(tg.min) : ''}${tg.max !== undefined ? 'at most ' + val(tg.max) : ''}`);
    }
    lines.push('');
    for (let i = daysBack - 1; i >= 0; i--) {
      const day = addDays(today, -i);
      const des = entriesOnDay(entries, t.id, day);
      const pd = planFor(t, day);
      const head = `${dayKeyOf(day)} ${WEEKDAYS[new Date(day).getDay()].slice(0, 3)}${pd?.label ? ' - ' + pd.label : ''}`;
      if (des.length === 0 && !(t.input === 'plan' && pd && pd.slots.length > 0)) continue;
      lines.push(head);
      if (t.input === 'plan' && pd) {
        for (const s of pd.slots) {
          const mine = des.filter((e) => e.slotId === s.id);
          if (isRowSlot(s)) {
            lines.push(`  ${s.name} (${s.sets} ${plural(termsOf(t).row.toLowerCase(), s.sets as number)}${s.range ? ', ' + s.range : ''})`);
            for (let r = 0; r < (s.sets as number); r++) {
              const e = mine.find((x) => x.row === r);
              const body = e ? t.fields.map((f) => fmtField(f, e, settings)).filter(Boolean).join(' x ') : '-';
              lines.push(`    ${termsOf(t).row} ${r + 1}: ${body || '-'} ${e?.done ? 'done' : 'not done'}`);
            }
          } else {
            const e = mine[0];
            const label = e && e.variant !== undefined && s.variants?.[e.variant] ? ` [${s.variants[e.variant].label}]` : '';
            lines.push(`  ${e?.done ? 'done' : 'not done'}  ${s.group ? s.group + ': ' : ''}${s.name}${label}`);
          }
        }
      } else {
        for (const e of des.filter((x) => x.done)) {
          lines.push(`  ${t.fields.map((f) => fmtField(f, e, settings)).filter(Boolean).join(' | ') || 'done'}`);
        }
      }
      const measures = computeDay(t, des, pd);
      const shown = t.measures
        .filter((m) => m.calc.op !== 'completion')
        .map((m) => `${m.name} ${formatMeasure(t, m, measures[m.id] ?? 0, settings)}`);
      if (t.input === 'plan') shown.push(`completion ${measures.completion}%`);
      if (shown.length) lines.push(`  Totals: ${shown.join(', ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export { emptyPlanDays, versionFor };
