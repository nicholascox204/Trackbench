// The clock on a fasting or sleep tracker: one tap when it starts ("Last meal now", "Bedtime now") and one when it ends; the
// time between runs live, and ending it saves both times on the day it ended. Times can still be typed in the form below.
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { clockStart, setClockStart, spanPair, spanValues } from '../core/spanClock';
import { saveDaily } from '../core/store';
import { startOfDay } from '../core/time';
import { formatTime } from '../core/units';
import type { Tracker } from '../core/types';
import { Button, Card, Tap, colors } from '../ui/kit';

const hm = (ms: number): string => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

export function SpanClockCard({ t }: { t: Tracker }) {
  const p = spanPair(t);
  const [start, setStart] = useState<number | undefined>(undefined);
  const [now, setNow] = useState(Date.now());
  const [sure, setSure] = useState(false);
  useEffect(() => { void clockStart(t).then(setStart); }, [t.id]);
  useEffect(() => {
    if (start === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [start]);
  if (!p) return null;
  const begin = () => { const at = Date.now(); setStart(at); setNow(at); void setClockStart(t, at); };
  const end = () => {
    if (start === undefined) return;
    const at = Date.now();
    saveDaily(t.id, spanValues(p, start, at), startOfDay(at));
    setStart(undefined); setSure(false);
    void setClockStart(t, undefined);
  };
  const cancel = () => { if (!sure) return setSure(true); setStart(undefined); setSure(false); void setClockStart(t, undefined); };
  return (
    <Card keep style={{ padding: 14, marginBottom: 12 }}>
      {start === undefined ? (
        <Button label={`${p.from.name} now`} onPress={begin} />
      ) : (
        <View>
          <Text style={{ color: colors.text, fontSize: 40, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{hm(now - start)}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>{`${p.measure.name}, since ${formatTime(new Date(start).getHours() * 60 + new Date(start).getMinutes())}`}</Text>
          <Button label={`${p.to.name} now`} onPress={end} />
          <Tap onPress={cancel} style={{ alignSelf: 'center', paddingVertical: 8, marginTop: 4 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{sure ? 'Tap again to clear the clock' : 'Started by mistake? Clear it'}</Text>
          </Tap>
        </View>
      )}
    </Card>
  );
}
