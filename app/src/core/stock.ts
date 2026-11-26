// What is left of something you tick off from a list (pills, vitamins, pet food): you count it once, each tick after that takes
// one away, and it says when it is running low. Counting again (after a refill) starts from the new number.

import type { Entry, Slot } from './types';

export const LOW = 7; // at or under this many left, it says to refill

export function stockLeft(slot: Slot, entries: Entry[]): number | undefined {
  if (!slot.stock) return undefined;
  const used = entries.filter((e) => e.slotId === slot.id && e.row === undefined && e.done && e.at >= slot.stock!.at).length;
  return Math.max(0, slot.stock.count - used);
}

export function stockText(left: number | undefined): { text: string; low: boolean } | undefined {
  if (left === undefined) return undefined;
  if (left === 0) return { text: 'none left, refill', low: true };
  return left <= LOW ? { text: `${left} left, refill soon`, low: true } : { text: `${left} left`, low: false };
}
