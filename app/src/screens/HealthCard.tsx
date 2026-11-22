// A Steps tracker can fill itself from the phone's own step counter or from Health Connect, or be entered by hand. The card says
// where that stands, offers the one next step, and keeps the choice one tap away at any time.
import { useCallback, useEffect, useState } from 'react';
import { AppState as RNAppState, Text, View } from 'react-native';
import { allowCounter, counterAllowed, counterAvailable, counterStepsOn, startCounting } from '../core/stepCounter';
import { allowSteps, getHealthConnect, openHealthSettings, stepsLink, stepsOn, type StepsLink } from '../core/healthSteps';
import { sourceOf, stepsFieldOf, type StepSource } from '../core/healthSync';
import { setAutoValue } from '../core/autoValue';
import { saveDaily, updateTracker } from '../core/store';
import { startOfDay } from '../core/time';
import type { Entry, Tracker } from '../core/types';
import { Button, Card, Toggle, colors } from '../ui/kit';

export { stepsFieldOf };

// How often the page asks while it is open. The phone's counter reports within seconds; Health Connect only changes when the
// source app writes to it, in batches, so asking it more often gains nothing.
export const SENSOR_POLL_MS = 5000;
export const HEALTH_POLL_MS = 20000;

interface Body { t: Tracker; day: number; entries: Entry[]; fieldId: string; chosen: StepSource | undefined; choose: (m: StepSource) => void }

export function HealthCard({ t, day, entries }: { t: Tracker; day: number; entries: Entry[] }) {
  const field = stepsFieldOf(t);
  if (!field) return null;
  const hasCounter = counterAvailable();
  const chosen = sourceOf(t);
  const mode: StepSource = chosen ?? (hasCounter ? 'sensor' : 'health');

  const choose = (m: StepSource): void => updateTracker(t.id, { sources: { ...(t.sources ?? {}), [field.id]: m } });
  const auto = mode !== 'manual';
  const body: Body = { t, day, entries, fieldId: field.id, chosen, choose };

  return (
    <Card style={{ padding: 12, marginBottom: 8 }}>
      <Toggle label="Fill in automatically" value={auto} onChange={(v) => choose(v ? (hasCounter ? 'sensor' : 'health') : 'manual')} />
      {mode === 'sensor' ? <SensorBody {...body} /> : null}
      {mode === 'health' ? <HealthBody {...body} /> : null}

    </Card>
  );
}

// Writes the day's number into the field when it differs.
function follow(t: Tracker, fieldId: string, day: number, entries: Entry[], n: number): void {
  setAutoValue(t.id, day, n);
  const have = entries.find((e) => e.trackerId === t.id && e.done && e.at >= day && e.at < day + 86400000)?.values[fieldId];
  if (have !== n) saveDaily(t.id, { [fieldId]: n }, day);
}

function SensorBody({ t, day, entries, fieldId, chosen, choose }: Body) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    const ok = await counterAllowed();
    setAllowed(ok);
    if (!ok) return;
    startCounting();
    if (!chosen) choose('sensor');
    const n = await counterStepsOn(day);
    if (n !== null && (n > 0 || day === startOfDay(Date.now()))) follow(t, fieldId, day, entries, n);
  }, [day, entries, t, fieldId, chosen, choose]);

  useEffect(() => {
    void refresh();
    const sub = RNAppState.addEventListener('change', (st) => { if (st === 'active') void refresh(); });
    const timer = setInterval(() => { if (RNAppState.currentState === 'active') void refresh(); }, SENSOR_POLL_MS);
    return () => { sub.remove(); clearInterval(timer); };
  }, [refresh]);

  if (allowed === null) return null;
  if (!allowed) {
    return (
      <View>
        <Text style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>Count steps with your phone</Text>
        <Button label="Allow Trackbench to count steps" onPress={async () => { if (await allowCounter()) { choose('sensor'); void refresh(); } }} />
      </View>
    );
  }
  return null;
}

function HealthBody({ t, day, entries, fieldId, chosen, choose }: Body) {
  const [link, setLink] = useState<StepsLink | null>(null);
  const [steps, setSteps] = useState<number | null>(null);
  const [problem, setProblem] = useState(false);
  const [asked, setAsked] = useState(false);

  const refresh = useCallback(async () => {
    const l = await stepsLink();
    setLink(l);
    if (l !== 'allowed') return;
    // Allowed and never chosen: following Health Connect is kept as the choice, so other days fill in too.
    if (!chosen) choose('health');
    const n = await stepsOn(day);
    // Health Connect said no after all (the allow was taken away, or has not taken hold): treat it as not allowed.
    if (typeof n === 'object' && /permission/i.test(n.error)) { setLink('not-allowed'); setAsked(true); return; }
    // The raw reason stays out of sight; the card only says that steps could not be read.
    if (typeof n === 'object') console.warn('Health Connect steps:', n.error);
    setProblem(typeof n === 'object');
    setSteps(typeof n === 'number' ? n : null);
    if (typeof n === 'number' && n > 0) follow(t, fieldId, day, entries, n);
  }, [day, entries, t, fieldId, chosen, choose]);

  useEffect(() => {
    void refresh();
    const sub = RNAppState.addEventListener('change', (st) => { if (st === 'active') void refresh(); });
    const timer = setInterval(() => { if (RNAppState.currentState === 'active') void refresh(); }, HEALTH_POLL_MS);
    return () => { sub.remove(); clearInterval(timer); };
  }, [refresh]);

  if (link === null) return null;
  if (link === 'unavailable') return <Text style={{ color: colors.text, fontSize: 15 }}>Health Connect is not on this phone</Text>;
  if (link === 'allowed') {
    return (
      <View>
        <Text style={{ color: colors.text, fontSize: 15 }}>
          {steps && steps > 0 ? `Steps from Health Connect: ${steps.toLocaleString()}` : problem ? 'Steps are not reading right now' : 'No steps in Health Connect for this day'}
        </Text>
        {steps === 0 || problem ? <View style={{ marginTop: 8 }}><Button label="Open Health Connect" variant="ghost" onPress={openHealthSettings} /></View> : null}
      </View>
    );
  }
  if (link === 'needs-install') return <View><Button label="Get Health Connect" onPress={getHealthConnect} /></View>;
  return (
    <View>
      <Text style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>{asked ? 'Steps are off for Trackbench' : 'Read steps from Health Connect'}</Text>
      <Button
        label={asked ? 'Open Health Connect' : 'Allow Trackbench to read steps'}
        onPress={async () => {
          if (asked) { openHealthSettings(); return; }
          const l = await allowSteps();
          setAsked(true);
          setLink(l);
          if (l === 'allowed') { choose('health'); void refresh(); }
        }}
      />
    </View>
  );
}
