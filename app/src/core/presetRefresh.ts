// For trying out preset changes: rebuild a tracker that came from a template using the template as it is now. The tracker keeps its
// name, icon, entries, list, goals and sources; everything the template decides (fields, measures, tools, wording, days) is replaced.
import { draftFromAnswers } from './setup';
import { TEMPLATES } from './templates';
import type { Settings, Tracker } from './types';

export function refreshPatch(t: Tracker, settings: Settings): Partial<Tracker> | null {
  const tpl = t.templateId ? TEMPLATES.find((x) => x.id === t.templateId) : undefined;
  if (!tpl) return null;
  const draft = draftFromAnswers({ ...tpl.make(), name: t.name, icon: t.icon }, settings, t);
  // keys a template may no longer set are cleared, not left as they were
  return { avoid: undefined, streak: undefined, daily: undefined, terms: undefined, planStyle: undefined, window: undefined, ...draft };
}
