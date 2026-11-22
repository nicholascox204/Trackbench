import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contrast, hexToHsl, hslToHex, isDarkColour, parseHex, surfacesFromBackground, tintedBackground, withContrast,
} from './colour';

test('hex parsing accepts short and long forms and rejects junk', () => {
  assert.equal(parseHex('#ABC'), '#aabbcc');
  assert.equal(parseHex('3ecf8e'), '#3ecf8e');
  assert.equal(parseHex('nope'), null);
  assert.equal(parseHex('#12345'), null);
});

test('hex and hsl round trip closely', () => {
  for (const hex of ['#7c9cff', '#3ecf8e', '#ff9f5a', '#0f1115', '#f6f3ec']) {
    const back = hslToHex(hexToHsl(hex));
    const d = (a: string, b: string) => Math.abs(parseInt(a.slice(1), 16) - parseInt(b.slice(1), 16));
    assert.ok(d(hex, back) < 0x030303, `${hex} -> ${back}`);
  }
});

test('contrast ratio matches the standard', () => {
  assert.ok(Math.abs(contrast('#000000', '#ffffff') - 21) < 0.01);
  assert.ok(Math.abs(contrast('#777777', '#777777') - 1) < 0.001);
});

test('a poor pairing is nudged to the contrast asked for, not refused', () => {
  const fixed = withContrast('#777788', '#808090', 4.5);
  assert.ok(contrast(fixed, '#808090') >= 4.5);
  assert.equal(withContrast('#ffffff', '#000000', 4.5), '#ffffff'); // already fine, untouched
});

test('any chosen background gives readable text and a distinct card', () => {
  const picks = ['#0f1115', '#000000', '#f6f3ec', '#ffffff', '#1d4ed8', '#fde68a', '#7f1d1d', '#808080', '#e11d48', '#14532d'];
  for (const bg of picks) {
    const s = surfacesFromBackground(bg);
    const best = Math.max(contrast("#000000", bg), contrast("#ffffff", bg)); // a mid-tone background cannot do better than this
    assert.ok(contrast(s.text, s.bg) >= Math.min(4.5, best) - 0.05, `${bg} text ${contrast(s.text, s.bg).toFixed(2)}`);
    assert.ok(contrast(s.text, s.card) >= Math.min(4.5, best) - 0.05, `${bg} text on card`);
    assert.ok(contrast(s.muted, s.card) >= 4.5, `${bg} muted ${contrast(s.muted, s.card).toFixed(1)}`);
    assert.notEqual(s.border, s.bg, `${bg} border differs`); // on pure white the card cannot be lighter, so the border separates it
    if (hexToHsl(bg).l < 96) assert.notEqual(s.card, s.bg, `${bg} card differs`);
    assert.equal(s.isDark, isDarkColour(bg));
  }
});

test('deep tint and opposite follow the highlight, and differ from each other', () => {
  const hues = ['#7c9cff', '#3ecf8e', '#ff9f5a', '#ff6b9a', '#b48cff', '#e6c84a'];
  const tints = hues.map((h) => tintedBackground(h, 'tint'));
  assert.equal(new Set(tints).size, hues.length, 'each highlight gives its own tint');
  for (const h of hues) {
    assert.notEqual(tintedBackground(h, 'tint'), tintedBackground(h, 'opposite'));
    assert.ok(isDarkColour(tintedBackground(h, 'tint')) && isDarkColour(tintedBackground(h, 'opposite')));
    assert.ok(contrast(h, tintedBackground(h, 'tint')) >= 3, `${h} visible on its tint`);
  }
});

test('a white or grey highlight does not tint the background red', () => {
  const hue = hexToHsl(tintedBackground('#f2f2f2', 'tint')).h;
  assert.ok(hue > 200 && hue < 240, String(hue));
});
