// The phone's own step counter, through our small native module. Before the app has been rebuilt with it the module is missing,
// and everything here says "not available" instead of failing.
import { PermissionsAndroid, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { parseLog, stepsInRange, withLive } from './stepLog';

interface Native {
  isAvailable(): boolean;
  readCounter(): Promise<number | null>;
  snapshot(): Promise<number | null>;
  readLog(): string;
  startBackground(): void;
}

const native: Native | null = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('TrackbenchSteps') : null;
const PERMISSION = 'android.permission.ACTIVITY_RECOGNITION' as const;

export const counterAvailable = (): boolean => {
  try {
    return !!native && native.isAvailable();
  } catch {
    return false;
  }
};

export async function counterAllowed(): Promise<boolean> {
  try {
    return await PermissionsAndroid.check(PERMISSION);
  } catch {
    return false;
  }
}

// The standard "allow physical activity" prompt. On yes, the 15-minute background saving starts.
export async function allowCounter(): Promise<boolean> {
  try {
    const r = await PermissionsAndroid.request(PERMISSION);
    if (r !== PermissionsAndroid.RESULTS.GRANTED) return false;
    startCounting();
    return true;
  } catch {
    return false;
  }
}

// Safe to call every time the app opens.
export function startCounting(): void {
  try {
    native?.startBackground();
  } catch {
    // nothing to start
  }
}

// Steps in one day: a reading now is saved, then the day is worked out from everything saved.
export async function counterStepsOn(dayStart: number, now: number = Date.now()): Promise<number | null> {
  if (!native) return null;
  try {
    const live = await native.snapshot();
    const points = withLive(parseLog(native.readLog()), now, live);
    return stepsInRange(points, dayStart, dayStart + 86400000);
  } catch {
    return null;
  }
}
