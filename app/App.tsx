import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState as RNAppState, BackHandler, Platform, Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayResult, entriesOnDay } from './src/core/derive';
import { defaultConfig } from './src/core/engine';
import { applyPresetChanges, completeOnboarding, flushOnLeave, getState, isRestoring, loadState, syncNow, noteTrackerOpened, useAppState } from './src/core/store';
import { startAuth, useSession, cloudConfigured } from './src/core/auth';
import { syncPhoneSteps } from './src/core/healthSync';
import { syncHealth } from './src/core/healthRead';
import { dismissFinishedAlerts, liveTimers, loadTimers } from './src/core/timers';
import { initialTap, listenForegroundTaps } from './src/core/notificationTap';
import { peekTapTarget, subscribeTap, takeTapTarget } from './src/core/tapTarget';
import { startOfDay } from './src/core/time';
import { defaultAppearance, type AppState } from './src/core/types';
import { AuthScreen } from './src/screens/AuthScreen';
import { Welcome } from './src/screens/Welcome';
import { Overview } from './src/screens/Overview';
import { Settings } from './src/screens/Settings';
import { SetupFlow } from './src/screens/SetupFlow';
import { TrackerScreen } from './src/screens/TrackerScreen';
import { colors, s } from './src/ui/kit';
import { applyAppearance } from './src/ui/theme';
import { CountdownBar, TimerBar } from './src/ui/ToolBars';
import { TrackerBar } from './src/ui/TrackerBar';
import { SwipeIn } from './src/ui/SwipeIn';
import { DEFAULT_OPEN_ON, pickStart } from './src/core/startPick';
import { forgetPickedDay } from './src/core/pickedDay';
import { useKeyboardHeight } from './src/ui/useKeyboardHeight';
import './src/core/runSession'; // defines the run-recording location task as the app loads

// There is no hub: every tracker is a place of its own, reached from the bar along the bottom. Above the trackers,
// Settings is one more place, at the end of the same row. (Goals and motivation are parked in _parked/.)
type Nav =
  | { name: 'launch' }
  | { name: 'welcome'; revisit?: boolean } // revisit: came back from the first tracker to change the name or look
  | { name: 'tracker'; id: string }
  | { name: 'setup'; id?: string }
  | { name: 'overview' }
  | { name: 'settings' };

// Open on the tracker you are likely to need (see core/startPick.ts): one still due today, the one you usually log around
// now, or where you just were, depending on the Open on setting. Whatever day you had switched to on it is forgotten.
function startNav(state: AppState, tapped?: string | null): Nav {
  if (tapped && state.trackers.some((t) => t.id === tapped)) { forgetPickedDay(tapped); return { name: 'tracker', id: tapped }; } // a tapped notification beats the rule
  const id = pickStart(state.trackers, state.entries, Date.now(), state.settings.openOn ?? DEFAULT_OPEN_ON, state.settings.lastTracker ?? null, liveTimers(Date.now()));
  if (!id) return { name: 'setup' };
  forgetPickedDay(id);
  return { name: 'tracker', id };
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

function AppInner() {
  const { state, loaded } = useAppState();
  const session = useSession();
  // Everyone has an account; only while testing can it be skipped.
  // An account is required. The one way past it is the browser preview on the PC while developing (to check screens); a
  // phone never skips, and a phone build that cannot reach the cloud still stops here and says so.
  const browserSkip = Platform.OS === 'web' && __DEV__ && !!state.settings.skippedSignIn;
  const needsAccount = !(cloudConfigured && session.loading) && !session.userId && !browserSkip;
  const scheme = useColorScheme();
  const [nav, setNav] = useState<Nav>({ name: 'launch' });
  const [timersReady, setTimersReady] = useState(false);
  const [tapChecked, setTapChecked] = useState(false); // whether the app was started by tapping a notification has been looked at
  const tapped = useSyncExternalStore(subscribeTap, peekTapTarget);
  const [lastId, setLastId] = useState<string | null>(null); // the tracker you were last on
  const [editingTool, setEditingTool] = useState(false); // the countdown's time is being typed, so the bars lift above the keyboard
  const keyboard = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;
  const spot = useRef<number | null>(null); // where on the bar the last place was, to know which side the next one arrives from

  // Opening the app (or coming back to it) stops any finished countdown's alert from ringing on.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => { if (s === 'active') { dismissFinishedAlerts(Date.now()); if (getState().settings.devSync) applyPresetChanges(); void syncPhoneSteps(); void syncHealth(); void syncNow(); } else if (s === 'background' || s === 'inactive') flushOnLeave(); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    startAuth();
    Promise.resolve(loadState()).finally(() => { if (getState().settings.devSync) applyPresetChanges(); void syncPhoneSteps(); void syncHealth(); void syncNow(); });
    loadTimers().finally(() => setTimersReady(true)); // the opening choice looks at running timers, so it waits for them
    initialTap().finally(() => setTapChecked(true));
    return listenForegroundTaps();
  }, []);

  // First launch goes straight to making a tracker. The points and streaks system starts with sensible defaults
  // and can be changed any time from Progress, so nothing stands between a new person and their first tracker.
  useEffect(() => {
    if (loaded && !state.onboarded) completeOnboarding([], true, defaultConfig());
  }, [loaded, state.onboarded]);

  useEffect(() => {
    if (loaded && timersReady && tapChecked && !session.loading && !needsAccount && nav.name === 'launch') setNav(!state.settings.welcomed ? { name: 'welcome' } : state.onboarded ? startNav(state, takeTapTarget()) : { name: 'setup' });
  }, [loaded, timersReady, tapChecked, session.loading, needsAccount, nav.name, state]);

  // A notification tapped while the app is already open or in the background.
  useEffect(() => {
    if (!tapped || !loaded || nav.name === 'launch') return;
    const id = takeTapTarget();
    if (id && state.trackers.some((t) => t.id === id)) { forgetPickedDay(id); setNav({ name: 'tracker', id }); }
  }, [tapped, loaded, nav.name, state.trackers]);

  // The system back button or gesture does what the on-screen back does. Setup and Goals handle their own (they
  // know about unsaved work); from a tracker it leaves the app, as people expect from the home screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const here = state.trackers.find((t) => t.id === lastId) ?? state.trackers[0];
      const toTracker = () => setNav(here ? { name: 'tracker', id: here.id } : { name: 'setup' });
      if (nav.name === 'settings' || nav.name === 'overview') { toTracker(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [nav, lastId, state.trackers, state.systems.length]);

  useEffect(() => {
    if (nav.name === 'tracker') { setLastId(nav.id); if (loaded) noteTrackerOpened(nav.id); }
  }, [nav, loaded]);

  // With no trackers at all (a fresh install, a full reset, or the last one deleted) the only place to be is making one.
  useEffect(() => {
    if (loaded && !isRestoring() && state.onboarded && state.trackers.length === 0 && nav.name !== 'setup' && nav.name !== 'launch' && nav.name !== 'welcome') setNav({ name: 'setup' });
  }, [loaded, state.onboarded, state.trackers.length, nav.name]);

  // Finishing the opening screen moves on to the first tracker (or the one you were on).
  useEffect(() => {
    if (loaded && nav.name === 'welcome' && !nav.revisit && state.settings.welcomed) setNav(startNav(state));
  }, [loaded, nav.name, state]);

  // After a full reset there is no name or look yet, so go back to the opening screen.
  useEffect(() => {
    if (loaded && !state.settings.welcomed && nav.name !== 'welcome' && nav.name !== 'launch') setNav({ name: 'welcome' });
  }, [loaded, state.settings.welcomed, nav.name]);

  // When a tracker is deleted you land on the one next to it (the one that was to its right, else to its left), not back near the start.
  const order = useRef<string[]>([]);
  const neighbourOf = (id: string): string | undefined => {
    const old = order.current;
    const i = old.indexOf(id);
    if (i < 0) return undefined;
    const alive = (x: string) => state.trackers.some((t) => t.id === x);
    return old.slice(i + 1).find(alive) ?? old.slice(0, i).reverse().find(alive);
  };
  useEffect(() => {
    if (loaded && nav.name === 'tracker' && !state.trackers.some((t) => t.id === nav.id)) {
      const next = neighbourOf(nav.id);
      setNav(next ? { name: 'tracker', id: next } : startNav(state));
    }
  }, [loaded, nav, state]); // eslint-disable-line react-hooks/exhaustive-deps
  // Deleted from its own setup: "back" goes to the neighbour too.
  useEffect(() => {
    if (loaded && lastId && !state.trackers.some((t) => t.id === lastId)) { const next = neighbourOf(lastId); if (next) setLastId(next); }
  }, [loaded, lastId, state.trackers]); // eslint-disable-line react-hooks/exhaustive-deps
  // Last, so the two above still see the order from before the delete.
  useEffect(() => { order.current = state.trackers.map((t) => t.id); }, [state.trackers]);

  // The theme is applied before anything renders, so every screen reads the current look.
  const theme = applyAppearance(state.settings.appearance ?? defaultAppearance, scheme);
  // The phone's clock and notch sit on a block of the background colour on every screen, so nothing scrolls behind them.
  const bar = (
    <>
      <StatusBar style={theme.colors.isDark ? 'light' : 'dark'} />
      {insets.top > 0 ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: theme.colors.bg, zIndex: 100, elevation: 100 }} /> : null}
    </>
  );

  if (!loaded || (cloudConfigured && session.loading)) return <View style={s.screen} />;
  // Signing in: hold still until the account's trackers are in, so nothing flashes on the way.
  if (isRestoring()) return <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: colors.muted, fontSize: 14 }}>Bringing in your trackers…</Text></View>;
  if (needsAccount) return <View style={s.screen}>{bar}<AuthScreen /></View>;

  // Where "back" goes from Progress, Settings and flows: the tracker you were on, else the first one.
  const here = state.trackers.find((t) => t.id === lastId) ?? state.trackers[0];
  const backToTracker = () => setNav(here ? { name: 'tracker', id: here.id } : { name: 'setup' });

  if (!state.onboarded) return <View style={s.screen} />; // a moment while the defaults are put in place

  // The countdown and the timer sit just above the bottom bar on any tracker that has them switched on.
  const toolTracker = nav.name === 'tracker' ? state.trackers.find((t) => t.id === nav.id) : undefined;

  // While the countdown is being typed, the page makes room for the keyboard and the navigation steps aside.
  const lift = editingTool ? keyboard : 0;

  const place = nav.name === 'tracker' ? state.trackers.findIndex((t) => t.id === nav.id) : nav.name === 'overview' ? state.trackers.length : nav.name === 'settings' ? state.trackers.length + 1 : -1;
  const dir: -1 | 0 | 1 = place < 0 || spot.current === null || spot.current < 0 || place === spot.current ? 0 : place > spot.current ? 1 : -1;
  spot.current = place;
  let body;
  let showBar = false;
  if (nav.name === 'welcome') {
    body = <Welcome onDone={nav.revisit ? () => setNav({ name: 'setup' }) : undefined} />;
  } else if (nav.name === 'tracker') {
    showBar = true;
    body = (
      <TrackerScreen
        key={nav.id} id={nav.id}
        setup={() => setNav({ name: 'setup', id: nav.id })}
      />
    );
  } else if (nav.name === 'setup') {
    const editId = nav.id;
    body = (
      <SetupFlow
        key={editId ?? 'new'}
        trackerId={editId}
        // Leaving setup: back to the tracker being edited; if it was just deleted and was the last one, straight to making a new
        // one (never an empty page with only the bar).
        cancel={() => { const now = getState().trackers; if (editId && now.some((t) => t.id === editId)) setNav({ name: 'tracker', id: editId }); else if (now.length === 0) setNav({ name: 'setup' }); else backToTracker(); }}
        done={(id) => setNav({ name: 'tracker', id })}
        toWelcome={() => setNav({ name: 'welcome', revisit: true })}
      />
    );
  } else if (nav.name === 'overview') {
    showBar = true;
    body = <Overview />;
  } else if (nav.name === 'settings') {
    showBar = true;
    body = <Settings />;
  } else {
    body = <View style={s.screen} />; // launching
  }

  return (
    <View style={[s.screen, lift > 0 ? { paddingBottom: lift + 6 } : null]}>
      {bar}
      <View style={{ flex: 1, overflow: 'hidden' }}>{nav.name === 'tracker' || nav.name === 'settings' || nav.name === 'overview' ? <SwipeIn key={nav.name === 'tracker' ? nav.id : nav.name} dir={dir}>{body}</SwipeIn> : body}</View>
      {toolTracker?.tools.countdown ? <CountdownBar key={`c${toolTracker.id}`} trackerId={toolTracker.id} name={toolTracker.name} into={toolTracker.tools.countdownInto} onEditing={setEditingTool} /> : null}
      {toolTracker?.tools.timer ? <TimerBar key={`t${toolTracker.id}`} trackerId={toolTracker.id} name={toolTracker.name} into={toolTracker.tools.timerInto} /> : null}
      {showBar && lift === 0 ? (
        <TrackerBar
          currentId={nav.name === 'tracker' ? nav.id : undefined} settingsOpen={nav.name === 'settings'} overviewOpen={nav.name === 'overview'}
          onOverview={() => setNav({ name: 'overview' })}
          onSettings={() => setNav({ name: 'settings' })}
          onOpen={(id) => setNav({ name: 'tracker', id })}
          onAdd={() => setNav({ name: 'setup' })}
        />
      ) : null}
      {/* Screens without the bar still get a block of the theme under them, where the phone's own navigation sits, so nothing scrolls behind it */}
      {!showBar && lift === 0 && bottomInset > 0 ? <View style={{ height: bottomInset, backgroundColor: colors.bg }} /> : null}
    </View>
  );
}
