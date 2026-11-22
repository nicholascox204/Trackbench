// A running stopwatch or countdown shown in the notification area, ticking by itself: Android counts the time on screen, so
// it costs no battery and works with the app closed or the phone locked ("layer 2" of docs/spec-tools.md; the alert for a
// countdown reaching zero is still countdownNotice.ts). It needs the development build; on the web, in Expo Go or with the
// permission refused it does nothing and the timer carries on as before.

import { Platform } from 'react-native';

import { LIVE_CHANNEL, liveId, liveSpec, type LiveKind } from './liveSpec';

type Kit = typeof import('react-native-notify-kit').default;
let mod: Kit | null | undefined;

async function load(): Promise<Kit | null> {
  if (Platform.OS !== 'android') return null;
  if (mod !== undefined) return mod;
  try {
    const m = (await import('react-native-notify-kit')).default;
    // Low importance: it sits in the panel without a sound or a pop-up each time it starts.
    await m.createChannel({ id: LIVE_CHANNEL, name: 'Running timers', importance: 2, visibility: 1 });
    mod = m;
  } catch {
    mod = null;
  }
  return mod;
}

export async function showLive(kind: LiveKind, trackerId: string, name: string, at: number, lengthSeconds?: number): Promise<void> {
  const n = await load();
  if (!n) return;
  try {
    await n.requestPermission();
    await n.displayNotification(liveSpec(kind, trackerId, name, at, Date.now(), lengthSeconds) as never);
  } catch {
    // no permission, or the module is missing: the timer still works
  }
}

export async function clearLive(trackerId: string): Promise<void> {
  const n = await load();
  if (!n) return;
  try {
    await n.cancelNotification(liveId(trackerId));
  } catch {
    // nothing was showing
  }
}
