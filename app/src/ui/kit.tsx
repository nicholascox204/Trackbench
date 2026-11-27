import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { CONTENT_MAX_WIDTH, NUMBER_BOX } from '../constants/layout';
import { Animated, Easing, Keyboard, Platform, Pressable as RNPressable, ScrollView, StyleSheet as RNStyleSheet, Text, TextInput, View, type PressableProps, type ScrollViewProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRESS, SCROLL, feedback } from '../constants';
import { Ionicons } from '@expo/vector-icons';
import { colors, EDGE, getTheme, px, s } from './theme';
import { cleanDecimal, decimalRoom, firstKey } from '../core/limits';

export { colors, s };
export const topPad = Platform.OS === 'web' ? 20 : Platform.OS === 'ios' ? 60 : 44;
// Room above the first thing on a screen: never less than the notch or status bar the phone reports, whatever the fixed guess says.
export function useTopPad(): number { return Math.max(topPad, useSafeAreaInsets().top + 12); }

// One icon library (Ionicons). Unknown names fall back so imports never break the screen.
export function Icon({ name, size = 22, color }: { name: string; size?: number; color?: string }) {
  const valid = name in Ionicons.glyphMap ? name : 'apps-outline';
  return <Ionicons name={valid as never} size={size} color={color ?? colors.text} />;
}

// The one tappable. Pressed feedback, a small retention area and a double-tap guard come from constants.
export function Tap({ onPress, style, disabled, hitSlop, ...rest }: PressableProps & { style?: StyleProp<ViewStyle> }) {
  const last = useRef(0);
  return (
    <RNPressable
      {...rest}
      disabled={disabled}
      hitSlop={hitSlop ?? PRESS.hitSlop}
      pressRetentionOffset={PRESS.retentionOffset}
      needsOffscreenAlphaCompositing // pressed fades the item as one picture, so a badge and its icon never show through each other
      onPress={(e) => {
        const now = Date.now();
        if (now - last.current < PRESS.doubleTapGuardMs) return;
        last.current = now;
        feedback('tap');
        onPress?.(e);
      }}
      style={({ pressed }) => [style, pressed && !disabled ? { opacity: PRESS.pressedOpacity } : null]}
    />
  );
}

// The one scroll container. Taps keep working with the keyboard open and it closes on drag.
// It tracks the keyboard itself (not the OS) so it behaves the same on iOS and Android,
// including edge-to-edge Android where the window no longer resizes: it adds space under the
// content equal to the keyboard height and scrolls the focused field into view.
// Anything that opens in place (a dropdown, a row's details) asks the page it is in to bring what opened into view: if it fits on the screen,
// the page scrolls until its bottom shows; if it is taller than the screen, until its top is at the top. Use useReveal(open) on the opened view.
type RevealNode = ComponentRef<typeof View> | null;
const RevealCtx = createContext<((node: RevealNode) => void) | null>(null);
export function useReveal(open: boolean) {
  const node = useRef<RevealNode>(null);
  const reveal = useContext(RevealCtx);
  useEffect(() => { if (open) reveal?.(node.current); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return node;
}

// Wraps something that opens in place (a card that expands, an editor that appears): when `when` turns true the page scrolls to show it.
export function Reveal({ when, children }: { when: boolean; children: ReactNode }) {
  const ref = useReveal(when);
  return <View ref={ref}>{children}</View>;
}

// An area that should be seen whole while one of its fields is being typed in (a logged entry, the entry form, a plan row): when the keyboard opens
// on a field inside it, the page scrolls to bring the whole area above the keyboard, not only the field. Taller than the room there is: the field alone.
type Region = ComponentRef<typeof View>;
const RegionCtx = createContext<{ add: (r: Region) => void; remove: (r: Region) => void } | null>(null);
export function KeepInView({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<Region>(null);
  const ctx = useContext(RegionCtx);
  useEffect(() => { const r = ref.current; if (!r) return; ctx?.add(r); return () => ctx?.remove(r); }, [ctx]);
  return <View ref={ref} style={style}>{children}</View>;
}

export function Scroll({ children, onScroll, onScrollBeginDrag, onScrollEndDrag, onMomentumScrollBegin, onMomentumScrollEnd, onTouchStart, onTouchEnd, focusToTop, resetKey, ...props }: ScrollViewProps & { focusToTop?: boolean; resetKey?: unknown }) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  // A new page (a setup step, another tracker) starts at the top, not wherever the last one was left.
  useEffect(() => { ref.current?.scrollTo({ y: 0, animated: false }); }, [resetKey]);
  const y = useRef(0);
  const [kb, setKb] = useState(0);
  // Dragging closes the keyboard, and the space we keep under the content for it goes with it. Taking that space away while a
  // finger is still scrolling shrinks the page under the gesture and the scroll stalls, so the space stays until the scroll
  // has finished (or a moment has passed), then goes.
  const scrolling = useRef(false);
  const coasting = useRef(false);
  const hidePending = useRef(false);
  // The space under the content goes when the keyboard has. If the page is scrolled down into that space, taking it away would
  // snap the position back; glide to the lowest place that still exists first, then remove it.
  const heights = useRef({ content: 0, view: 0 });
  const kbNow = useRef(0);
  kbNow.current = kb;
  const release = () => {
    const max = Math.max(0, heights.current.content - kbNow.current - heights.current.view);
    if (y.current > max + 1) {
      ref.current?.scrollTo({ y: max, animated: true });
      setTimeout(() => setKb(0), 260);
    } else setKb(0);
  };
  const regions = useRef(new Set<Region>());
  const regionApi = useMemo(() => ({ add: (r: Region) => { regions.current.add(r); }, remove: (r: Region) => { regions.current.delete(r); } }), []);
  const reveal = (node: RevealNode) => {
    if (!node) return;
    setTimeout(() => { // after what opened has been laid out
      node.measureInWindow((_x, top, _w, h) => {
        ref.current?.measureInWindow((_sx, viewTop, _sw, viewH) => {
          const bottom = viewTop + viewH - kbNow.current - SCROLL.fieldMargin;
          const topEdge = viewTop + SCROLL.fieldMargin;
          if (h > bottom - topEdge) ref.current?.scrollTo({ y: Math.max(0, y.current + (top - topEdge)), animated: true });
          else if (top + h > bottom) ref.current?.scrollTo({ y: y.current + (top + h - bottom), animated: true });
        });
      });
    }, 60);
  };
  const settle = () => {
    scrolling.current = false;
    coasting.current = false;
    if (hidePending.current) { hidePending.current = false; release(); }
  };
  const insets = useSafeAreaInsets();
  const topInset = useRef(insets.top);
  topInset.current = insets.top;
  const toTop = useRef(focusToTop);
  toTop.current = focusToTop;
  // Bring the field being typed in into view: its marked area whole if that fits above the keyboard, else the field alone. Run when the keyboard
  // opens, when the page grows under it (a field appeared, a note got longer) and after a tap (focus can move between fields with the keyboard already up).
  const kbTop = useRef(0);
  const bring = () => {
    if (!kbTop.current) return;
    const visibleBottom = kbTop.current - SCROLL.fieldMargin;
    const input = TextInput.State.currentlyFocusedInput?.();
    input?.measureInWindow((_x, top, _w, h) => {
      if (toTop.current) {
        // Put the field near the top so what it filters (like icon results) shows above the keyboard.
        ref.current?.measureInWindow((_sx, scrollTop) => {
          ref.current?.scrollTo({ y: Math.max(0, y.current + (top - (Math.max(scrollTop, topInset.current) + SCROLL.fieldTopMargin))), animated: true });
        });
        return;
      }
      const justField = () => { if (top + h > visibleBottom) ref.current?.scrollTo({ y: y.current + (top + h - visibleBottom), animated: true }); };
      const areas = [...regions.current];
      if (areas.length === 0) return justField();
      let best: { t: number; h: number } | null = null;
      let waiting = areas.length;
      areas.forEach((a) => a.measureInWindow((_ax, at, _aw, ah) => {
        if (at <= top + 1 && at + ah >= top + h - 1 && (!best || ah < best.h)) best = { t: at, h: ah };
        if (--waiting > 0) return;
        ref.current?.measureInWindow((_sx, viewTop) => {
          const room = visibleBottom - (Math.max(viewTop, topInset.current) + SCROLL.fieldMargin);
          const pick = best as { t: number; h: number } | null;
          if (!pick) return justField();
          if (pick.h > room) {
            // Too tall to show whole: start it at the top of the screen if the field is still above the keyboard that way, else the field alone.
            const shift = pick.t - (Math.max(viewTop, topInset.current) + SCROLL.fieldMargin);
            if (top - shift + h <= visibleBottom) ref.current?.scrollTo({ y: Math.max(0, y.current + shift), animated: true });
            else justField();
            return;
          }
          if (pick.t + pick.h > visibleBottom) ref.current?.scrollTo({ y: y.current + (pick.t + pick.h - visibleBottom), animated: true });
        });
      }));
    });
  };
  const bringLater = (ms: number) => { if (kbNow.current > 0 && !scrolling.current) setTimeout(bring, ms); };
  const touchY = useRef(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      kbTop.current = e.endCoordinates.screenY;
      setKb(e.endCoordinates.height);
      setTimeout(bring, SCROLL.focusDelayMs);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      if (!scrolling.current) return release();
      hidePending.current = true;
      setTimeout(() => { if (hidePending.current) settle(); }, 1500); // never leave the space behind for long
    });
    return () => { show.remove(); hide.remove(); };
  }, []);
  return (
    <RevealCtx.Provider value={reveal}>
    <RegionCtx.Provider value={regionApi}>
    <ScrollView
      ref={ref}
      keyboardShouldPersistTaps={SCROLL.keyboardPersistTaps}
      keyboardDismissMode={SCROLL.dismissKeyboardOn}
      scrollEventThrottle={16}
      onContentSizeChange={(w, h) => { heights.current.content = h; bringLater(40); props.onContentSizeChange?.(w, h); }}
      onTouchStart={(e) => { touchY.current = e.nativeEvent.pageY; onTouchStart?.(e); }}
      onTouchEnd={(e) => { if (Math.abs(e.nativeEvent.pageY - touchY.current) < 10) bringLater(SCROLL.focusDelayMs); onTouchEnd?.(e); }}
      onLayout={(e) => { heights.current.view = e.nativeEvent.layout.height; props.onLayout?.(e); }}
      onScroll={(e) => { y.current = e.nativeEvent.contentOffset.y; onScroll?.(e); }}
      onScrollBeginDrag={(e) => { scrolling.current = true; onScrollBeginDrag?.(e); }}
      onScrollEndDrag={(e) => { onScrollEndDrag?.(e); setTimeout(() => { if (!coasting.current) settle(); }, 120); }}
      onMomentumScrollBegin={(e) => { coasting.current = true; onMomentumScrollBegin?.(e); }}
      onMomentumScrollEnd={(e) => { onMomentumScrollEnd?.(e); settle(); }}
      {...props}
    >
      {children}
      {kb > 0 ? <View style={{ height: kb }} /> : null}
    </ScrollView>
    </RegionCtx.Provider>
    </RevealCtx.Provider>
  );
}

export const getThemeIcons = (): boolean => getTheme().appearance.icons;

// A tracker's icon in a tinted tile. Renders nothing when icons are turned off.
export function TrackerIcon({ name, size = 42, done }: { name: string; size?: number; done?: boolean }) {
  const t = getTheme();
  if (!t.appearance.icons) return null;
  return (
    <View
      style={{
        width: size, height: size, borderRadius: t.radius.ctl, marginRight: 12, alignItems: 'center', justifyContent: 'center',
        backgroundColor: done ? colors.doneBg : colors.accentBg,
      }}
    >
      <Icon name={name} size={Math.round(size * 0.55)} color={done ? colors.done : colors.accent} />
    </View>
  );
}

export function Card({ children, style, tone, keep }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'done' | 'new'; keep?: boolean }) {
  if (keep) return <KeepInView><Card style={style} tone={tone}>{children}</Card></KeepInView>; // keep: seen whole while a field in it is typed in
  // 'new' is where something gets added (the entry form): an accent outline (same weight all round, the card's own), so it stands apart from the records below it.
  return <View style={[s.card, tone === 'done' && { borderColor: colors.done }, tone === 'new' && { borderColor: colors.accent }, style]}>{children}</View>;
}

export function Button({
  label, onPress, variant = 'primary', style, disabled, done,
}: {
  label: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; style?: StyleProp<ViewStyle>; disabled?: boolean; done?: boolean;
}) {
  // Done: the action has happened (Saved). It cannot be pressed again, but it is not dimmed: it turns outlined in the highlight with a tick (a filled button is the action, so the two read differently).
  if (done) {
    return (
      <View style={[s.btn, { backgroundColor: colors.doneBg, borderColor: colors.done, flexDirection: 'row' }, style]} accessibilityLabel={label}>
        <Icon name="checkmark" size={18} color={colors.done} />
        <Text style={[s.btnText, { color: colors.done, marginLeft: 6 }]}>{label}</Text>
      </View>
    );
  }
  const bg = variant === 'primary' ? colors.accent : 'transparent';
  const border = variant === 'danger' ? colors.danger : variant === 'ghost' ? colors.border : colors.accent;
  const text = variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.danger : colors.text;
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      style={[s.btn, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.4 : 1 }, style]}
    >
      <Text style={[s.btnText, { color: text }]}>{label}</Text>
    </Tap>
  );
}

// Secondary actions are buttons, never floating coloured text. SmallButton is the compact one. With no onPress it
// is only the look, for use inside something already tappable (a whole card).
export function SmallButton({
  label, onPress, icon, trailing, style,
}: { label: string; onPress?: () => void; icon?: string; trailing?: string; style?: StyleProp<ViewStyle> }) {
  const inner = (
    <View style={[{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: EDGE, borderColor: colors.border, backgroundColor: colors.raised }, style]}>
      {icon ? <Icon name={icon} size={16} color={colors.accent} /> : null}
      {label ? <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1, marginHorizontal: icon || trailing ? 6 : 0 }}>{label}</Text> : null}
      {trailing ? <Icon name={trailing} size={16} color={colors.accent} /> : null}
    </View>
  );
  return onPress ? <Tap onPress={onPress} style={{ flexShrink: 1 }}>{inner}</Tap> : inner;
}

// The top of every deeper screen: a back button that stays put while the page scrolls underneath it, so
// getting back is always one tap away. Anything on the right (a name, progress dots) rides along.
export function ScreenHeader({ label, onBack, right }: { label: string; onBack?: () => void; right?: ReactNode }) {
  const top = useTopPad();
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: top, paddingBottom: 8, backgroundColor: colors.bg, borderBottomWidth: px(1), borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', maxWidth: CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' }}>
        {onBack ? <SmallButton label={label} icon="chevron-back" onPress={onBack} style={{ minHeight: 40, paddingRight: 14 }} /> : <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', minHeight: 40, textAlignVertical: 'center', lineHeight: 40 }}>{label}</Text>}
        {right ? <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginLeft: 12 }}>{right}</View> : null}
      </View>
    </View>
  );
}

// The same back control on every screen: a button with an arrow and where it goes.
export function BackButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 6 }}>
      <SmallButton label={label} icon="chevron-back" onPress={onPress} style={{ minHeight: 40, paddingRight: 14 }} />
    </View>
  );
}

export function Chip({ label, active, onPress, onLongPress, disabled }: { label: string; active?: boolean; onPress: () => void; onLongPress?: () => void; disabled?: boolean }) {
  return (
    <Tap
      onPress={onPress} onLongPress={onLongPress}
      disabled={disabled}
      style={[s.chip, active && { backgroundColor: colors.accent, borderColor: colors.accent }, disabled && { opacity: 0.4 }]}
    >
      <Text style={[s.chipText, active && { color: colors.onAccent }]}>{label}</Text>
    </Tap>
  );
}

// A choice among equals: every option the same size in a fixed number of columns, label centred, so no option looks bigger
// or more important than another. Widths are shares of the row, worked out in layout, so nothing jumps after it appears.
export function ChoiceGrid({ options, value, onPick, cols = 3 }: { options: { key: string; label: string }[]; value?: string; onPick: (key: string) => void; cols?: number }) {
  const GAP = 8;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -GAP / 2 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <View key={o.key} style={{ width: `${100 / cols}%`, paddingHorizontal: GAP / 2, marginBottom: GAP }}>
            <Tap onPress={() => onPick(o.key)} style={[s.chip, { alignSelf: 'stretch', marginRight: 0, marginBottom: 0, alignItems: 'center', paddingHorizontal: 6 }, on && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
              <Text numberOfLines={1} style={[s.chipText, on && { color: colors.onAccent }]}>{o.label}</Text>
            </Tap>
          </View>
        );
      })}
    </View>
  );
}

export function Toggle({ label, sub, value, onChange, disabled }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Tap onPress={() => !disabled && onChange(!value)} style={[s.toggleRow, disabled && { opacity: 0.4 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.toggleLabel}>{label}</Text>
        {sub ? <Text style={s.muted}>{sub}</Text> : null}
      </View>
      <View style={[s.pill, { width: 56, alignItems: 'center', flexShrink: 0 }, value && { backgroundColor: colors.done, borderColor: colors.done }]}>
        <Text style={[s.pillText, value && { color: colors.bg }]}>{value ? 'On' : 'Off'}</Text>
      </View>
    </Tap>
  );
}

// Number boxes that are stacked share a frame width: the widest one decides it, so every minus lines up at one place and every plus at
// another. A narrower one keeps its number against the plus and the spare space falls before its minus.
// The widths are not measured and reported back (that arrives a frame late, and each report would start a new ease). Every box has an animated
// width; a frame's width is its fixed part plus its boxes' widths, and the group's width is the largest of its frames, all built from the same
// animated values. One value changing moves every frame in the same tick, so the minus and plus of every stacked row move together.
type Node = Animated.Value | Animated.AnimatedNode;
type BoxRef = { v: Animated.Value; cur: { current: number }; target: { current: number } };
// Which side a number control sits on and grows away from. Right is the default (digits pinned to the plus, growth goes left); a bare
// row, one with no field name beside it, sits at the left (digits pinned to the minus, growth goes right): the same rules, mirrored.
export const AlignCtx = createContext<'left' | 'right'>('right');
const FrameCtx = createContext<{ add: (b: BoxRef) => () => void } | null>(null);
const GroupCtx = createContext<{ nodes: Node[]; join: (n: Node) => () => void } | null>(null);

// max(a, b) with animated values: b plus however much a is above b.
const maxNode = (nodes: Node[]): Node | number =>
  nodes.length === 0 ? 0 : nodes.reduce((a, b) => Animated.add(b as Animated.Value, Animated.subtract(a as Animated.Value, b as Animated.Value).interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp' })));

export function StepGroup({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const join = useCallback((n: Node) => { setNodes((p) => [...p, n]); return () => setNodes((p) => p.filter((x) => x !== n)); }, []);
  const value = useMemo(() => ({ nodes, join }), [nodes, join]);
  return <GroupCtx.Provider value={value}>{children}</GroupCtx.Provider>;
}

// The frame every stepper and hours-and-minutes box shares: a minus, the value, a plus, with the same space either side of the value.
export function StepFrame({ onMinus, onPlus, children }: { onMinus: () => void; onPlus: () => void; children: ReactNode }) {
  const g = useContext(GroupCtx);
  const side = useContext(AlignCtx);
  const [boxes, setBoxes] = useState<BoxRef[]>([]);
  const add = useCallback((b: BoxRef) => { setBoxes((p) => [...p, b]); return () => setBoxes((p) => p.filter((x) => x !== b)); }, []);
  const fixed = useRef(new Animated.Value(0)).current; // what is in the frame besides the boxes (the unit labels)
  const total = useMemo<Node>(() => boxes.reduce<Node>((acc, b) => Animated.add(acc as Animated.Value, b.v), fixed), [boxes, fixed]);
  useEffect(() => g?.join(total), [g?.join, total]); // eslint-disable-line react-hooks/exhaustive-deps
  const shared = useMemo(() => (g ? maxNode(g.nodes) : 0), [g?.nodes]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <FrameCtx.Provider value={useMemo(() => ({ add }), [add])}>
      <View style={s.stepper}>
        <Tap style={s.stepBtn} onPress={onMinus}><Text style={s.stepBtnText}>−</Text></Tap>
        <Animated.View style={{ marginHorizontal: NUMBER_BOX.edge, minWidth: shared as number }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', alignSelf: side === 'left' ? 'flex-start' : 'flex-end' }}
            onLayout={(e) => {
              // The fixed part is what is left of the row once the boxes are taken out. Learned only while nothing is moving, so it is exact.
              if (boxes.some((b) => Math.abs(b.cur.current - b.target.current) > 0.5)) return;
              fixed.setValue(Math.max(0, e.nativeEvent.layout.width - boxes.reduce((n, b) => n + b.cur.current, 0)));
            }}
          >{children}</View>
        </Animated.View>
        <Tap style={s.stepBtn} onPress={onPlus}><Text style={s.stepBtnText}>+</Text></Tap>
      </View>
    </FrameCtx.Provider>
  );
}

// One number you can type into. It is plain text until tapped; then a text box exists for that one edit and is gone when you leave it, so the
// minus and plus (and anything else that changes the number) never touch a text box. On opening, the number looks selected (a tinted box) and
// the first key replaces it; this is done here (see firstKey), not with the phone's select-all, which can fire again by itself while you type.
// onType gets what was typed and returns the text to keep (or null to refuse it); a limit rewrites the text in place, no new box is made.
// A number that eases to its target instead of jumping. A long number settling back to a short one has far to go, so it takes longer.
function useEased(target: number): Animated.Value {
  const v = useRef(new Animated.Value(target)).current;
  const last = useRef(target);
  useEffect(() => {
    const far = Math.abs(target - last.current);
    const from = last.current;
    last.current = target;
    if (far === 0) return;
    if (from === 0 || target > from || far <= NUMBER_BOX.digit * 1.5) { v.stopAnimation(); v.setValue(target); return; } // growing is instant (typing is, so the box answers at once); coming from nothing arrives in place too. Losing a digit or so is instant too (backspace is); only a bigger drop eases, so many digits leaving do not jump
    Animated.timing(v, { toValue: target, duration: Math.min(260, 60 + far * 3), easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [target, v]);
  return v;
}

// The space a number box takes eases to its new width, so the minus, plus and unit slide with it. The box itself is already at its new width.
function Eased({ width, right, children }: { width: number; right: boolean; children: ReactNode }) {
  const w = useEased(width);
  const frame = useContext(FrameCtx);
  const cur = useRef(width);
  const target = useRef(width);
  target.current = width;
  useEffect(() => { const id = w.addListener(({ value }) => { cur.current = value; }); return () => w.removeListener(id); }, [w]);
  useLayoutEffect(() => frame?.add({ v: w, cur, target }), [frame?.add, w]); // eslint-disable-line react-hooks/exhaustive-deps
  // The box inside is already its new size, so it is pinned to the side its digits are aligned to: only the space around it eases, and the digits themselves never slide.
  return <Animated.View style={{ width: w, height: NUMBER_BOX.height, alignItems: right ? 'flex-end' : 'flex-start' }}>{children}</Animated.View>;
}

export function NumberBox(props: Parameters<typeof NumberBoxInner>[0]) {
  const side = useContext(AlignCtx);
  return <Eased width={props.width} right={side === 'right'}><NumberBoxInner {...props} style={[props.style, { textAlign: side }]} /></Eased>;
}

function NumberBoxInner({ id, editing, setEditing, text, width, maxLength, keyboard, style, label, onStart, onType }: {
  id: string; editing: string | null; setEditing: Dispatch<SetStateAction<string | null>>; text: string; width: number; maxLength: number;
  keyboard: 'decimal-pad' | 'number-pad'; style?: StyleProp<TextStyle>; label: string; onStart: () => void; onType: (raw: string) => string | null;
}) {
  const [typed, setTyped] = useState(text);
  const [fresh, setFresh] = useState(false); // just opened: the number is "selected"
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const active = editing === id;
  // Focus is asked for a moment after the box exists: a box focused while still being mounted has no place yet, and the phone scrolls the
  // page to the top to look for it.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => ref.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [active]);
  const right = RNStyleSheet.flatten(style)?.textAlign === 'right';
  const box = [s.stepInput, { height: NUMBER_BOX.height, paddingVertical: 0, paddingHorizontal: 0, width, textAlign: 'left' as const, includeFontPadding: false }, style];
  if (active) {
    return (
      <View>
        <TextInput
          ref={ref} value={typed} keyboardType={keyboard} accessibilityLabel={label}
          maxLength={fresh ? undefined : maxLength} // while the old number is still there, the length limit would block the key that replaces it
          selectionColor={colors.accent} cursorColor={colors.accent}
          // Left-aligned, the phone draws a typed digit before the box has grown to hold it and scrolls the text to keep it in view (the new digit
          // takes the old one's place for a frame). One spare digit of room inside the text box means it never has to scroll; the box around it still
          // takes exactly its own width.
          style={[...box, right ? null : { width: width + NUMBER_BOX.digit }, fresh ? { opacity: 0 } : null]}
          onPressIn={() => setFresh(false)} // you touched the box to place the caret: no longer "selected"
          onBlur={() => setEditing((c) => (c === id ? null : c))}
          onChangeText={(raw) => {
            const out = onType(fresh ? firstKey(typed, raw) : raw);
            setFresh(false);
            if (out !== null) setTyped(out);
          }}
        />
        {fresh ? (
          // The selected look, drawn here: the number highlighted as the phone would, with no caret, so it is clear typing replaces it.
          <View pointerEvents="none" style={{ position: 'absolute', left: right ? -40 : -2, right: right ? -2 : -40, top: 0, bottom: 0, justifyContent: 'center', alignItems: right ? 'flex-end' : 'flex-start' }}>
            <Text style={[s.stepInput, style, { backgroundColor: colors.accent, color: colors.onAccent, borderRadius: 3, lineHeight: 18, paddingHorizontal: 2 }]}>{typed}</Text>
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <Tap onPress={() => { onStart(); setTyped(text); setFresh(true); setEditing(id); }} style={{ justifyContent: 'center' }} accessibilityLabel={label}>
      <Text style={[...box, { textAlignVertical: 'center', lineHeight: NUMBER_BOX.height }]}>{text}</Text>
    </Tap>
  );
}

// While a box is being edited it can grow but never shrinks: the phone removes a digit a frame before a smaller box could be laid out,
// and that gap shows as a jump. The box settles to its real width when you leave it.
// A test switch: off, the box follows what is in it as you type and delete (the minus and plus move with it, easing on a shrink); on, it holds until you leave.
const HOLD_WHILE_EDITING = false;
export function useHold(active: boolean, width: number): number {
  if (!HOLD_WHILE_EDITING) return width;
  const held = useRef(0);
  if (!active) held.current = 0; else held.current = Math.max(held.current, width);
  return active ? held.current : width;
}

export function Stepper({
  value, onChange, step = 1, min = 0, max, suffix, width,
}: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; width?: number;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [txt, setTxt] = useState(String(value)); // what is in the box while editing; only used to size it
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min, Math.round(v * 100) / 100));
  // The number is shown as it is (5, then 5.5). Room for the decimals the step can make is already kept in the box, so the minus and plus stay put;
  // the digits are right-aligned, so a decimal appearing moves the number left, like any right-aligned figure.
  const stepDecimals = Math.min(2, (String(step).split('.')[1] ?? '').length);
  const fmt = (v: number) => String(v);
  const shown = editing ? txt : fmt(value);
  const stepWhole = String(Math.trunc(Math.abs(step))).length; // a step of 500 is three digits wide, so the box is never narrower than that
  // The box is as wide as its number. Room for the decimals the step can produce is kept from the start (0.5 gives one, 0.25 two,
  // a whole step none), so no press moves the number.
  const [wholeText, decText = ''] = shown.split(/[.,]/);
  const whole = Math.max(1, wholeText.length, stepWhole);
  const hasPoint = /[.,]/.test(shown);
  const decimalDigits = Math.max(stepDecimals, hasPoint ? decText.length : 0);
  const content = whole * NUMBER_BOX.digit + (decimalDigits > 0 ? NUMBER_BOX.point + decimalDigits * NUMBER_BOX.digit : hasPoint ? NUMBER_BOX.point : 0);
  const nudge = (v: number) => { setEditing(null); onChange(clamp(v)); };
  // Leaving the box: a number left below the lowest, or no number, becomes the lowest.
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editing === 'n') { wasEditing.current = true; return; }
    if (!wasEditing.current) return;
    wasEditing.current = false;
    const p = parseFloat(txt.replace(',', '.'));
    if (Number.isNaN(p) || p < min) onChange(min);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  const boxWidth = useHold(editing === 'n', width ?? Math.ceil(content));
  return (
    <StepFrame onMinus={() => nudge(value - step)} onPlus={() => nudge(value + step)}>
      <NumberBox
        id="n" editing={editing} setEditing={setEditing} text={fmt(value)} width={boxWidth} maxLength={decimalRoom(txt)}
        keyboard="decimal-pad" label="Edit number" style={{ textAlign: 'right' }} onStart={() => setTxt(fmt(value))}
        onType={(raw) => {
          const t = cleanDecimal(raw);
          if (t === null) return null;
          setTxt(t);
          const p = parseFloat(t);
          if (Number.isNaN(p)) return t;
          // Below the lowest allowed is left alone while typing (0. on the way to 0.25); it is raised to the lowest once you are done.
          if (p < min) return t;
          const c = clamp(p);
          onChange(c);
          if (c !== p && Math.abs(c - p) > 0.005) { setTxt(String(c)); return String(c); } // past the highest: it becomes the highest
          return t;
        }}
      />
      {suffix ? <Text style={[s.muted, { marginLeft: NUMBER_BOX.unitGap }]}>{suffix}</Text> : null}
    </StepFrame>
  );
}

// A big, tappable choice for one-question-per-screen flows. The headline carries the meaning,
// the subhead explains it. The border width never changes, so nothing shifts when you select.
export function Option({
  title, sub, selected, onPress, disabled, icon, mark = 'radio',
}: { title: string; sub?: string; selected: boolean; onPress: () => void; disabled?: boolean; icon?: string; mark?: 'radio' | 'add' }) {
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: "row", alignItems: "center",
        borderWidth: EDGE, borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accentBg : colors.card, borderRadius: 14, padding: 14, marginBottom: 10,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon ? <View style={{ marginRight: 14 }}><Icon name={icon} size={26} color={selected ? colors.accent : colors.muted} /></View> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>{title}</Text>
        {sub ? <Text style={[s.muted, { marginTop: 4, fontSize: 13 }]}>{sub}</Text> : null}
      </View>
      {mark === 'add' ? (
        <View style={{ marginLeft: 12 }}><Icon name="add-circle-outline" size={24} color={colors.accent} /></View>
      ) : (
        <View style={{ width: 22, height: 22, borderRadius: 11, marginLeft: 12, borderWidth: EDGE, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <Icon name="checkmark" size={14} color={colors.onAccent} /> : null}
        </View>
      )}
    </Tap>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}
export function Heading({ children }: { children: ReactNode }) {
  return <Text style={s.heading}>{children}</Text>;
}
export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}
