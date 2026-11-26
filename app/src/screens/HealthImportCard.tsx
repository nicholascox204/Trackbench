// In a tracker's setup: bring readings in from Health Connect (where watches, scales and health apps write). Says plainly where
// things stand, asks with Android's own screen, brings in the last 30 days on a tap, and can keep doing it when the app opens.
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { HEALTH_LABEL, healthKind } from '../core/healthImport';
import { allowHealth, bringIn, healthLink, type HealthLink } from '../core/healthRead';
import type { Tracker } from '../core/types';
import { Card, SmallButton, Toggle, colors } from '../ui/kit';

export function HealthImportCard({ t, keep, setKeep }: { t: Tracker; keep: boolean; setKeep: (v: boolean) => void }) {
  const kind = healthKind(t);
  const [link, setLink] = useState<HealthLink | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => { if (kind) void healthLink(kind).then(setLink); }, [kind]);
  if (!kind || link === 'unavailable') return null;
  const what = HEALTH_LABEL[kind];
  const bring = async () => {
    setNote('Bringing them in…');
    const r = await bringIn(t, 30);
    setNote(typeof r === 'string' ? r : r === 0 ? 'Nothing new in the last 30 days.' : `${r} added from the last 30 days.`);
  };
  return (
    <Card style={{ padding: 12, marginTop: 8 }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{`Your ${what} from a watch or app`}</Text>
      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 10 }}>
        {`Samsung Health, Fitbit, Garmin, Withings and others can share ${what} through Health Connect. Anything you log by hand is left as it is.`}
      </Text>
      {link === 'needs-install' ? <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 8 }}>Health Connect needs installing or updating first.</Text> : null}
      {link === 'not-allowed' ? (
        <View style={{ alignSelf: 'flex-start' }}><SmallButton label="Allow Trackbench to read it" onPress={() => { void allowHealth(kind).then(setLink); }} /></View>
      ) : null}
      {link === 'allowed' ? (
        <View>
          <View style={{ alignSelf: 'flex-start', marginBottom: 4 }}><SmallButton label="Bring in the last 30 days" onPress={() => { void bring(); }} /></View>
          <Toggle label="Keep bringing it in" value={keep} onChange={setKeep} />
        </View>
      ) : null}
      {note ? <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>{note}</Text> : null}
    </Card>
  );
}
