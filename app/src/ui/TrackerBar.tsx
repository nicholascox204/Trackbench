// The bottom bar. Every tracker is a place you can be, one tap away. Overview, New and Settings are pinned at the right end and never
// scroll away, so they are always one tap from anywhere; only the trackers scroll.
// Each place is as wide as its name needs (the name is measured, and the highlight is exactly that wide), and the space between one
// place and the next is the same everywhere. When everything fits the row is centred and the gaps open up a little; when it does not
// the row scrolls and an arrow shows in the margin on whichever side has more. Each tracker shows whether you have logged today (a green
// tick when its daily goal is met, a dot when something is logged).
// Press and hold a tracker and a strip appears above with the name, a left and a right arrow that move it one place each tap, and Done.
// Editing and deleting live in the tracker's own Setup, not here.

import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAV } from '../constants/layout';
import { dayResult, entriesOnDay } from '../core/derive';
import { moveTrackerTo, useAppState } from '../core/store';
import { startOfDay } from '../core/time';
import { Icon, SmallButton, Tap, colors } from './kit';
import { EDGE, px } from '../ui/theme';

// Where the row was last left. The bar is built again when you go into a tracker's setup and come back, and it must come back to the
// same place, not to the start and then slide. Kept for the session; a fresh start brings the current tracker into view once.
let savedOffset: number | null = null;
let savedCount: number | null = null; // how many trackers there were, so a tracker added while the bar was away is noticed on return

// How wide each name is when drawn (bold, at the label size). Measured once and kept, so the row never has to be re-measured.
const labelWidth = new Map<string, number>();
const GAP = 6; // the least space between two places
const PAD = 7; // room either side of a name inside its highlight
const MIN_BOX = 46; // a short name still gets a box a thumb can hit

export function TrackerBar({
  currentId, settingsOpen, overviewOpen, onOpen, onAdd, onSettings, onOverview,
}: { currentId?: string; settingsOpen?: boolean; overviewOpen?: boolean; onOpen: (id: string) => void; onAdd: () => void; onSettings: () => void; onOverview: () => void }) {
  const { state } = useAppState();
  const inset = useSafeAreaInsets().bottom;
  const { width: screenW } = useWindowDimensions();
  const trackers = state.trackers;
  const today = startOfDay(Date.now());
  const [, remeasured] = useState(0);

  // Each place's width comes from its name; names not measured yet are measured out of sight first (and estimated until then).
  const labels = [...trackers.map((t) => t.name), 'Overview', 'New', 'Settings'];
  const unmeasured = [...new Set(labels.filter((l) => !labelWidth.has(l)))];
  const boxOf = (name: string): number => Math.max(MIN_BOX, Math.ceil(labelWidth.get(name) ?? name.length * 6) + 2 + 2 * PAD);
  const widths = trackers.map((t) => boxOf(t.name));
  const pinW = ['Overview', 'New', 'Settings'].map(boxOf);
  const PIN_GAP = 2;
  const pinnedW = pinW.reduce((a, b) => a + b, 0) + PIN_GAP * 2 + 10; // the three pinned places, their gaps and the divider
  const avail = Math.max(60, screenW - 2 * NAV.edge - pinnedW);
  const total = widths.reduce((a, b) => a + b, 0);
  const fits = total + GAP * (widths.length - 1) <= avail;
  const gap = fits && widths.length > 1 ? Math.min(Math.max(GAP, (avail - total) / (widths.length - 1)), 22) : GAP; // equal everywhere
  const lefts: number[] = [];
  widths.reduce((x, w) => { lefts.push(x); return x + w + gap; }, 0);

  // which tracker is lifted to be moved
  const [selected, setSelected] = useState<string | null>(null);

  // how much of the row is out of sight on each side
  const [offset, setOffset] = useState(savedOffset ?? 0); // the arrows start right when the place is remembered, not after the first scroll event
  const [contentW, setContentW] = useState(0);
  const [viewW, setViewW] = useState(avail);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsetNow = useRef(savedOffset ?? 0);
  const startOffset = useRef(savedOffset); // read before any scroll event can overwrite it
  const restored = useRef(false); // the remembered place is put back once, when the row is first laid out; a position prop would fight your finger
  const lastCount = useRef(savedCount ?? trackers.length);
  // The row stays where it was left. It moves only when something asks it to: a new tracker was added (go to it), or the very
  // first time, when there is nowhere remembered yet (bring the tracker you are on into view). Opening a setup and coming back,
  // or any other change, never moves it.
  const bringIntoView = (index: number, animate = savedOffset !== null) => {
    const left = lefts[index] ?? 0;
    const right = left + (widths[index] ?? 0);
    const o = offsetNow.current;
    let x: number | null = null;
    if (left < o + 1) x = Math.max(0, left - gap);
    else if (right > o + viewW - 1) x = right + gap - viewW;
    if (x !== null) { const to = x; setTimeout(() => scroller.current?.scrollTo({ x: to, animated: animate }), 60); }
  };
  useEffect(() => {
    if (fits) { savedCount = trackers.length; savedOffset = null; return; } // everything shows: nowhere to remember
    const grew = trackers.length > lastCount.current;
    const shrank = trackers.length < lastCount.current; // one was deleted: the row is shorter, so the place it remembered may no longer exist
    lastCount.current = trackers.length;
    savedCount = trackers.length;
    if (grew) return bringIntoView(trackers.length - 1);
    if (shrank) { shrinkPending.current = true; const i = trackers.findIndex((x) => x.id === currentId); if (i >= 0) { shrinkPending.current = false; return bringIntoView(i, false); } }
    if (savedOffset === null && currentId) { const i = trackers.findIndex((x) => x.id === currentId); if (i >= 0) bringIntoView(i); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackers.length, fits]);
  // After a delete the tracker you land on may be chosen a moment after the bar is back: bring it into view then, once, without sliding.
  const shrinkPending = useRef(false);
  useEffect(() => {
    if (!shrinkPending.current || fits) return;
    const i = trackers.findIndex((x) => x.id === currentId);
    if (i >= 0) { shrinkPending.current = false; bringIntoView(i, false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);
  // When the row has to be put back somewhere (a remembered place, or a tracker was deleted and it is shorter) it is laid out first and moved
  // while hidden, then shown, so the shift is never seen.
  const [ready, setReady] = useState(fits || (!savedOffset && !(savedCount !== null && trackers.length < savedCount)));
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setReady(true), 240);
    return () => clearTimeout(id);
  }, [ready]);
  const shown = ready && unmeasured.length === 0;
  const moreLeft = shown && offset > 6;
  const moreRight = shown && offset + viewW < contentW - 6;

  const selectedTracker = trackers.find((t) => t.id === selected);
  const selectedIndex = trackers.findIndex((x) => x.id === selected);
  const close = () => setSelected(null);

  return (
    <View style={{ backgroundColor: colors.card, borderTopWidth: px(1), borderTopColor: colors.border, paddingBottom: inset + NAV.gap }}>
      {/* names being measured, out of sight: each is drawn at its natural width once */}
      {unmeasured.length > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, flexDirection: 'row', opacity: 0 }}>
          {unmeasured.map((l) => (
            <Text
              key={l} numberOfLines={1} style={{ fontSize: 10, lineHeight: 12, fontWeight: '800' }}
              onLayout={(e) => { labelWidth.set(l, e.nativeEvent.layout.width); remeasured((n) => n + 1); }}
            >{l}</Text>
          ))}
        </View>
      ) : null}
      {selectedTracker ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.raised, borderBottomWidth: px(1), borderBottomColor: colors.border }}>
          <Tap
            onPress={() => moveTrackerTo(selectedTracker.id, selectedIndex - 1)} disabled={selectedIndex === 0} accessibilityLabel="Move left"
            style={{ width: 44, height: 40, borderRadius: 10, borderWidth: EDGE, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', opacity: selectedIndex === 0 ? 0.35 : 1 }}
          ><Icon name="chevron-back" size={22} color={colors.text} /></Tap>
          <Text style={{ flex: 1, textAlign: 'center', marginHorizontal: 8, color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{selectedTracker.name}</Text>
          <Tap
            onPress={() => moveTrackerTo(selectedTracker.id, selectedIndex + 1)} disabled={selectedIndex === trackers.length - 1} accessibilityLabel="Move right"
            style={{ width: 44, height: 40, borderRadius: 10, borderWidth: EDGE, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', opacity: selectedIndex === trackers.length - 1 ? 0.35 : 1 }}
          ><Icon name="chevron-forward" size={22} color={colors.text} /></Tap>
          <SmallButton label="Done" onPress={close} style={{ marginLeft: 8, height: 40 }} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* the margin on each side is always there; an arrow shows in it when more is out of sight that way */}
        <View style={{ width: NAV.edge, alignItems: 'center' }} pointerEvents="none">
          {moreLeft ? <Icon name="chevron-back" size={16} color={colors.accent} /> : null}
        </View>
        <ScrollView
          ref={scroller} style={{ flex: 1, opacity: shown ? 1 : 0 }} onLayout={(e) => setViewW(e.nativeEvent.layout.width)}
          horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
          decelerationRate="normal"
          onScroll={(e) => { offsetNow.current = e.nativeEvent.contentOffset.x; savedOffset = offsetNow.current; setOffset(offsetNow.current); }} onContentSizeChange={(w) => { setContentW(w); if (!restored.current && !fits && startOffset.current) scroller.current?.scrollTo({ x: Math.min(startOffset.current, Math.max(0, w - viewW)), animated: false }); /* never past the end of a row that has got shorter */ restored.current = true; }}
          contentContainerStyle={fits ? { flexGrow: 1, justifyContent: 'center' } : undefined}
        >
          {trackers.map((t, i) => {
            const r = dayResult(t, entriesOnDay(state.entries, t.id, today), today, state.entries);
            const done = r.success;
            const some = !done && (r.measures.done ?? 0) > 0;
            const on = t.id === currentId;
            const picked = selected === t.id;
            return (
              <Tap
                key={t.id}
                onPress={() => { close(); onOpen(t.id); }}
                onLongPress={() => setSelected(t.id)}
                style={{ width: widths[i], height: NAV.height, marginRight: gap, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{
                  alignItems: 'center', width: widths[i], paddingVertical: 3, borderRadius: 12, borderWidth: EDGE,
                  borderColor: picked ? colors.warn : on ? colors.accent : 'transparent', backgroundColor: on ? colors.accentBg : 'transparent',
                }}>
                  <View>
                    <Icon name={t.icon} size={NAV.icon} color={done ? colors.done : on ? colors.accent : colors.muted} />
                    {done ? (
                      <View style={{ position: 'absolute', right: -6, top: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.done, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="checkmark" size={10} color={colors.bg} />
                      </View>
                    ) : some ? (
                      <View style={{ position: 'absolute', right: -3, top: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
                    ) : null}
                  </View>
                  <Text numberOfLines={1} style={{ color: on ? colors.text : colors.muted, fontSize: 10, lineHeight: 12, fontWeight: on ? '700' : '500', marginTop: 2, textAlign: 'center' }}>{t.name}</Text>
                </View>
              </Tap>
            );
          })}
        </ScrollView>

        <View style={{ width: NAV.edge, alignItems: 'center' }} pointerEvents="none">
          {moreRight ? <Icon name="chevron-forward" size={16} color={colors.accent} /> : null}
        </View>
        {/* pinned: always here, whatever the trackers are scrolled to */}
        <View style={{ width: px(1), alignSelf: 'stretch', marginVertical: 10, marginRight: 9, backgroundColor: colors.border }} />
        <Tap onPress={() => { close(); onOverview(); }} style={{ width: pinW[0], height: NAV.height, marginRight: PIN_GAP, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', paddingVertical: 3 }}>
            <Icon name="stats-chart-outline" size={NAV.icon + 2} color={overviewOpen ? colors.accent : colors.muted} />
            <Text style={{ color: overviewOpen ? colors.accent : colors.muted, fontSize: 10, lineHeight: 12, fontWeight: overviewOpen ? '800' : '600', marginTop: 2 }}>Overview</Text>
          </View>
        </Tap>
        <Tap onPress={() => { close(); onAdd(); }} style={{ width: pinW[1], height: NAV.height, marginRight: PIN_GAP, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', paddingVertical: 3 }}>
            <Icon name="add-circle-outline" size={NAV.icon + 2} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 10, lineHeight: 12, fontWeight: '600', marginTop: 2 }}>New</Text>
          </View>
        </Tap>
        <Tap onPress={() => { close(); onSettings(); }} style={{ width: pinW[2], height: NAV.height, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', paddingVertical: 3 }}>
            <Icon name="settings-outline" size={NAV.icon + 2} color={settingsOpen ? colors.accent : colors.muted} />
            <Text style={{ color: settingsOpen ? colors.accent : colors.muted, fontSize: 10, lineHeight: 12, fontWeight: settingsOpen ? '800' : '600', marginTop: 2 }}>Settings</Text>
          </View>
        </Tap>
        <View style={{ width: 4 }} />
      </View>
    </View>
  );
}
