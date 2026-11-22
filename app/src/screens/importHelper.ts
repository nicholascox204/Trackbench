import { saveSetup } from '../core/store';
import type { TrackerDraft } from '../core/types';

// Adds a tracker from an imported structure (already validated) and returns its id.
export function addTrackerDraftFromImport(draft: TrackerDraft, inSystem: boolean): string {
  return saveSetup(draft, inSystem);
}
