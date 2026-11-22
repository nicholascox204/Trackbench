// The theme layer. People pick a theme, accent, density, corner style and home
// layout in Settings. `colors` and `s` are live: they read the current theme
// each time they are used, so the app restyles as soon as a setting changes.

import { PixelRatio, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

// A line width snapped to whole device pixels. On a phone whose density is not a whole number (2.625 on many Androids) a 1dp line falls
// between pixels and is drawn uneven and jagged; snapped, it is as crisp as the screen can draw it.
export const px = (n: number): number => PixelRatio.roundToNearestPixel(n);
// Two line weights for the whole app: a hairline (card edges, dividers) and one heavier weight for every outline that says "this is a control"
// or "this is the active one" (the current tracker, the picked day, the timer's buttons, a selected option, a focused field).
export const EDGE = px(1.5);

import { surfacesFromBackground, tintedBackground, withContrast, HIGHLIGHT_CONTRAST, parseHex } from '../core/colour';
import { defaultAppearance, type Appearance, type Corners, type Density, type ThemeName } from '../core/types';

export { defaultAppearance };
export type { Appearance, Corners, Density, ThemeName };

// The last accent is white; on light themes it becomes the theme's ink color so it stays visible.
export const ACCENTS = ['#7c9cff', '#3ecf8e', '#ff9f5a', '#ff6b9a', '#b48cff', '#e6c84a', '#f2f2f2'];
const WHITE_ACCENT = '#f2f2f2';

interface Palette {
  bg: string; card: string; raised: string; border: string; text: string; muted: string;
  danger: string; warn: string; isDark: boolean;
}

export const PALETTES: Record<Exclude<ThemeName, 'auto'>, Palette> = {
  midnight: { bg: '#0f1115', card: '#181b22', raised: '#20242d', border: '#262a33', text: '#eef0f4', muted: '#8a90a0', danger: '#ff6b6b', warn: '#ffb454', isDark: true },
  paper: { bg: '#f6f3ec', card: '#ffffff', raised: '#efeae0', border: '#e2ddd0', text: '#26241f', muted: '#7a766b', danger: '#d6453d', warn: '#c98a14', isDark: false },
  forest: { bg: '#0f1a15', card: '#162620', border: '#23382f', raised: '#1c312a', text: '#e8f1ec', muted: '#86a396', danger: '#ff8a7a', warn: '#e6c84a', isDark: true },
  oled: { bg: '#000000', card: '#0b0b0d', raised: '#151518', border: '#222226', text: '#f2f2f2', muted: '#8a8a92', danger: '#ff6b6b', warn: '#ffb454', isDark: true },
  ocean: { bg: '#0b161b', card: '#112229', raised: '#17303a', border: '#1f3b46', text: '#e6f3f6', muted: '#7fa3ae', danger: '#ff7b7b', warn: '#f0c24b', isDark: true },
  plum: { bg: '#150f1c', card: '#1e1628', raised: '#291d36', border: '#33264a', text: '#f0e9f7', muted: '#a193b5', danger: '#ff7b95', warn: '#f0c24b', isDark: true },
  ember: { bg: '#18110e', card: '#221813', raised: '#2e2019', border: '#3a2a21', text: '#f6ede6', muted: '#b09a8a', danger: '#ff7a63', warn: '#f0b24b', isDark: true },
  snow: { bg: '#f3f6fa', card: '#ffffff', raised: '#e9eef5', border: '#dbe3ee', text: '#1b2430', muted: '#6b7a8c', danger: '#d6453d', warn: '#c98a14', isDark: false },
};

const RADIUS: Record<Corners, { card: number; ctl: number; chip: number }> = {
  sharp: { card: 4, ctl: 4, chip: 4 },
  soft: { card: 14, ctl: 10, chip: 999 },
  round: { card: 22, ctl: 16, chip: 999 },
};

const SPACE: Record<Density | "tuned", { card: number; gap: number; row: number }> = {
  // One fixed spacing for now, so it can be tuned without worrying about other settings.
  tuned: { card: 12, gap: 10, row: 10 },
  compact: { card: 10, gap: 8, row: 8 },
  comfortable: { card: 16, gap: 12, row: 12 },
  spacious: { card: 20, gap: 16, row: 16 },
};

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export interface Colors extends Palette {
  accent: string; onAccent: string; accentBg: string; done: string; doneBg: string;
}

export interface Theme {
  appearance: Appearance;
  colors: Colors;
  radius: { card: number; ctl: number; chip: number };
  space: { card: number; gap: number; row: number };
}

export function resolveTheme(a: Appearance, scheme: 'light' | 'dark' | null | undefined): Theme {
  // The highlight is settled first; the background can follow it. Unset, the background is the phone's light or dark.
  const own = a.accentHex ? parseHex(a.accentHex) : null;
  const picked = own ?? ACCENTS[a.accent % ACCENTS.length];
  const customBg = a.bg ? parseHex(a.bg) : null;
  const kind = a.background ?? (a.theme !== 'auto' ? null : scheme === 'light' ? 'light' : 'dark'); // a saved older theme keeps working
  const p: Palette = customBg
    ? surfacesFromBackground(customBg)
    : kind === 'tint' || kind === 'opposite'
      ? surfacesFromBackground(tintedBackground(picked, kind))
      : kind === 'light' ? PALETTES.paper : kind === 'dark' ? PALETTES.midnight : PALETTES[a.theme as Exclude<ThemeName, 'auto'>];
  // A highlight that would disappear into the background is nudged until it can be seen; the choice stays close to what was picked.
  const accent = own ? withContrast(own, p.bg, HIGHLIGHT_CONTRAST) : picked === WHITE_ACCENT && !p.isDark ? p.text : picked;
  const done = accent; // done is the person's highlight, used as it is: the treatment (outlined, a dot, a tick) says it is done, not a second colour
  const colors: Colors = {
    ...p, accent, done,
    onAccent: luminance(accent) > 0.6 ? '#14161b' : '#ffffff',
    accentBg: `${accent}26`,
    doneBg: `${done}24`,
  };
  return { appearance: a, colors, radius: RADIUS.soft, space: SPACE.tuned };
}

function makeStyles(t: Theme) {
  const c = t.colors;
  return StyleSheet.create({
    card: { backgroundColor: c.card, borderColor: c.border, borderWidth: px(1), borderRadius: t.radius.card, padding: t.space.card, marginBottom: t.space.gap },
    btn: { borderWidth: px(1), borderRadius: t.radius.ctl, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
    btnText: { fontSize: 16, fontWeight: '700' },
    chip: { alignSelf: 'flex-start', borderColor: c.border, borderWidth: px(1), borderRadius: t.radius.chip, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
    chipText: { color: c.text, fontSize: 14, fontWeight: '600' },
    toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
    toggleLabel: { color: c.text, fontSize: 16, fontWeight: '600' },
    pill: { borderColor: c.border, borderWidth: px(1), borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
    pillText: { color: c.muted, fontSize: 13, fontWeight: '700' },
    stepper: { flexDirection: 'row', alignItems: 'center' },
    stepBtn: { width: 40, height: 40, borderRadius: t.radius.ctl, borderWidth: px(1), borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    stepBtnText: { color: c.text, fontSize: 22, lineHeight: 24 },
    stepInput: { color: c.text, fontSize: 18, fontWeight: '600', textAlign: 'center', paddingVertical: 6 },
    title: { color: c.text, fontSize: 30, fontWeight: '700' },
    heading: { color: c.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
    muted: { color: c.muted, fontSize: 14 },
    row: { flexDirection: 'row', alignItems: 'center' },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', marginRight: -8 }, // chips carry a margin on their right; the last one on a line must not count it, or a chip that fits is pushed down
    input: { backgroundColor: c.bg, borderColor: c.border, borderWidth: px(1), borderRadius: t.radius.ctl, color: c.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
    screen: { flex: 1, backgroundColor: c.bg },
    content: { paddingHorizontal: 16, paddingBottom: 40, maxWidth: 600, width: '100%', alignSelf: 'center' },
  });
}

type Styles = ReturnType<typeof makeStyles>;

let current: Theme = resolveTheme(defaultAppearance, 'dark');
let currentStyles: Styles = makeStyles(current);
let currentKey = '';

// Called by the app root on every render; cheap when nothing changed.
export function applyAppearance(a: Appearance, scheme: 'light' | 'dark' | null | undefined): Theme {
  const key = `${a.theme}|${a.background ?? ''}|${a.accent}|${a.bg ?? ''}|${a.accentHex ?? ''}|${a.layout}|${a.icons}|${scheme ?? ''}`;
  if (key !== currentKey) {
    currentKey = key;
    current = resolveTheme(a, scheme);
    currentStyles = makeStyles(current);
  }
  return current;
}

export function getTheme(): Theme {
  return current;
}

// Live views of the current theme; read inside render.
export const colors = new Proxy({} as Colors, {
  get: (_t, k) => current.colors[k as keyof Colors],
});

export const s = new Proxy({} as Styles, {
  get: (_t, k) => currentStyles[k as keyof Styles],
});

export type { TextStyle, ViewStyle };
