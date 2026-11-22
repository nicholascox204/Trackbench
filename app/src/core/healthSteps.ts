// Steps from Health Connect (Android's shared store that Samsung Health, Fitbit, Garmin and others write into).
// Everything here asks first and says plainly what state things are in; nothing is read without the person's allow.
import { Linking, Platform } from 'react-native';
import { SdkAvailabilityStatus, aggregateRecord, getGrantedPermissions, getSdkStatus, initialize, openHealthConnectSettings, readRecords, requestPermission } from 'react-native-health-connect';

export type StepsLink = 'unavailable' | 'needs-install' | 'not-allowed' | 'allowed';

const STEPS_PERMISSION = { accessType: 'read', recordType: 'Steps' } as const;
const PROVIDER = 'com.google.android.apps.healthdata';

// Where things stand, without asking for anything.
export async function stepsLink(): Promise<StepsLink> {
  if (Platform.OS !== 'android') return 'unavailable';
  try {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE) return 'unavailable';
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) return 'needs-install';
    if (!(await initialize())) return 'unavailable';
    const granted = await getGrantedPermissions();
    return granted.some((p) => 'recordType' in p && p.recordType === 'Steps' && p.accessType === 'read') ? 'allowed' : 'not-allowed';
  } catch {
    return 'unavailable';
  }
}

// The standard Android allow screen. Returns the new state.
export async function allowSteps(): Promise<StepsLink> {
  try {
    await requestPermission([STEPS_PERMISSION]);
  } catch {
    // closed without answering
  }
  return stepsLink();
}

// Steps for one day (start of day to the end of it, or to now for today). The total Health Connect works out (it counts
// each step once even when two apps report it), or, if that fails, the records added up; an error comes back as text.
export async function stepsOn(dayStart: number): Promise<number | { error: string }> {
  const end = Math.min(dayStart + 86400000, Date.now());
  if (end <= dayStart) return 0;
  const timeRangeFilter = { operator: 'between' as const, startTime: new Date(dayStart).toISOString(), endTime: new Date(end).toISOString() };
  try {
    const r = await aggregateRecord({ recordType: 'Steps', timeRangeFilter });
    const n = Math.round(r.COUNT_TOTAL ?? 0);
    if (n > 0) return n;
  } catch {
    // fall through to the records
  }
  try {
    const r = await readRecords('Steps', { timeRangeFilter });
    return Math.round(r.records.reduce((sum, x) => sum + (x.count ?? 0), 0));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export const openHealthSettings = (): void => {
  try {
    openHealthConnectSettings();
  } catch {
    // nothing to open
  }
};

export const getHealthConnect = (): void => {
  void Linking.openURL(`market://details?id=${PROVIDER}`).catch(() => undefined);
};
