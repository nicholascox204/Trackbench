// Choosing the look. The highlight comes first and is set freely; the background comes second and adapts to it, with
// suggestions that keep the highlight visible. Quick presets to tap, a full colour picker for your own. Used on the
// opening screen and in Settings, so the two can never drift apart. The page restyles live, which is the preview.

import { useState, type ReactNode } from 'react';
import { Text, View, useColorScheme } from 'react-native';
import { setAppearance, useAppState } from '../core/store';
import { defaultAppearance } from '../core/types';
import { ColourPicker } from './ColourPicker';
import { Icon, Tap } from './kit';
import { ACCENTS, colors, EDGE, resolveTheme } from './theme';
import { px } from '../ui/theme';

type Kind = 'light' | 'dark' | 'tint' | 'opposite';
const KINDS: { key: Kind; label: string }[] = [
  { key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }, { key: 'tint', label: 'Deep tint' }, { key: 'opposite', label: 'Opposite' },
];

function Swatch({ fill, selected, onPress, label, caption, children }: { fill?: string; selected: boolean; onPress: () => void; label?: string; caption?: string; children?: ReactNode }) {
  return (
    <Tap onPress={onPress} accessibilityLabel={label ?? 'Colour'} style={{ width: 64, alignItems: 'center', marginBottom: 10 }} hitSlop={4}>
      <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: px(3), borderColor: selected ? colors.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: fill, borderWidth: EDGE, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </View>
      </View>
      {caption ? <Text numberOfLines={1} style={{ color: selected ? colors.text : colors.muted, fontSize: 11, marginTop: 2 }}>{caption}</Text> : null}
    </Tap>
  );
}

// A background shown as it will look: the page colour, a card on it, and a line of the highlight, so hues and the
// difference between near-black options can be seen.
function BgTile({ bg, card, accent, selected, onPress, label, children }: { bg?: string; card?: string; accent?: string; selected: boolean; onPress: () => void; label: string; children?: ReactNode }) {
  return (
    <Tap onPress={onPress} accessibilityLabel={label} style={{ flex: 1, marginBottom: 10 }} hitSlop={4}>
      <View style={{ borderWidth: px(3), borderColor: selected ? colors.text : 'transparent', borderRadius: 14, padding: 1 }}>
        <View style={{ height: 52, borderRadius: 11, overflow: 'hidden', backgroundColor: bg, borderWidth: EDGE, borderColor: colors.muted, justifyContent: 'center' }}>
          {children ?? (
            <View style={{ marginHorizontal: 8, height: 26, borderRadius: 7, backgroundColor: card, justifyContent: 'center', paddingHorizontal: 6 }}>
              <View style={{ height: 5, width: 22, borderRadius: 3, alignSelf: 'center', backgroundColor: accent ?? colors.accent }} />
            </View>
          )}
        </View>
      </View>
      <Text numberOfLines={1} style={{ color: selected ? colors.text : colors.muted, fontSize: 11, marginTop: 2, textAlign: 'center' }}>{label}</Text>
    </Tap>
  );
}

function Heading({ children }: { children: string }) {
  return <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>{children}</Text>;
}

function Hint({ children }: { children: string }) {
  return <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>{children}</Text>;
}

export function LookPicker() {
  const { state } = useAppState();
  const a = state.settings.appearance ?? defaultAppearance;
  const [openBg, setOpenBg] = useState(!!a.bg);
  const [openHl, setOpenHl] = useState(!!a.accentHex);

  const scheme = useColorScheme();
  // What a choice will really look like: the page runs the same resolution, so a white highlight on Light shows as the dark it becomes.
  const seen = (over: Partial<typeof a>) => resolveTheme({ ...a, ...over }, scheme).colors;
  const bgNow = colors.bg;
  const hlNow = colors.accent;
  const ownBg = !!a.bg;
  const ownHl = !!a.accentHex;
  // With nothing chosen, the background is the phone's light or dark, and that tile shows as selected.
  const current: Kind = a.background ?? (colors.isDark ? 'dark' : 'light');

  return (
    <View>
      <Heading>Highlight</Heading>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {ACCENTS.map((c, i) => {
          return (
            <Swatch
              key={c} fill={seen({ accent: i, accentHex: undefined }).accent} selected={!ownHl && a.accent === i}
              onPress={() => { setOpenHl(false); setAppearance({ accent: i, accentHex: undefined }); }}
            />
          );
        })}
        <Swatch label="Your own highlight" caption="Your own" selected={ownHl || openHl} onPress={() => { setOpenHl(!openHl); if (!ownHl) setAppearance({ accentHex: hlNow }); }} fill={ownHl ? a.accentHex : colors.card}>
          <Icon name="color-palette-outline" size={20} color={colors.text} />
        </Swatch>
      </View>
      {openHl ? (
        <View style={{ marginTop: 4, marginBottom: 6 }}>
          <ColourPicker value={a.accentHex ?? hlNow} onChange={(hex) => setAppearance({ accentHex: hex })} />
        </View>
      ) : null}

      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 14, marginBottom: 8 }}>Background</Text>
      <Hint>Light and dark are plain. Deep tint and Opposite follow your highlight.</Hint>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {KINDS.map((k) => {
          const base = seen({ background: k.key, bg: undefined, theme: 'auto' });
          return (
            <BgTile
              key={k.key} label={k.label} bg={base.bg} card={base.card} accent={base.accent} selected={!ownBg && current === k.key}
              onPress={() => { setOpenBg(false); setAppearance({ background: k.key, bg: undefined, theme: 'auto' }); }}
            />
          );
        })}
        <BgTile
          label="Your own" selected={ownBg || openBg} bg={ownBg ? a.bg : colors.card}
          onPress={() => { setOpenBg(!openBg); if (!ownBg) setAppearance({ bg: bgNow }); }}
        >
          <View style={{ alignItems: 'center' }}><Icon name="color-palette-outline" size={22} color={colors.text} /></View>
        </BgTile>
      </View>
      {openBg ? (
        <View style={{ marginTop: 4, marginBottom: 6 }}>
          <ColourPicker value={a.bg ?? bgNow} onChange={(hex) => setAppearance({ bg: hex })} />
        </View>
      ) : null}
    </View>
  );
}
