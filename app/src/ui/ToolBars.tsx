// The countdown and the timer: slim one-line bars pinned just above the bottom navigation, so they never scroll away.
// A tracker can have either or both (stacked). Neither knows what it is used for. The name sits to the right of the time.
//
// Countdown: the time is in a quiet bordered box (the cue that it can be changed). Tap it and the whole time is selected,
// so typing replaces it; the phone's keyboard is used and the bars lift above it (see useKeyboardHeight in App). Digits are
// read like a microwave (1, 3, 0 is 1:30). Changing the time at any point, even mid-run, resets the countdown to it.
// Play, pause, reset. It buzzes at zero and a notification arrives if you have left the app. It remembers the time you set.
// Timer: press play and it counts up; pause; reset.

import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Text, TextInput, Vibration, View } from 'react-native';
import { MAX_COUNTDOWN, clock, formatTyped, parseTyped } from '../core/countdown';
import { countdownActions, fillFromCountdown, timerActions, useCountdown, useTimer } from '../core/timers';
import { dismissAlert } from '../core/countdownNotice';
import { watchClock } from '../core/stopwatch';
import { Icon, Tap, colors } from './kit';
import { EDGE, px } from '../ui/theme';

function Round({ icon, label, onPress, primary }: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Tap
      onPress={onPress} accessibilityLabel={label}
      style={{ width: 40, height: 36, borderRadius: 10, borderWidth: EDGE, alignItems: 'center', justifyContent: 'center', marginLeft: 6, borderColor: primary ? colors.accent : colors.border, backgroundColor: primary ? colors.accentBg : colors.raised }}
    >
      <Icon name={icon} size={18} color={primary ? colors.accent : colors.text} />
    </Tap>
  );
}

const bar = (tint?: boolean) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 12, paddingVertical: 5, borderTopWidth: px(1), borderTopColor: colors.border, backgroundColor: tint ? colors.accentBg : colors.card });
const timeStyle = (color: string) => ({ color, fontSize: 20, fontWeight: '800' as const, fontVariant: ['tabular-nums' as const] });
// The width a clock needs at the bar's type size (digits are even width; a colon is narrower), plus the box's padding. The
// boxes are only as wide as the time, so the label sits close and everything moves over when the time needs more room.
const clockWidth = (text: string): number => text.replace(/:/g, '').length * 12 + (text.match(/:/g)?.length ?? 0) * 7 + 26;
const nameStyle = { flex: 1, marginLeft: 10, color: colors.muted, fontSize: 13, fontWeight: '600' as const };

export function CountdownBar({ trackerId, name, into, onEditing }: { trackerId: string; name: string; into?: string; onEditing?: (editing: boolean) => void }) {
  const { timer, status, left, alert } = useCountdown(trackerId);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [text, setText] = useState<string | null>(null); // what is in the box while it is being edited; null otherwise
  const [fresh, setFresh] = useState(false); // just opened, nothing typed: the time is highlighted, so a key or backspace replaces it
  const [blink, setBlink] = useState(true);
  const startText = useRef(''); // what was in the box when editing began, so tapping in and out changes nothing
  const [sel, setSel] = useState<{ start: number; end: number } | undefined>(undefined); // selects the whole time when you tap it, so typing replaces it

  // One buzz when a run reaches zero while you are looking at it. (The notification covers the rest.)
  const seen = useRef(status);
  useEffect(() => {
    // Buzz only if it ran out just now. Coming back to the app after the alert already sounded must not buzz again, and the
    // alert in the notification area is cleared, so it stops ringing once you are here.
    if (status === 'done') void dismissAlert(trackerId);
    if (seen.current === 'running' && status === 'done' && timer.endsAt !== undefined && Date.now() - timer.endsAt < 2500) Vibration.vibrate([0, 300, 150, 300]);
    seen.current = status;
  }, [status]);

  // Running all the way to zero puts the set time into the field the timer fills (also when it finished while you were elsewhere).
  useEffect(() => {
    if (status === 'done') fillFromCountdown(trackerId, into, timer, Date.now());
  }, [status, timer.endsAt, into]);

  // The caret blinks while the box is open.
  useEffect(() => {
    if (text === null) return;
    setBlink(true);
    const t = setInterval(() => setBlink((b) => !b), 530);
    return () => clearInterval(t);
  }, [text === null]);

  // Hiding the keyboard (the back button, say) finishes the edit.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => input.current?.blur());
    return () => { sub.remove(); onEditing?.(false); };
  }, [onEditing]);

  const running = status === 'running';
  const done = status === 'done';
  const shown = text ?? clock(status === 'idle' || status === 'done' ? timer.length : left);
  const shownNow = useRef(shown);
  shownNow.current = shown;
  const maxed = text !== null && (parseTyped(text) ?? 0) > MAX_COUNTDOWN; // typed past the limit; the box shows the limit
  const display = text === null ? shown : maxed ? clock(MAX_COUNTDOWN) : formatTyped(text);
  const note = maxed ? 'Maximum is 24 hours' : running && alert === 'no-permission' ? 'Alert off: allow notifications' : null;
  const label = note ?? (done ? 'Countdown finished' : status === 'paused' ? 'Countdown paused' : 'Countdown');

  function commit() {
    const seconds = text === null || text === startText.current ? null : parseTyped(text);
    if (seconds !== null) countdownActions.setTime(trackerId, name, seconds); // resets it to the new time, even mid-run
    setText(null);
    setFresh(false);
   
    setSel(undefined);
    onEditing?.(false);
  }

  return (
    <View style={[bar(done), text !== null ? { paddingBottom: 14 } : null]}>
      {/* The input holds only the raw digits (never reformatted, so the phone has nothing to correct and nothing flickers);
          the formatted time is drawn over it. A seventh digit is refused by the input itself. */}
      <View style={{ width: clockWidth(display), height: 36 }}>
        <TextInput
          ref={input} value={text ?? shown} maxLength={6} selection={sel} selectTextOnFocus selectionColor="transparent" caretHidden /* our own caret is drawn below, where the formatted time ends */
          keyboardType="number-pad" returnKeyType="done" accessibilityLabel="Countdown time"
          onChangeText={(v) => { setSel(undefined); setFresh(false); setText(v.replace(/[^0-9]/g, '')); }}
          onFocus={() => {
            const digits = clock(timer.length).replace(/[^0-9]/g, ''); // opens on the total time, even partway through a run
            startText.current = digits; setText(digits); setFresh(true); onEditing?.(true);
            // After the tap has placed the cursor: select everything, so the first key replaces the time.
            setTimeout(() => setSel({ start: 0, end: digits.length }), 60);
          }}
          // A second tap, while the time is highlighted, drops the highlight and puts the caret at the end: type to add behind it.
          onPressIn={() => { if (text !== null && fresh) { setFresh(false); setSel({ start: text.length, end: text.length }); } }}
          onBlur={commit} onSubmitEditing={() => input.current?.blur()}
          style={{ height: 36, width: clockWidth(display), color: 'transparent', paddingVertical: 0, paddingHorizontal: 10, borderWidth: EDGE, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.raised }}
        />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', paddingHorizontal: 11.5 }}>
          <Text style={[timeStyle(fresh ? colors.card : done ? colors.accent : colors.text), fresh ? { backgroundColor: colors.accent, borderRadius: 3 } : null]}>{display}</Text>
          {text !== null && !fresh ? <View style={{ width: 2, height: 22, marginLeft: 1, backgroundColor: colors.accent, opacity: blink ? 1 : 0 }} /> : null}
          <View style={{ flex: 1 }} />
        </View>
      </View>
      <Text style={nameStyle} numberOfLines={1}>{label}</Text>
      {status !== 'idle' ? <Round icon="refresh" label="Reset" onPress={() => countdownActions.reset(trackerId, name)} /> : null}
      <Round
        primary icon={running ? 'pause' : 'play'} label={running ? 'Pause' : done ? 'Start again' : 'Start'}
        onPress={() => {
          if (text !== null) { commit(); Keyboard.dismiss(); }
          if (running && text === null) countdownActions.pause(trackerId, name);
          else countdownActions.start(trackerId, name);
        }}
      />
    </View>
  );
}

export function TimerBar({ trackerId, into, name }: { trackerId: string; into?: string; name?: string }) {
  const { status, ms } = useTimer(trackerId);
  const running = status === 'running';
  return (
    <View style={bar()}>
      <View style={{ height: 36, paddingHorizontal: 10, justifyContent: 'center' }}>
        <Text style={timeStyle(colors.text)}>{watchClock(ms)}</Text>
      </View>
      <Text style={nameStyle} numberOfLines={1}>{status === 'paused' ? 'Stopwatch paused' : 'Stopwatch'}</Text>
      {status !== 'idle' ? <Round icon="refresh" label="Reset" onPress={() => timerActions.reset(trackerId, into)} /> : null}
      <Round primary icon={running ? 'pause' : 'play'} label={running ? 'Pause' : 'Start'} onPress={() => (running ? timerActions.pause(trackerId, into) : timerActions.start(trackerId, name))} />
    </View>
  );
}
