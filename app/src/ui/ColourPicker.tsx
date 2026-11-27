// A colour picker made of three sliders (hue, richness, brightness) and a hex box. The tracks show the colour at each
// point, so you see what you will get before you let go. Fine under a thumb, and no 2D square to aim at.

import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { PanResponder, Text, TextInput, View } from 'react-native';
import { clamp, hexToHsl, hslToHex, parseHex, type Hsl } from '../core/colour';
import { colors, s } from './theme';
import { px } from '../ui/theme';

const SEGMENTS = 28;

function Slider({ value, max, colourAt, onChange, label }: { value: number; max: number; colourAt: (v: number) => string; onChange: (v: number) => void; label: string }) {
  const box = useRef<ComponentRef<typeof View>>(null);
  const left = useRef(0);
  const width = useRef(1);
  const [w, setW] = useState(1);
  const cb = useRef(onChange);
  cb.current = onChange;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false, // a page scroll must not steal a drag in progress
      onPanResponderGrant: (e) => {
        const pageX = e.nativeEvent.pageX;
        box.current?.measureInWindow((x: number, _y: number, mw: number) => {
          left.current = x; width.current = mw || width.current;
          cb.current(clamp(((pageX - x) / width.current) * max, 0, max));
        });
      },
      onPanResponderMove: (_e, g) => cb.current(clamp(((g.moveX - left.current) / width.current) * max, 0, max)),
    }),
  ).current;

  const thumb = (value / max) * w;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <View style={{ height: 40, justifyContent: 'center' }}>
        <View
          ref={box} {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel={label}
          onLayout={(e) => { setW(e.nativeEvent.layout.width); width.current = e.nativeEvent.layout.width; }}
          style={{ height: 40, justifyContent: 'center' }}
        >
          <View pointerEvents="none" style={{ flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden', borderWidth: px(1), borderColor: colors.border }}>
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: colourAt(((i + 0.5) / SEGMENTS) * max) }} />
            ))}
          </View>
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: clamp(thumb - 14, -4, Math.max(0, w - 24)), width: 28, height: 28, borderRadius: 14, borderWidth: px(3), borderColor: '#ffffff', backgroundColor: colourAt(value), shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, elevation: 4 }}
          />
        </View>
      </View>
    </View>
  );
}

export function ColourPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsl, setHsl] = useState<Hsl>(() => hexToHsl(value));
  const [text, setText] = useState(value);

  // Follow the value when it changes from outside (a swatch or a suggestion was tapped).
  useEffect(() => {
    if (parseHex(text) !== value) { setHsl(hexToHsl(value)); setText(value); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function move(next: Hsl) {
    setHsl(next);
    const hex = hslToHex(next);
    setText(hex);
    onChange(hex);
  }

  return (
    <View>
      <Slider label="Colour" value={hsl.h} max={360} colourAt={(v) => hslToHex({ h: v, s: Math.max(hsl.s, 55), l: clamp(hsl.l, 35, 65) })} onChange={(h) => move({ ...hsl, h, s: hsl.s < 8 ? 60 : hsl.s })} />
      <Slider label="Richness" value={hsl.s} max={100} colourAt={(v) => hslToHex({ ...hsl, s: v })} onChange={(sv) => move({ ...hsl, s: sv })} />
      <Slider label="Brightness" value={hsl.l} max={100} colourAt={(v) => hslToHex({ ...hsl, l: v })} onChange={(l) => move({ ...hsl, l })} />
      <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Or type a colour code</Text>
      <TextInput
        style={[s.input, { width: 140 }]} value={text} autoCapitalize="none" autoCorrect={false} maxLength={7}
        placeholder="#7c9cff" placeholderTextColor={colors.hint}
        onChangeText={(v) => {
          setText(v);
          const hex = parseHex(v);
          if (hex) { setHsl(hexToHsl(hex)); onChange(hex); }
        }}
      />
    </View>
  );
}
