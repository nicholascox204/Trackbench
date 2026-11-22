// For testing a first run as a new person would see it: take back every permission the app was given and forget which
// source each tracker was set to follow. The app closes at the end (Android applies the change when the app is closed).
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { revokeAllPermissions } from 'react-native-health-connect';
import { getState, updateTracker } from './store';

export async function resetAllPermissions(): Promise<void> {
  try {
    await revokeAllPermissions(); // Health Connect
  } catch {
    // Health Connect is not on this phone, or had nothing to take back
  }
  for (const t of getState().trackers) {
    if (t.sources) updateTracker(t.id, { sources: undefined });
  }
  if (Platform.OS === 'android') {
    try {
      requireOptionalNativeModule<{ resetPermissions(): boolean }>('TrackbenchSteps')?.resetPermissions();
    } catch {
      // an older build without it: the permissions can still be removed in the phone's app settings
    }
  }
}
