// Bringing workout history in from Strong or Hevy (both export a CSV file of every set). Each set becomes a done set on this
// tracker, on the day it was lifted, under the exercise with the same name. Exercises not in the plan keep their history under a
// name-based id, which a new exercise of the same name picks up when it is added (see importSlotId).

import type { Entry, Slot, Tracker } from './types';

export interface LiftSet { at: number; exercise: string; set: number; weight?: number; reps?: number; warm?: boolean; kind?: 'D' | 'F' } // weight in kg
export interface LiftFile { app: 'Strong' | 'Hevy'; sets: LiftSet[]; unit: 'kg' | 'lb' | 'unknown' }

// A small CSV reader: commas or semicolons, quoted fields with "" inside.
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "2026-11-26 07:00:00" (Strong) or "26 Nov 2026, 07:00" (Hevy), as local time.
export function parseWhen(s: string): number | undefined {
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5]).getTime();
  const h = s.match(/(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}),? (\d{1,2}):(\d{2})/);
  if (h) {
    const m = MONTHS.indexOf(h[2].toLowerCase());
    if (m >= 0) return new Date(+h[3], m, +h[1], +h[4], +h[5]).getTime();
  }
  const d = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return d ? new Date(+d[1], +d[2] - 1, +d[3], 12).getTime() : undefined;
}

const LB = 0.45359237;

// Reads either app's export. `assume` is the unit to use when the file does not say (older Strong exports).
export function readLiftFile(text: string, assume: 'kg' | 'lb' = 'kg'): LiftFile | undefined {
  const rows = parseCsv(text);
  if (rows.length < 2) return undefined;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const hevy = head.includes('exercise_title');
  const iWhen = hevy ? col('start_time') : col('date');
  const iEx = hevy ? col('exercise_title') : col('exercise name');
  const iSet = hevy ? col('set_index') : col('set order');
  const iType = hevy ? col('set_type') : -1;
  const iKg = col('weight_kg', 'weight (kg)');
  const iLb = col('weight_lbs', 'weight (lbs)', 'weight (lb)');
  const iW = col('weight');
  const iReps = col('reps');
  if (iWhen < 0 || iEx < 0) return undefined;
  const unit: LiftFile['unit'] = iKg >= 0 ? 'kg' : iLb >= 0 ? 'lb' : 'unknown';
  const num = (r: string[], i: number): number | undefined => {
    if (i < 0) return undefined;
    const v = parseFloat((r[i] ?? '').replace(',', '.'));
    return isFinite(v) ? v : undefined;
  };
  const sets: LiftSet[] = [];
  for (const r of rows.slice(1)) {
    const at = parseWhen(r[iWhen] ?? '');
    const exercise = (r[iEx] ?? '').trim();
    if (at === undefined || !exercise) continue;
    const setCell = iSet >= 0 ? (r[iSet] ?? '').trim() : '';
    if (!hevy && iSet >= 0 && !setCell) continue; // Strong writes rest timers and notes as rows without a set
    const raw = iKg >= 0 ? num(r, iKg) : iLb >= 0 ? num(r, iLb) : num(r, iW);
    const inKg = iKg >= 0 || (iLb < 0 && assume === 'kg');
    const weight = raw === undefined ? undefined : Math.round((inKg ? raw : raw * LB) * 100) / 100;
    const warm = iType >= 0 ? (r[iType] ?? '').toLowerCase().includes('warm') : setCell.toUpperCase() === 'W';
    const reps = num(r, iReps);
    const type = iType >= 0 ? (r[iType] ?? '').toLowerCase() : setCell.toUpperCase();
    const kind = type.includes('drop') || type === 'D' ? 'D' : type.includes('fail') || type === 'F' ? 'F' : undefined;
    sets.push({ at, exercise, set: num(r, iSet) ?? 0, ...(weight !== undefined ? { weight } : {}), ...(reps !== undefined ? { reps } : {}), ...(warm ? { warm } : {}), ...(kind ? { kind } : {}) });
  }
  return { app: hevy ? 'Hevy' : 'Strong', sets, unit };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const importSlotId = (name: string): string => `import:${norm(name)}`;

// The tracker's own exercises by name, across every version of its plan.
function slotsByName(t: Tracker): Map<string, Slot> {
  const m = new Map<string, Slot>();
  for (const v of t.plan) for (const d of v.days) for (const s of d.slots) if (s.name && !m.has(norm(s.name))) m.set(norm(s.name), s);
  return m;
}

// The sets as entries for this tracker. Sets already there (same exercise, day and set number) are skipped, so importing the
// same file twice adds nothing. Rows are numbered from 0 per exercise per workout, in the file's order.
export function liftEntries(t: Tracker, file: LiftFile, existing: Entry[], makeId: () => string): { entries: Entry[]; matched: string[]; unmatched: string[] } {
  const byName = slotsByName(t);
  const weight = t.fields.find((f) => f.unitKind === 'weight') ?? t.fields.find((f) => /weight/i.test(f.name));
  const reps = t.fields.find((f) => f.id === 'reps') ?? t.fields.find((f) => /rep/i.test(f.name));
  const have = new Set(existing.filter((e) => e.trackerId === t.id && e.slotId).map((e) => `${e.slotId}|${new Date(e.at).toDateString()}|${e.row}`));
  const rowCount = new Map<string, number>();
  const matched = new Set<string>();
  const unmatched = new Set<string>();
  const entries: Entry[] = [];
  for (const s of file.sets) {
    const slot = byName.get(norm(s.exercise));
    (slot ? matched : unmatched).add(s.exercise);
    const slotId = slot?.id ?? importSlotId(s.exercise);
    const k = `${slotId}|${s.at}`;
    const row = rowCount.get(k) ?? 0;
    rowCount.set(k, row + 1);
    if (have.has(`${slotId}|${new Date(s.at).toDateString()}|${row}`)) continue;
    const values: Entry['values'] = {};
    if (weight && s.weight !== undefined) values[weight.id] = s.weight;
    if (reps && s.reps !== undefined) values[reps.id] = s.reps;
    if (s.warm) values.kind = 'W';
    if (s.kind) values.kind = s.kind;
    entries.push({ id: makeId(), trackerId: t.id, at: s.at, slotId, row, done: true, values });
  }
  return { entries, matched: [...matched], unmatched: [...unmatched] };
}
