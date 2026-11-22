// Typing a new total on a counter. The total is made of entries, so setting it means adding to them or taking from the
// newest ones, which keeps the history honest (what was tapped last is what comes off first).
import type { Entry } from './types';

export type TotalChange = {
  remove: string[]; // entries to delete
  shrink: { id: string; n: number }[]; // an entry that stays but holds less
  add: number[]; // amounts for new entries (for a plain count, one 1 per step)
};

// `entries` are the day's logged entries, oldest first. `amounts` is true when each entry holds its own amount (a counter
// with a step or unit), false for a plain count where every entry is one.
export function changeTotal(entries: Entry[], target: number, amounts: boolean): TotalChange {
  const weight = (e: Entry): number => (amounts ? (typeof e.values.n === 'number' ? e.values.n : 0) : 1);
  const goal = Math.max(0, target);
  const current = entries.reduce((sum, e) => sum + weight(e), 0);
  const out: TotalChange = { remove: [], shrink: [], add: [] };
  const diff = Math.round((goal - current) * 1e6) / 1e6;
  if (diff > 0) {
    if (amounts) out.add.push(diff);
    else for (let i = 0; i < Math.floor(diff); i++) out.add.push(1);
    return out;
  }
  let excess = -diff;
  for (let i = entries.length - 1; i >= 0 && excess > 1e-9; i--) {
    const w = weight(entries[i]);
    if (w <= excess + 1e-9) { out.remove.push(entries[i].id); excess = Math.round((excess - w) * 1e6) / 1e6; }
    else { out.shrink.push({ id: entries[i].id, n: Math.round((w - excess) * 1e6) / 1e6 }); excess = 0; }
  }
  return out;
}
