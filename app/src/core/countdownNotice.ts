// The alert for the countdown reaching zero, as a scheduled local notification, so it arrives when you have switched
// to another app or locked the phone. This is "layer 1" of docs/spec-tools.md: it works in Expo Go. A live ticking
// countdown in the notification panel ("layer 2") needs a development build and will sit behind these same two functions.
//
// expo-notifications is loaded on first use and every failure is swallowed: the countdown must keep working with no alert
// (on the web preview, in a build without the module, or with the permission refused).

import { Platform } from 'react-native';
import { lengthText } from './liveSpec';

type Notifications = typeof import('expo-notifications');

const CHANNEL = 'countdown';
let mod: Notifications | null | undefined;

async function load(): Promise<Notifications | null> {
  if (Platform.OS === 'web') return null;
  if (mod !== undefined) return mod;
  try {
    const m = await import('expo-notifications');
    m.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      // A channel has to exist before Android 13 will ask for permission.
      await m.setNotificationChannelAsync(CHANNEL, { name: 'Countdown', importance: m.AndroidImportance.HIGH, vibrationPattern: [0, 300, 150, 300] });
    }
    mod = m;
  } catch {
    mod = null;
  }
  return mod;
}

export type AlertResult = 'scheduled' | 'no-permission' | 'unavailable';

const idOf = (trackerId: string): string => `countdown-${trackerId}`;

// The alert like a clock app's: an exact alarm (it fires on the second even in battery saver, and the phone shows its alarm
// icon), a loud heads-up notification that keeps ringing until you open or dismiss it, and it gives up after two minutes.
// This is the development build's path; where the library is missing, the plain scheduled notification below is used.
const DONE_CHANNEL = 'timer-done';
type Kit = typeof import('react-native-notify-kit');
let kit: Kit | null | undefined;
async function loadKit(): Promise<Kit | null> {
  if (Platform.OS !== 'android') return null;
  if (kit !== undefined) return kit;
  try {
    const m = await import('react-native-notify-kit');
    await m.default.createChannel({
      id: DONE_CHANNEL, name: 'Timer finished', importance: m.AndroidImportance.HIGH, vibration: true,
      vibrationPattern: [0, 500, 300, 500, 300, 500], sound: 'default', bypassDnd: false,
    });
    kit = m;
  } catch {
    kit = null;
  }
  return kit;
}

async function scheduleWithKit(trackerId: string, trackerName: string, endsAt: number, lengthSeconds?: number): Promise<AlertResult | null> {
  const m = await loadKit();
  if (!m) return null;
  try {
    const s = await m.default.requestPermission();
    if (s.authorizationStatus === m.AuthorizationStatus.DENIED) return 'no-permission';
    await m.default.createTriggerNotification(
      {
        id: idOf(trackerId), title: "Time's up", body: lengthSeconds ? `${trackerName} · ${lengthText(lengthSeconds)}` : trackerName, data: { trackerId },
        android: {
          channelId: DONE_CHANNEL, category: m.AndroidCategory.ALARM, importance: m.AndroidImportance.HIGH,
          loopSound: true, autoCancel: true, timeoutAfter: 120000, pressAction: { id: 'default' }, smallIcon: 'ic_launcher',
        },
      },
      { type: m.TriggerType.TIMESTAMP, timestamp: endsAt, alarmManager: { type: m.AlarmType.SET_ALARM_CLOCK } },
    );
    return 'scheduled';
  } catch {
    return null;
  }
}

// Schedules (or replaces) the alert for this tracker's timer.
export async function scheduleCountdownEnd(trackerId: string, trackerName: string, endsAt: number, lengthSeconds?: number): Promise<AlertResult> {
  const viaKit = await scheduleWithKit(trackerId, trackerName, endsAt, lengthSeconds);
  if (viaKit) return viaKit;
  const n = await load();
  if (!n) return 'unavailable';
  try {
    let perm = await n.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await n.requestPermissionsAsync();
    if (!perm.granted) return 'no-permission';
    await n.scheduleNotificationAsync({
      identifier: idOf(trackerId),
      content: { title: 'Countdown finished', body: trackerName, sound: true },
      trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: endsAt, channelId: CHANNEL },
    });
    return 'scheduled';
  } catch {
    return 'unavailable';
  }
}

// Takes the "Time's up" alert off the screen and stops it ringing: used once you are in the app and can see the countdown.
export async function dismissAlert(trackerId: string): Promise<void> {
  const m = await loadKit();
  if (!m) return;
  try { await m.default.cancelDisplayedNotification(idOf(trackerId)); } catch { /* it was not showing */ }
}

export async function cancelCountdownEnd(trackerId: string): Promise<void> {
  const m = await loadKit();
  if (m) { try { await m.default.cancelTriggerNotification(idOf(trackerId)); await m.default.cancelNotification(idOf(trackerId)); } catch { /* nothing was scheduled */ } }
  const n = await load();
  if (!n) return;
  try {
    await n.cancelScheduledNotificationAsync(idOf(trackerId));
  } catch {
    // nothing was scheduled
  }
}
