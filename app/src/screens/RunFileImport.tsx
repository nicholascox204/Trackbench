// Bringing runs in from files (GPX, as watches, Strava and most running apps export), from the tracker's setup rather than its
// daily screen. Each file becomes an entry on the day the run happened, with its distance, time and route.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { encodeRoute } from '../core/runRecorder';
import { parseGpx, simplifyRoute } from '../core/gpx';
import { runFill } from '../core/runImport';
import { logFree } from '../core/store';
import { startOfDay } from '../core/time';
import type { Tracker } from '../core/types';
import { Card, SmallButton, colors } from '../ui/kit';

export function RunFileImport({ t }: { t: Tracker }) {
  const [note, setNote] = useState('');
  const pick = async () => {
    try {
      const DocumentPicker = await import('expo-document-picker');
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      let added = 0; let skipped = 0;
      for (const a of res.assets) {
        const text = await (await fetch(a.uri)).text();
        const fill = runFill(t, text);
        if (!fill) { skipped++; continue; }
        const route = encodeRoute(simplifyRoute(parseGpx(text)));
        logFree(t.id, { ...fill.values, route }, startOfDay(fill.at ?? Date.now()));
        added++;
      }
      setNote(`${added} run${added === 1 ? '' : 's'} added${skipped ? `, ${skipped} file${skipped === 1 ? '' : 's'} had no route` : ''}.`);
    } catch {
      setNote('Could not read those files.');
    }
  };
  return (
    <Card style={{ padding: 12, marginTop: 8 }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>Import runs</Text>
      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 10 }}>GPX files from a watch or another running app. Each one is added on the day it was run, with its map.</Text>
      <View style={{ alignSelf: 'flex-start' }}><SmallButton label="Choose files" onPress={pick} /></View>
      {note ? <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>{note}</Text> : null}
    </Card>
  );
}
