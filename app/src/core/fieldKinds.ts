// What a number can measure, for the "Measures" setting on any number. Four kinds follow the person's units (weight,
// distance, height or length, liquid volume); the rest carry a fixed label. Pure rules, kept apart from the screen.

import type { Field, UnitKind } from './types';

const LB = 0.45359237;

export const KINDS: { kind: UnitKind; label: string }[] = [
  { kind: 'weight', label: 'Weight' }, { kind: 'distance', label: 'Distance' }, { kind: 'length', label: 'Height or length' }, { kind: 'volume', label: 'Liquid volume' },
];
const KIND_DEFAULTS: Record<UnitKind, Partial<Field>> = {
  weight: { default: 45 * LB }, distance: { step: 0.5, default: 5 }, length: { step: 1, default: 0 }, volume: { step: 1, default: 0 },
};
export const FIXED: Record<string, { label: string; unit: string; step: number; default: number }> = {
  min: { label: 'Minutes', unit: 'min', step: 5, default: 25 },
  h: { label: 'Hours', unit: 'h', step: 0.5, default: 1 },
  kcal: { label: 'Calories', unit: 'kcal', step: 50, default: 500 },
  g: { label: 'Grams', unit: 'g', step: 5, default: 30 },
  money: { label: 'Money', unit: '$', step: 5, default: 10 },
};


// What a number measures, as a key for the dropdown.
export function measuresKey(f: Field, own: boolean): string {
  if (f.unitKind) return f.unitKind;
  const fixed = Object.entries(FIXED).find(([, v]) => v.unit === f.unit);
  if (fixed) return fixed[0];
  return own || f.unit ? 'own' : 'none';
}


export function applyMeasure(f: Field, key: string): Field {
  const { unitKind: _k, unit: _u, unitOverride: _o, step: _s, default: _d, ...base } = f;
  if (key === 'none') return { ...base, step: 1, default: 0 };
  if (key === 'own') return { ...base, unit: f.unit ?? '', step: 1, default: 0 };
  if (FIXED[key]) return { ...base, unit: FIXED[key].unit, step: FIXED[key].step, default: FIXED[key].default };
  const kind = key as UnitKind;
  return { ...base, unitKind: kind, ...KIND_DEFAULTS[kind], ...(base.reading === undefined && (kind === 'weight' || kind === 'length') ? { reading: true } : {}) };
}

