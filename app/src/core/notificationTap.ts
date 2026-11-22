// Tapping one of our notifications (a running timer, a finished countdown) opens the tracker it belongs to. Android only, in the
// development build; anywhere else the library is missing and all of this quietly does nothing.

import { Platform } from 'react-native';
import { setTapTarget } from './tapTarget';

type Loaded = typeof import('react-native-notify-kit');
const idFrom = (n: { data?: Record<string, unknown> } | undefined | null): string | undefined => (typeof n?.data?.trackerId === 'string' ? (n.data.trackerId as string) : undefined);

function kit(): Loaded | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-notify-kit') as Loaded;
  } catch {
    return null;
  }
}

// Called once when the app starts, before anything renders: taps while the app is in the background arrive here.
export function registerBackgroundTaps(): void {
  const m = kit();
  if (!m) return;
  try {
    m.default.onBackgroundEvent(async ({ type, detail }) => {
      if (type === m.EventType.PRESS) setTapTarget(idFrom(detail.notification));
    });
  } catch {
    // not available
  }
}

// The notification that started the app from closed, if one did.
export async function initialTap(): Promise<void> {
  const m = kit();
  if (!m) return;
  try {
    const first = await m.default.getInitialNotification();
    setTapTarget(idFrom(first?.notification));
  } catch {
    // not available
  }
}

// Taps while the app is open.
export function listenForegroundTaps(): () => void {
  const m = kit();
  if (!m) return () => {};
  try {
    return m.default.onForegroundEvent(({ type, detail }) => {
      if (type === m.EventType.PRESS) setTapTarget(idFrom(detail.notification));
    });
  } catch {
    return () => {};
  }
}
