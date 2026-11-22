// What a planned tracker calls things. The defaults are neutral (Item, Round, Target); a starting point or the
// person can reword them to fit what they track, like Exercise, Set and Range for lifting
// (see "Change the wording" on a row). Everything that names a repeat, an entry or a target reads from here.

import type { Terms, Tracker } from './types';

export const DEFAULT_TERMS: Required<Terms> = { item: 'Item', row: 'Round', target: 'Target' };
// One wording a starting point can choose. Trackers saved before the defaults went neutral keep it.
export const SETS_TERMS: Required<Terms> = { item: 'Exercise', row: 'Set', target: 'Range' };
export const termsOf = (t: Tracker): Required<Terms> => ({ ...DEFAULT_TERMS, ...(t.terms ?? {}) });
export const plural = (word: string, n: number): string => (n === 1 || /s$/i.test(word) ? word : `${word}s`);
