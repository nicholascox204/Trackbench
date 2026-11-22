// Usernames ("handles"): what makes them valid, the sentence for each way they can be wrong, and a first suggestion from a name.
// The cloud holds the same rule (docs/supabase-schema.sql), so a handle that passes here is accepted there.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

// Words that would read as the app or its staff.
const RESERVED = new Set(['admin', 'administrator', 'trackbench', 'support', 'help', 'official', 'staff', 'team', 'root', 'system', 'api', 'null', 'undefined', 'me', 'you']);

export type HandleCheck = 'ok' | 'short' | 'long' | 'chars' | 'reserved';

// What is typed becomes lowercase without a leading @ or spaces.
export const normalizeHandle = (s: string): string => s.trim().toLowerCase().replace(/^@/, '').replace(/\s+/g, '');

export function checkHandle(raw: string): HandleCheck {
  const h = normalizeHandle(raw);
  if (!/^[a-z0-9_]*$/.test(h)) return 'chars';
  if (h.length < HANDLE_MIN) return 'short';
  if (h.length > HANDLE_MAX) return 'long';
  if (RESERVED.has(h)) return 'reserved';
  return 'ok';
}

export function handleProblem(c: HandleCheck): string {
  switch (c) {
    case 'short': return `Use at least ${HANDLE_MIN} characters.`;
    case 'long': return `Use at most ${HANDLE_MAX} characters.`;
    case 'chars': return 'Use only letters, numbers and underscores.';
    case 'reserved': return 'That name is kept for Trackbench.';
    default: return '';
  }
}

// A first guess from someone's name (or, failing that, the start of their email): plain lowercase letters and numbers.
export function suggestHandle(name: string, email?: string): string {
  const plain = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let h = plain(name) || plain((email ?? '').split('@')[0]) || 'tracker';
  if (h.length < HANDLE_MIN) h = (h + '123').slice(0, HANDLE_MIN);
  h = h.slice(0, HANDLE_MAX);
  return RESERVED.has(h) ? `${h.slice(0, HANDLE_MAX - 1)}1` : h;
}

// The next one to try when a handle is taken: the same name with a number on the end.
export function nextHandle(h: string, n: number): string {
  const tail = String(n);
  return h.slice(0, HANDLE_MAX - tail.length) + tail;
}
