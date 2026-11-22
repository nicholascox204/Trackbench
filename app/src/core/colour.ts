// Colour maths for the look of the app: turning one chosen background into a full set of surface and text colours,
// checking contrast, and suggesting a second colour that reads well against the first. Pure functions, no UI.

export interface Hsl { h: number; s: number; l: number } // h 0-360, s and l 0-100

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function isHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

// Accepts "abc", "#abc", "aabbcc" or "#AABBCC"; returns a lowercase "#rrggbb" or null.
export function parseHex(v: string): string | null {
  let t = v.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(t)) t = t.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(t) ? `#${t}` : null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const p = (x: number) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const S = clamp(s, 0, 100) / 100, L = clamp(l, 0, 100) / 100;
  const H = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((H / 60) % 2) - 1));
  const m = L - c / 2;
  const [r, g, b] = H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x] : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

// WCAG relative luminance and contrast ratio (1 to 21).
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function isDarkColour(hex: string): boolean {
  return relativeLuminance(hex) < 0.18;
}

// Move a colour lighter or darker, keeping its hue, until it reaches the contrast asked for against a background.
// Used for text and for the highlight, so a pick that is hard to read is nudged, not refused.
export function withContrast(fg: string, bg: string, min: number): string {
  if (contrast(fg, bg) >= min) return fg;
  const hsl = hexToHsl(fg);
  const lighten = isDarkColour(bg);
  for (let i = 0; i < 100; i++) {
    hsl.l = clamp(hsl.l + (lighten ? 1 : -1), 0, 100);
    const next = hslToHex(hsl);
    if (contrast(next, bg) >= min) return next;
  }
  return lighten ? '#ffffff' : '#000000';
}

export interface Surfaces {
  bg: string; card: string; raised: string; border: string; text: string; muted: string;
  danger: string; warn: string; isDark: boolean;
}

// One chosen background becomes the whole set: cards a step off the background, a border, text that reads well,
// quieter text that still passes 4.5:1, and the status colours tuned to light or dark.
export function surfacesFromBackground(bgHex: string): Surfaces {
  const bg = parseHex(bgHex) ?? '#0f1115';
  const hsl = hexToHsl(bg);
  const dark = isDarkColour(bg);
  const tint = Math.min(hsl.s, 25); // a faint trace of the background's hue in text and borders
  const at = (l: number, s = hsl.s) => hslToHex({ h: hsl.h, s, l: clamp(l, 0, 100) });
  const card = dark ? at(hsl.l + 4) : at(hsl.l + (100 - hsl.l) * 0.7);
  const raised = dark ? at(hsl.l + 8) : at(hsl.l - 4);
  const border = dark ? at(hsl.l + 13) : at(hsl.l - 10);
  const text = withContrast(withContrast(dark ? at(94, tint) : at(13, tint), bg, 7), card, 7); // as readable as the background allows
  const muted = withContrast(dark ? at(66, tint) : at(40, tint), card, 4.5);
  return dark
    ? { bg, card, raised, border, text, muted, danger: '#ff6b6b', warn: '#ffb454', isDark: true }
    : { bg, card, raised, border, text, muted, danger: '#d6453d', warn: '#c98a14', isDark: false };
}

// The minimum contrast a highlight needs against the background to stay visible as a shape or outline (WCAG 1.4.11).
export const HIGHLIGHT_CONTRAST = 3;

// Backgrounds that follow the highlight, so changing the highlight re-tints them. "tint" is a deep shade of the
// highlight's own hue; "opposite" is a deep shade of the hue across the colour wheel. Both are dark.
export type TintKind = 'tint' | 'opposite';

export function tintedBackground(highlight: string, kind: TintKind): string {
  const hs = hexToHsl(highlight);
  const h = hs.s < 10 ? 220 : hs.h; // a grey or white highlight has no hue to follow; use a calm blue-grey
  return kind === 'tint' ? hslToHex({ h, s: 45, l: 15 }) : hslToHex({ h: h + 180, s: 35, l: 15 });
}
