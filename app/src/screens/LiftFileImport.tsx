// Importing lifting history from Strong or Hevy, from the tracker's setup. Both apps export every set as a CSV file (Strong:
// Settings, Export data; Hevy: Settings, Export and import data). Each set lands on the day it was lifted, under the exercise of
// the same name; warm-ups stay warm-ups; importing the same file again adds nothing.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { liftEntries, readLiftFile } from '../core/liftImport';
import { addEntries, getState, newEntryId } from '../core/store';
import { fieldUnit } from '../core/units';
import type { Settings, Tracker } from '../core/types';
import { Card, Chip, SmallButton, colors, s } from '../ui/kit';

// defer: the tracker is not saved yet, so the file is read now and brought in when it is.
export function LiftFileImport({ t, settings, defer }: { t: Tracker; settings: Settings; defer?: (job: (t: Tracker) => void) => void }) {
  const weight = t.fields.find((f) => f.unitKind === 'weight');
  const [unit, setUnit] = useState<'kg' | 'lb'>(weight && fieldUnit(weight, settings) === 'lb' ? 'lb' : 'kg');
  const [note, setNote] = useState('');
  const pick = async () => {
    try {
      const DocumentPicker = await import('expo-document-picker');
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const text = await (await fetch(res.assets[0].uri)).text();
      const file = readLiftFile(text, unit);
      if (!file || file.sets.length === 0) return setNote('That file is not a Strong or Hevy export. In either app, export your data as a CSV file and choose that.');
      if (defer) {
        defer((saved) => addEntries(liftEntries(saved, file, getState().entries, newEntryId).entries));
        return setNote(`${file.sets.length} sets from ${file.app} will be added when you save this tracker.`);
      }
      const { entries, matched, unmatched } = liftEntries(t, file, getState().entries, newEntryId);
      addEntries(entries);
      const days = new Set(entries.map((e) => new Date(e.at).toDateString())).size;
      setNote(
        entries.length === 0
          ? `Everything in this ${file.app} file is already here.`
          : `${entries.length} sets from ${days} workouts added from ${file.app}.` +
            (matched.length ? ` ${matched.length} exercise${matched.length === 1 ? '' : 's'} matched your plan.` : '') +
            (unmatched.length ? ` ${unmatched.length} ${unmatched.length === 1 ? 'is' : 'are'} not in your plan yet (${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? '…' : ''}); add an exercise with the same name and its history comes with it.` : ''),
      );
    } catch {
      setNote('Could not read that file.');
    }
  };
  return (
    <Card style={{ padding: 12, marginTop: 8 }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>Import from Strong or Hevy</Text>
      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 10 }}>Export your workouts as a CSV file in either app, then choose it here. Sets are added on the days you lifted them.</Text>
      <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>If the file does not say, its weights are in</Text>
      <View style={[s.wrap, { marginBottom: 8 }]}>
        <Chip label="kg" active={unit === 'kg'} onPress={() => setUnit('kg')} />
        <Chip label="lb" active={unit === 'lb'} onPress={() => setUnit('lb')} />
      </View>
      <View style={{ alignSelf: 'flex-start' }}><SmallButton label="Choose file" onPress={pick} /></View>
      {note ? <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>{note}</Text> : null}
    </Card>
  );
}
