// Recording a run: a full screen with the live map, time, distance and pace. It follows how running apps behave:
//   before:  your position on the map, the GPS signal, and Start (which waits for nothing; a weak signal just says so)
//   running: big numbers, one Pause button; nothing to end the run by accident
//   paused:  Resume, or Finish
//   done:    the run's map, numbers and splits; Save run, or Discard (asks twice)
// The recording lives in core/runSession.ts, so it carries on when this screen is hidden or the phone is locked; the tracker's
// card shows it is still going and opens this again.
import { useEffect, useState } from 'react';
import { Modal, Platform, Text, View, useWindowDimensions } from 'react-native';
import { simplifyRoute } from '../core/gpx';
import { averagePace, climbMeters, currentPace, elapsedMs, encodeRoute, type RunState } from '../core/runRecorder';
import {
  allowScreenOff, beginRun, clearRun, discardRun, finishRun, hereNow, onHere, onRun, pauseRun, prepareRun, recordsInBackground, resumeRun, runState, setSpoken, spoken,
} from '../core/runSession';
import { logFree } from '../core/store';
import { startOfDay } from '../core/time';
import { fieldUnit } from '../core/units';
import type { Settings, Tracker } from '../core/types';
import { Button, Scroll, Tap, colors, useTopPad } from '../ui/kit';
import { RouteMap } from '../ui/RouteMap';

export const clock = (ms: number): string => {
  const t = Math.floor(ms / 1000); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
export const pace = (sec: number | undefined): string => {
  if (sec === undefined || !isFinite(sec) || sec <= 0 || sec > 3600) return '–';
  const r = Math.round(sec);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
};

export function useRun(): RunState {
  const [s, setS] = useState(runState());
  useEffect(() => onRun(setS), []);
  return s;
}

// The run's unit follows the tracker's distance field (km or miles).
export function runUnit(t: Tracker, settings: Settings): { unit: 'km' | 'mi'; meters: number } {
  const dist = t.fields.find((f) => f.unitKind === 'distance');
  return dist && fieldUnit(dist, settings) === 'mi' ? { unit: 'mi', meters: 1609.344 } : { unit: 'km', meters: 1000 };
}

// Kept awake while a run is on screen: the numbers are what you glance at, and when screen-off recording is not allowed a
// sleeping screen would stop the run.
function useAwake(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    let off: (() => void) | undefined;
    import('expo-keep-awake').then((k) => { void k.activateKeepAwakeAsync('run'); off = () => { void k.deactivateKeepAwake('run'); }; }).catch(() => undefined);
    return () => off?.();
  }, [on]);
}

export function RunRecorder({ t, settings, onClose }: { t: Tracker; settings: Settings; onClose: () => void }) {
  const s = useRun();
  const top = useTopPad();
  const { width, height } = useWindowDimensions();
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [voice, setVoice] = useState(spoken());
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [here, setHere] = useState(hereNow());
  const [askedOff, setAskedOff] = useState(false);
  const dist = t.fields.find((f) => f.unitKind === 'distance');
  const time = t.fields.find((f) => f.type === 'duration');
  const { unit, meters: unitM } = runUnit(t, settings);
  const word = unit === 'mi' ? 'mile' : 'km';
  const climb = (m: number) => (unit === 'mi' ? `${Math.round(m * 3.28084)} ft` : `${m} m`);
  const active = s.status === 'running' || s.status === 'paused';
  useAwake(active);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => onHere(setHere), []);
  useEffect(() => { if (runState().status === 'idle') void prepareRun().then((e) => setError(e ?? '')); }, []);

  const go = async () => {
    setError(''); setBusy(true);
    const e = await beginRun(unit);
    setBusy(false);
    if (e) setError(e);
  };
  const save = () => {
    const values: Record<string, number | string> = { route: encodeRoute(simplifyRoute(s.points)) };
    if (dist) values[dist.id] = Math.round(s.meters) / 1000; // held in km
    if (time) values[time.id] = Math.max(1, Math.round(elapsedMs(s, now) / 60000));
    logFree(t.id, values, startOfDay(s.points[0]?.t ?? Date.now()));
    clearRun();
    onClose();
  };
  const discard = () => {
    if (!sure) return setSure(true);
    void discardRun();
    setSure(false);
  };

  const w = Math.min(width, 600) - 32;
  const mapH = Math.round(Math.max(200, Math.min(380, height * (s.status === 'done' ? 0.32 : 0.4))));
  const ms = elapsedMs(s, now);
  const signal = here?.acc === undefined ? undefined : here.acc <= 20 ? 'GPS signal good' : here.acc <= 50 ? 'GPS signal weak, it may settle in a moment' : 'GPS signal poor; open sky helps';

  const Stat = ({ label, value, size = 36 }: { label: string; value: string; size?: number }) => (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.text, fontSize: size, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>{label}</Text>
    </View>
  );
  const Note = ({ children }: { children: string }) => <Text style={{ color: colors.muted, fontSize: 13, marginTop: 10, textAlign: 'center' }}>{children}</Text>;
  const title = s.status === 'done' ? 'Your run' : s.status === 'paused' ? 'Paused' : s.status === 'running' ? 'Running' : 'Record a run';

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: top }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ color: s.status === 'paused' ? colors.accent : colors.text, fontSize: 22, fontWeight: '700' }}>{title}</Text>
          <Tap onPress={onClose} style={{ paddingVertical: 8, paddingLeft: 16 }}>
            <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>{active ? 'Hide' : 'Close'}</Text>
          </Tap>
        </View>

        <Scroll contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <RouteMap pts={s.points.length > 0 ? s.points : here ? [here] : []} w={w} h={mapH} live={s.status !== 'done'} empty={error ? 'No location' : undefined} />

          <View style={{ flexDirection: 'row', marginTop: 18 }}>
            <Stat label="Time" value={clock(ms)} />
            <Stat label={unit === 'mi' ? 'Miles' : 'Kilometres'} value={(s.meters / unitM).toFixed(2)} />
          </View>
          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            {s.status === 'done'
              ? <Stat size={24} label={`Average pace per ${word}`} value={pace(averagePace(s, now, unitM))} />
              : <Stat size={24} label={`Pace now per ${word}`} value={s.status === 'running' ? pace(currentPace(s, unitM)) : '–'} />}
            {s.status === 'done'
              ? <Stat size={24} label="Climb" value={climb(climbMeters(s))} />
              : <Stat size={24} label={`Average pace per ${word}`} value={pace(averagePace(s, now, unitM))} />}
          </View>

          {s.status === 'done' && s.splits.length > 0 ? (
            <View style={{ marginTop: 18 }}>
              <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 6 }}>Splits</Text>
              {s.splits.map((sp) => (
                <View key={sp.n} style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ color: colors.muted, fontSize: 14, width: 60 }}>{`${unit === 'mi' ? 'Mile' : 'Km'} ${sp.n}`}</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{pace(sp.seconds)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {error ? <Note>{error}</Note> : null}
          {s.status === 'idle' && !error && signal ? <Note>{signal}</Note> : null}
          {s.status === 'done' && s.meters < 50 ? <Note>This run is very short. Save it anyway, or discard it.</Note> : null}
          {active && !recordsInBackground() && Platform.OS !== 'web' ? (
            <View style={{ alignItems: 'center' }}>
              <Note>Recording while Trackbench is open. Locking the phone would stop it, so the screen stays on.</Note>
              {askedOff ? null : (
                <Tap onPress={() => { setAskedOff(true); void allowScreenOff(); }} style={{ paddingVertical: 8 }}>
                  <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>Allow recording with the screen off</Text>
                </Tap>
              )}
            </View>
          ) : null}
        </Scroll>

        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28, gap: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
          {active ? (
            <Tap onPress={() => { setVoice(!voice); setSpoken(!voice); }} style={{ alignSelf: 'center', paddingVertical: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{voice ? `Voice updates every ${word}: on` : 'Voice updates: off'}</Text>
            </Tap>
          ) : null}
          {s.status === 'idle' ? <Button label={busy ? 'Starting…' : 'Start'} onPress={go} disabled={busy || !!error && error.startsWith('Location is off')} /> : null}
          {s.status === 'running' ? <Button label="Pause" onPress={pauseRun} /> : null}
          {s.status === 'paused' ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button style={{ flex: 1 }} label="Resume" onPress={resumeRun} />
              <Button style={{ flex: 1 }} variant="ghost" label="Finish" onPress={() => { void finishRun(); }} />
            </View>
          ) : null}
          {s.status === 'done' ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button style={{ flex: 1 }} variant={sure ? 'danger' : 'ghost'} label={sure ? 'Tap to discard' : 'Discard'} onPress={discard} />
              <Button style={{ flex: 1 }} label="Save run" onPress={save} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// The run on the tracker's own screen: a Record button, or, while a run is going, what it has done so far and a way back in.
export function RunCard({ t, settings }: { t: Tracker; settings: Settings }) {
  const s = useRun();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { unit, meters } = runUnit(t, settings);
  const active = s.status === 'running' || s.status === 'paused';
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  const label = s.status === 'done' ? 'Save or discard your run' : active ? 'Open the run' : 'Record a run';
  return (
    <View style={{ marginBottom: 12 }}>
      {active || s.status === 'done' ? (
        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
          <Text style={{ color: s.status === 'paused' ? colors.accent : colors.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{s.status === 'done' ? 'Run finished' : s.status === 'paused' ? 'Run paused' : 'Run in progress'}</Text>
          <Text style={{ color: colors.text, fontSize: 15, fontVariant: ['tabular-nums'] }}>{`${clock(elapsedMs(s, now))} · ${(s.meters / meters).toFixed(2)} ${unit}`}</Text>
        </View>
      ) : null}
      <Button label={label} onPress={() => setOpen(true)} />
      {open ? <RunRecorder t={t} settings={settings} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}
