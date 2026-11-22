// Units: the app has a default system (imperial or metric); any field can override.
// Values with a unit kind are stored in base units, so history never changes when
// the display unit does.

import { formatDuration } from './duration';
import type { Field, Measure, Settings, Tracker, UnitKind, UnitSystem } from './types';

export const BASE_UNIT: Record<UnitKind, string> = {
  weight: 'kg', distance: 'km', length: 'cm', volume: 'ml',
};

// How many base units one of each unit is.
const FACTOR: Record<UnitKind, Record<string, number>> = {
  weight: { kg: 1, lb: 0.45359237 },
  distance: { km: 1, mi: 1.609344 },
  length: { cm: 1, in: 2.54 },
  volume: { ml: 1, 'fl oz': 29.5735295625 },
};

const DEFAULTS: Record<UnitSystem, Record<UnitKind, string>> = {
  imperial: { weight: 'lb', distance: 'mi', length: 'in', volume: 'fl oz' },
  metric: { weight: 'kg', distance: 'km', length: 'cm', volume: 'ml' },
};

const STEPS: Record<string, number> = {
  kg: 2.5, lb: 5, km: 0.5, mi: 0.5, cm: 1, in: 1, ml: 50, 'fl oz': 1,
};

// The unit a kind uses in a given system (lb, mi, in, fl oz or kg, km, cm, ml).
// Which system a region uses by default: imperial in the United States, Canada (where body weight, gym weights and height are mostly imperial), Liberia and Myanmar, metric elsewhere. With no
// region to go on (a bare language), imperial, which is what the app used before.
export function unitsForLocale(locale: string | undefined): UnitSystem {
  const region = (locale ?? '').split(/[-_]/)[1]?.toUpperCase();
  if (!region) return 'imperial';
  return ['US', 'LR', 'MM', 'CA'].includes(region) ? 'imperial' : 'metric';
}

export function detectUnits(): UnitSystem {
  try {
    return unitsForLocale(new Intl.NumberFormat().resolvedOptions().locale);
  } catch {
    return 'imperial';
  }
}

export function unitForSystem(kind: UnitKind, system: UnitSystem): string {
  return DEFAULTS[system][kind];
}

export function unitOptions(kind: UnitKind): string[] {
  return Object.keys(FACTOR[kind]);
}

export function systemDefaultUnit(kind: UnitKind, settings: Settings): string {
  return DEFAULTS[settings.units][kind];
}

export function fieldUnit(field: Field, settings: Settings): string | undefined {
  if (field.unitKind) {
    const o = field.unitOverride;
    return o && FACTOR[field.unitKind][o] ? o : DEFAULTS[settings.units][field.unitKind];
  }
  return field.unit;
}

export function toDisplay(field: Field, base: number, settings: Settings): number {
  if (!field.unitKind) return base;
  const u = fieldUnit(field, settings);
  const f = u ? FACTOR[field.unitKind][u] : 1;
  return base / (f || 1);
}

export function fromDisplay(field: Field, shown: number, settings: Settings): number {
  if (!field.unitKind) return shown;
  const u = fieldUnit(field, settings);
  const f = u ? FACTOR[field.unitKind][u] : 1;
  return shown * (f || 1);
}

export function defaultStep(field: Field, settings: Settings): number {
  if (field.step !== undefined) return field.step;
  const u = fieldUnit(field, settings);
  return (u && STEPS[u]) || 1;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---- measures follow the unit of the field they are built from ----

export function measureField(t: Tracker, m: Measure): Field | undefined {
  if (m.calc.op === 'ratio' || (m.calc.op === 'sumExpr' && m.calc.fn === 'span')) return undefined; // worked out, not a field's own unit
  const id =
    m.unitFrom ??
    ('field' in m.calc ? m.calc.field : 'a' in m.calc ? m.calc.a : undefined);
  return id ? t.fields.find((f) => f.id === id) : undefined;
}

// What a worked-out number is measured in. Hours between two times; for a ratio, the unit of the top over the unit of the bottom.
const unitOf = (f: Field | undefined, settings: Settings): string | undefined => (f?.unitKind ? fieldUnit(f, settings) : f?.unit);
const factorOf = (f: Field | undefined, settings: Settings): number => (f?.unitKind ? toDisplay(f, 1, settings) : 1);

export function measureUnit(t: Tracker, m: Measure, settings: Settings): string | undefined {
  if (m.calc.op === 'sumExpr' && m.calc.fn === 'span') return 'h';
  if (m.calc.op === 'ratio') {
    const ua = unitOf(t.fields.find((x) => x.id === (m.calc as { a: string }).a), settings);
    const ub = unitOf(t.fields.find((x) => x.id === (m.calc as { b: string }).b), settings);
    return ua && ub ? `${ua}/${ub}` : ua ?? (ub ? `per ${ub}` : undefined);
  }
  const f = measureField(t, m);
  if (f?.unitKind) return fieldUnit(f, settings);
  return m.unit ?? f?.unit;
}

export function measureToDisplay(t: Tracker, m: Measure, base: number, settings: Settings): number {
  if (m.calc.op === 'ratio') {
    const fa = t.fields.find((x) => x.id === (m.calc as { a: string }).a);
    const fb = t.fields.find((x) => x.id === (m.calc as { b: string }).b);
    return (base * factorOf(fa, settings)) / factorOf(fb, settings); // minutes per kilometre shown as minutes per mile
  }
  const f = measureField(t, m);
  return f ? toDisplay(f, base, settings) : base;
}

export function measureFromDisplay(t: Tracker, m: Measure, shown: number, settings: Settings): number {
  if (m.calc.op === 'ratio') {
    const fa = t.fields.find((x) => x.id === (m.calc as { a: string }).a);
    const fb = t.fields.find((x) => x.id === (m.calc as { b: string }).b);
    return (shown * factorOf(fb, settings)) / factorOf(fa, settings);
  }
  const f = measureField(t, m);
  return f ? fromDisplay(f, shown, settings) : shown;
}

export { formatDuration } from './duration';
import { paceText } from './gpx';

export function formatTime(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// A measure value ready to show, with its unit.
export function formatMeasure(t: Tracker, m: Measure, base: number, settings: Settings): string {
  const fld = measureField(t, m);
  if (fld?.type === 'time') return formatTime(base);
  if (fld?.type === 'duration') return formatDuration(base);
  // Time over distance (a pace) reads as 8:30 per mile, the way runners say it, not as 8.5.
  if (m.calc.op === 'ratio') {
    const top = t.fields.find((x) => x.id === (m.calc as { a: string }).a);
    if (top && (top.type === 'duration' || top.unit === 'min')) {
      const per = unitOf(t.fields.find((x) => x.id === (m.calc as { b: string }).b), settings);
      return base > 0 ? `${paceText(measureToDisplay(t, m, base, settings) * 60)}${per ? ' /' + per : ''}` : '–';
    }
  }
  if (fld?.type === 'rating') return `${formatNumber(base)}/${fld.max ?? 5}`;
  const unit = measureUnit(t, m, settings);
  return `${formatNumber(measureToDisplay(t, m, base, settings))}${unit ? ' ' + unit : ''}`;
}

// A stored field value ready to read, whatever its kind.
export function formatFieldValue(f: Field, v: number | string, settings: Settings): string {
  if (f.type === 'rating') return `${formatNumber(Number(v))}/${f.max ?? 5}`;
  if (f.type === 'time') return formatTime(Number(v));
  if (f.type === 'duration') return formatDuration(Number(v));
  if (f.type === 'choice' && f.multi) return String(v).split('|').map((x) => x.trim()).filter(Boolean).join(', ');
  if (f.type === 'text' || f.type === 'choice') return String(v);
  const u = fieldUnit(f, settings);
  return `${formatNumber(round2(toDisplay(f, Number(v), settings)))}${u ? ' ' + u : ''}`;
}
