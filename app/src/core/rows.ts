// What a set row holds after you change it. Ticking done fills any empty numbers from last time, and only from last time (the faint values you can see in the
// boxes; with nothing to show, a ticked set stays empty rather than getting zeros or a copy of another set), and remembers which ones it filled in; unticking takes those back, so the faint "last time" values
// show again, and anything you typed yourself stays. Pure, so it can be tested without the store.

import type { Entry, Field } from './types';

export interface RowResult {
  values: Entry['values'];
  done: boolean;
  auto: string[]; // the numbers the tick filled in and you have not touched since
}

export function applyRow(
  existing: Entry | undefined,
  patch: { values?: Entry['values']; done?: boolean },
  ctx: { fields: Field[]; prev: Entry | null },
): RowResult {
  const values: Entry['values'] = { ...(existing?.values ?? {}), ...(patch.values ?? {}) };
  let auto = (existing?.auto ?? []).filter((id) => !(patch.values && id in patch.values)); // typing a number makes it yours
  const done = patch.done ?? existing?.done ?? false;

  if (patch.done === true) {
    for (const f of ctx.fields) {
      if (values[f.id] !== undefined && values[f.id] !== '') continue;
      const fill = ctx.prev ? ctx.prev.values[f.id] : undefined;
      if (fill === undefined || fill === '') continue;
      values[f.id] = fill;
      auto = [...auto.filter((id) => id !== f.id), f.id];
    }
  }

  if (patch.done === false) {
    for (const id of auto) delete values[id];
    auto = [];
  }
  return { values, done, auto };
}
