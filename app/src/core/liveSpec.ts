// What the live notification for a running timer says (pure, so it can be tested without the phone).

export type LiveKind = 'timer' | 'countdown';

export interface LiveSpec {
  id: string;
  title: string;
  body: string;
  data: { trackerId: string };
  android: {
    channelId: string;
    ongoing: true;
    onlyAlertOnce: true;
    visibility: 1; // public: Samsung only turns a notification into a live one when its content may show on the lock screen
    autoCancel: false;
    showChronometer: true;
    chronometerDirection: 'up' | 'down';
    timestamp: number;
    timeoutAfter?: number;
    smallIcon: string;
    pressAction: { id: 'default' };
  };
}

export const LIVE_CHANNEL = 'live-timer';
export const liveId = (trackerId: string): string => `live-${trackerId}`;

// What to show. A stopwatch counts up from a moment placed so the clock reads the time already counted (so a resumed timer
// carries on from where it was); a countdown counts down to the moment it ends, and the notification goes away then, leaving
// the "finished" alert to speak for itself.
// "2 min", "1 min 30 s", "1 h 5 min": how long a countdown was set for.
export function lengthText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return r > 0 ? `${m} min ${r} s` : `${m} min`;
  return `${r} s`;
}

export function liveSpec(kind: LiveKind, trackerId: string, name: string, at: number, now: number, lengthSeconds?: number): LiveSpec {
  const down = kind === 'countdown';
  return {
    id: liveId(trackerId),
    title: name || (down ? 'Countdown' : 'Stopwatch'),
    body: down ? (lengthSeconds ? `${lengthText(lengthSeconds)} countdown` : 'Countdown running') : 'Stopwatch running',
    data: { trackerId }, // so a tap opens this tracker
    android: {
      channelId: LIVE_CHANNEL,
      ongoing: true,
      onlyAlertOnce: true,
      visibility: 1,
      autoCancel: false,
      showChronometer: true,
      chronometerDirection: down ? 'down' : 'up',
      timestamp: at,
      ...(down ? { timeoutAfter: Math.max(1000, at - now) } : {}),
      smallIcon: 'ic_launcher',
      pressAction: { id: 'default' },
    },
  };
}
