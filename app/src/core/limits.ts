// What happens when a typed number goes past its limit: it becomes the limit, and the box says so (see useCue in ui/kit).
// Not a silent refusal and not a flash of the wrong number that then undoes itself.

// Whole digits typed into a box with a top limit. Anything that is not a digit is dropped; a number over the limit becomes the limit.
export function clampTyped(raw: string, max: number): { value: number | null; text: string; clamped: boolean } {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits === '') return { value: null, text: '', clamped: raw !== '' };
  const n = Number(digits);
  if (n > max) return { value: max, text: String(max), clamped: true };
  return { value: n, text: String(n), clamped: digits !== raw };
}

// A decimal typed into a box with limits: the same idea, for steppers.
export function clampNumber(n: number, min: number, max: number): { value: number; clamped: boolean } {
  const value = Math.min(max, Math.max(min, n));
  return { value, clamped: value !== n };
}

// The room a typed decimal gets: up to 6 whole digits and 2 decimals. A keystroke that would go past that is not taken (the box
// keeps what it had), so the control never grows past its row. Returns the cleaned text, or null to refuse the change.
export const MAX_WHOLE_DIGITS = 6;
export const MAX_DECIMALS = 2;
export function cleanDecimal(raw: string): string | null {
  const t = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  if ((t.match(/\./g) ?? []).length > 1) return null;
  const [whole, dec = ''] = t.split('.');
  if (whole.length > MAX_WHOLE_DIGITS || dec.length > MAX_DECIMALS) return null;
  return t;
}

// How many characters the box may hold right now: with a point, the whole digits, the point and two decimals; without one, six digits.
export function decimalRoom(text: string): number {
  const i = text.search(/[.,]/);
  return i < 0 ? MAX_WHOLE_DIGITS : i + 1 + MAX_DECIMALS;
}

// A number box opens with its number "selected" (drawn by us, not by the phone: the phone's own select-all can come back on its own).
// The first key you press replaces the number. The phone has put that key beside the old text, so it is taken out of what it reports:
// typing 7 over 45 reports 457 (or 745), and the box keeps 7. Deleting clears it. Anything else (you moved the caret first) is taken as typed.
export function firstKey(old: string, raw: string): string {
  if (raw.length < old.length) return old.startsWith(raw) || old.endsWith(raw) ? '' : raw; // a shorter text is a delete, unless the phone already swapped in the new key
  if (raw.length === old.length) return raw;
  if (raw.startsWith(old)) return raw.slice(old.length);
  if (raw.endsWith(old)) return raw.slice(0, raw.length - old.length);
  return raw;
}
