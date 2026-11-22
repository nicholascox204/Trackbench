// Which field of a tracker a phone source can fill: a number called Steps (the Steps preset, or one made by hand).
import type { Field } from './types';

export const stepsFieldIn = (fields: Field[]): Field | undefined =>
  fields.find((f) => f.type === 'number' && (f.id === 'steps' || f.name.trim().toLowerCase() === 'steps'));
