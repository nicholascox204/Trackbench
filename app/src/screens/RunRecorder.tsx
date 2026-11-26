// Recording a run: a full screen with the live map, time, distance and pace, and Pause, Resume and Finish. When finished it shows
// the run and its splits, and saving puts distance, time and the route on today's entry. The recording itself lives in
// core/runSession.ts, so it carries on if this screen is closed or the phone is locked.
import { useEffect, useState } from 'react';
import { Modal, Text, View, useWindowDimensions } from 'react-native';
import { averagePace, climbMeters, currentPace, elapsedMs, encodeRoute, type RunState } from '../core/runRecorder';
import { beginRun, clearRun, discardRun, finishRun, onRun, pauseRun, recordsInBackground, resumeRun, runState, setSpoken, spoken } from '../core/runSession';
import { logFree } from '../core/store';
import { startOfDay } from '../core/time';
import { fieldUnit } from '../core/units';
import type { Settings, Tracker } from '../core/types';
import { Button, Tap, colors, useTopPad } from '../ui/kit';
import { RouteMap } from '../ui/RouteMap';

const clock = (ms: number): string => {
  const t = Math.floor(ms / 1000); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
const pace = (sec: number | undefined): string => (sec === undefined || !isFinite(sec) ? '–' : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`);

export function useRun(): RunState {
  const [s, setS] = useState(runState());
  useEffect(() => onRun(setS), []);
  return s;
}

export function RunRecorder({ t, settings, onClose }: { t: Tracker; settings: Settings; onClose: () => void }) {
  const s = useRun();
  const top = useTopPad();
  const { width, height } = useWindowDimensions();
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [voice, setVoice] = useState(spoken());
  const [sure, setSure] = useState(false);
  const dist = t.fields.find((f) => f.unitKind === 'distance');
  const time = t.fields.find((f) => f.type === 'duration');
  const unit: 'km' | 'mi' = dist && fieldUnit(dist, settings) === 'mi' ? 'mi' : 'km';
  const unitM = unit === 'mi' ? 1609.344 : 1000;
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const go = async () => { setError(''); const e = await beginRun(unit); if (e) setError(e); };
  const save = () => {
    const values: Record<string, number | string> = { route: encodeRoute(s.points) };
    if (dist) values[dist.id] = Math.round(s.meters) / 1000; // held in km
    if (time) values[time.id] = Math.max(1, Math.round(elapsedMs(s, now) / 60000));
    logFree(t.id, values, startOfDay(s.points[0]?.t ?? Date.now()));
    clearRun();
    onClose();
  };
  const w = Math.min(width, 600) - 32;
  const mapH = Math.max(220, Math.min(420, height * 0.42));
  const big = { color: colors.text, fontSize: 34, fontWeight: '700' as const };
  const small = { color: colors.muted, fontSize: 13 };
  const stat = (label: string, value: string) => (
    <View style={{ flex: 1 }}>
      <Text style={big}>{value}</Text>
      <Text style={small}>{label}</Text>
    </View>
  );
  const ms = elapsedMs(s, now);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: top, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{s.status === 'done' ? 'Your run' : 'Record a run'}</Text>
          <Tap onPress={onClose} style={{ padding: 8 }}><Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>{s.status === 'running' || s.status === 'paused' ? 'Hide' : 'Close'}</Text></Tap>
        </View>
        <RouteMap pts={s.points} w={w} h={mapH} live={s.status !== 'done'} />
        <View style={{ flexDirection: 'row', marginTop: 16 }}>
          {stat('Time', clock(ms))}
          {stat(unit === 'mi' ? 'Miles' : 'Kilometres', (s.meters / unitM).toFixed(2))}
        </View>
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          {s.status === 'done' ? stat(`Average pace /${unit}`, pace(averagePace(s, now, unitM))) : stat(`Pace now /${unit}`, pace(currentPace(s, unitM)))}
          {s.status === 'done' ? stat('Climb', `${climbMeters(s)} m`) : stat(`Average /${unit}`, pace(averagePace(s, now, unitM)))}
        </View>

        {s.status === 'done' && s.splits.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            {s.splits.map((sp) => <Text key={sp.n} style={{ color: colors.text, fontSize: 14, marginBottom: 2 }}>{`${unit} ${sp.n}   ${pace(sp.seconds)}`}</Text>)}
          </View>
        ) : null}

        {error ? <Text style={{ color: colors.muted, fontSize: 14, marginTop: 12 }}>{error}</Text> : null}
        {s.status === 'running' && !recordsInBackground() ? <Text style={{ ...small, marginTop: 10 }}>Keep Trackbench open: background location is off, so the run only records while the app is on screen.</Text> : null}

        <View style={{ flex: 1 }} />
        {s.status === 'idle' || s.status === 'done' ? null : (
          <Tap onPress={() => { setVoice(!voice); setSpoken(!voice); }} style={{ alignSelf: 'center', padding: 8, marginBottom: 6 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{voice ? `Spoken updates every ${unit} · on` : `Spoken updates · off`}</Text>
          </Tap>
        )}
        <View style={{ paddingBottom: 28, gap: 10 }}>
          {s.status === 'idle' ? <Button label="Start" onPress={go} /> : null}
          {s.status === 'running' ? <Button label="Pause" onPress={pauseRun} /> : null}
          {s.status === 'paused' ? <Button label="Resume" onPress={resumeRun} /> : null}
          {s.status === 'running' || s.status === 'paused' ? <Button label="Finish" onPress={() => { void finishRun(); }} /> : null}
          {s.status === 'done' ? <Button label="Save run" onPress={save} /> : null}
          {s.status === 'done' ? <Tap onPress={() => { if (sure) void discardRun(); else setSure(true); }} style={{ alignSelf: 'center', padding: 8 }}><Text style={{ color: colors.muted, fontSize: 14 }}>{sure ? 'Tap again to throw this run away' : 'Discard'}</Text></Tap> : null}
        </View>
      </View>
    </Modal>
  );
}
