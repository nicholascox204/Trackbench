// The tracker whose notification was just tapped. A tap opens that tracker, even if the opening rule would have chosen another
// (the rule still decides when you open the app from its icon). Kept apart from the notification library so it is plain and testable.

let pending: string | null = null;
const listeners = new Set<() => void>();

export const setTapTarget = (id: string | null | undefined): void => {
  if (!id) return;
  pending = id;
  listeners.forEach((l) => l());
};
export const peekTapTarget = (): string | null => pending;
export const takeTapTarget = (): string | null => { const p = pending; pending = null; return p; };
export const subscribeTap = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
