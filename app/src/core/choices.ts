// Choosing more than one option from a list. A pick is stored as the options joined by "|" so an entry still holds one
// string per field; these keep that in one place.

export const SEP = '|';

export const picksOf = (v: unknown): string[] => String(v ?? '').split(SEP).map((x) => x.trim()).filter(Boolean);

export const joinPicks = (picks: string[]): string => picks.join(SEP);

export const togglePick = (current: unknown, option: string): string => {
  const list = picksOf(current);
  return joinPicks(list.includes(option) ? list.filter((x) => x !== option) : [...list, option]);
};

// Options may not contain the separator.
export const cleanOption = (o: string): string => o.split(SEP).join(' ').trim();

export const showPicks = (v: unknown): string => picksOf(v).join(', ');

// Does a stored value include this option (or equal it, for a single choice)?
export const hasPick = (v: unknown, option: string, multi: boolean | undefined): boolean => {
  const want = option.trim().toLowerCase();
  if (!multi) return String(v ?? '').trim().toLowerCase() === want;
  return picksOf(v).some((x) => x.toLowerCase() === want);
};
