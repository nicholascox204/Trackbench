// Talking to Health Connect for healthImport.ts: whether it is there and allowed, asking, and reading one kind of record.
import { Platform } from 'react-native';
import { RECORD, RUN_TYPES, type HealthItem, type HealthKind } from './healthImport';

export type HealthLink = 'unavailable' | 'needs-install' | 'not-allowed' | 'allowed';

async function hc() { return import('react-native-health-connect'); }

export async function healthLink(kind: HealthKind): Promise<HealthLink> {
  if (Platform.OS !== 'android') return 'unavailable';
  try {
    const H = await hc();
    const status = await H.getSdkStatus();
    if (status === H.SdkAvailabilityStatus.SDK_UNAVAILABLE) return 'unavailable';
    if (status !== H.SdkAvailabilityStatus.SDK_AVAILABLE) return 'needs-install';
    if (!(await H.initialize())) return 'unavailable';
    const granted = await H.getGrantedPermissions();
    const need = kind === 'runs' ? ['ExerciseSession', 'Distance'] : [RECORD[kind]];
    return need.every((r) => granted.some((p) => 'recordType' in p && p.recordType === r && p.accessType === 'read')) ? 'allowed' : 'not-allowed';
  } catch {
    return 'unavailable';
  }
}

export async function allowHealth(kind: HealthKind): Promise<HealthLink> {
  try {
    const H = await hc();
    const perms = (kind === 'runs' ? ['ExerciseSession', 'Distance'] : [RECORD[kind]]).map((recordType) => ({ accessType: 'read', recordType }));
    await H.requestPermission(perms as never);
  } catch {
    // closed without answering
  }
  return healthLink(kind);
}

// Items of one kind from the last `days` days.
export async function readHealth(kind: HealthKind, days: number): Promise<HealthItem[] | { error: string }> {
  try {
    const H = await hc();
    const end = Date.now(); const start = end - days * 86400000;
    const timeRangeFilter = { operator: 'between' as const, startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() };
    const read = async (type: string): Promise<Record<string, unknown>[]> => ((await H.readRecords(type as never, { timeRangeFilter } as never)) as unknown as { records: Record<string, unknown>[] }).records;
    const id = (r: Record<string, unknown>) => String((r.metadata as { id?: string } | undefined)?.id ?? `${kind}:${String(r.time ?? r.startTime)}`);
    const t = (v: unknown) => new Date(String(v)).getTime();
    if (kind === 'weight') return (await read('Weight')).map((r) => ({ kind, id: id(r), at: t(r.time), kg: (r.weight as { inKilograms: number }).inKilograms }));
    if (kind === 'sleep') return (await read('SleepSession')).map((r) => ({ kind, id: id(r), start: t(r.startTime), end: t(r.endTime) }));
    if (kind === 'bloodPressure') return (await read('BloodPressure')).map((r) => ({ kind, id: id(r), at: t(r.time), top: (r.systolic as { inMillimetersOfMercury: number }).inMillimetersOfMercury, bottom: (r.diastolic as { inMillimetersOfMercury: number }).inMillimetersOfMercury }));
    if (kind === 'bloodSugar') return (await read('BloodGlucose')).map((r) => ({ kind, id: id(r), at: t(r.time), mgdl: (r.level as { inMilligramsPerDeciliter: number }).inMilligramsPerDeciliter, relation: Number(r.relationToMeal ?? 0) }));
    const sessions = (await read('ExerciseSession')).filter((r) => RUN_TYPES.includes(Number(r.exerciseType)));
    const out: HealthItem[] = [];
    for (const r of sessions) {
      const range = { operator: 'between' as const, startTime: String(r.startTime), endTime: String(r.endTime) };
      const agg = await H.aggregateRecord({ recordType: 'Distance', timeRangeFilter: range } as never).catch(() => null) as { DISTANCE?: { inMeters: number } } | null;
      out.push({ kind: 'runs', id: id(r), start: t(r.startTime), end: t(r.endTime), meters: agg?.DISTANCE?.inMeters ?? 0, type: Number(r.exerciseType) });
    }
    return out;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Bring new readings into one tracker from the last `days` days. Returns how many were added, or a sentence when it could not.
export async function bringIn(t: import('./types').Tracker, days: number): Promise<number | string> {
  const { healthKind, newFills } = await import('./healthImport');
  const { addEntries, getState, newEntryId } = await import('./store');
  const kind = healthKind(t);
  if (!kind) return 'This tracker does not take anything from Health Connect.';
  const link = await healthLink(kind);
  if (link !== 'allowed') return link === 'needs-install' ? 'Health Connect needs installing or updating first.' : link === 'unavailable' ? 'Health Connect is not available on this phone.' : 'Allow Trackbench to read it first.';
  const items = await readHealth(kind, days);
  if (!Array.isArray(items)) return `Could not read Health Connect: ${items.error}`;
  const fills = newFills(t, items, getState().entries);
  addEntries(fills.map((f) => ({ id: newEntryId(), trackerId: t.id, at: f.at, done: true, values: f.values })));
  return fills.length;
}

// On opening the app: every tracker set to keep bringing readings in gets the last week.
let busy = false;
export async function syncHealth(): Promise<void> {
  if (busy || Platform.OS !== 'android') return;
  busy = true;
  try {
    const { getState } = await import('./store');
    for (const t of getState().trackers.filter((x) => x.tools.health)) await bringIn(t, 7);
  } finally {
    busy = false;
  }
}
