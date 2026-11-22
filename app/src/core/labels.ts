// Naming each entry: a text field flagged `label` holds what an entry was (an exercise, a purchase, a subject). Past
// values come back as suggestions, most used first, so naming is one tap after the first time.

import type { Entry, Field, Tracker } from './types';

export function labelField(t: Pick<Tracker, 'fields'>): Field | undefined {
  return t.fields.find((f) => f.label);
}

export function labelSuggestions(entries: Entry[], trackerId: string, fieldId: string, limit = 6): string[] {
  const count = new Map<string, { n: number; last: number; text: string }>();
  for (const e of entries) {
    if (e.trackerId !== trackerId || !e.done) continue;
    const v = e.values[fieldId];
    if (typeof v !== 'string' || !v.trim()) continue;
    const key = v.trim().toLowerCase();
    const cur = count.get(key);
    if (cur) { cur.n++; if (e.at >= cur.last) { cur.last = e.at; cur.text = v.trim(); } } else count.set(key, { n: 1, last: e.at, text: v.trim() });
  }
  return [...count.values()].sort((a, b) => b.n - a.n || b.last - a.last).slice(0, limit).map((x) => x.text);
}
