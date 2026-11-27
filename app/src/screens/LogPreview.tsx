// "When you log, you'll see": a small working copy of the logging controls, built from what is being set up, so the choices
// above turn into something you can look at and try. Nothing typed here is saved.

import { useState } from 'react';
import { Text, View } from 'react-native';
import type { Answers } from '../core/setup';
import { DEFAULT_TERMS } from '../core/terms';
import type { Field, Settings } from '../core/types';
import { FieldInput } from '../ui/FieldInput';
import { Card, Icon, Tap, colors, s } from '../ui/kit';
import { formatNumber } from '../core/units';
import { px } from '../ui/theme';

export function LogPreview({ a, fields, settings, countUnit }: { a: Answers; fields: Field[]; settings: Settings; countUnit?: string }) {
  const [values, setValues] = useState<Record<string, number | string>>({});
  const [done, setDone] = useState(false);
  const [count, setCount] = useState(0);
  const set = (id: string, v: number | string) => setValues((p) => ({ ...p, [id]: v }));
  const terms = { ...DEFAULT_TERMS, ...(a.terms ?? {}) };
  const button = (label: string, onPress: () => void) => (
    <Tap onPress={onPress} style={{ alignSelf: 'flex-end', backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 }}>
      <Text style={{ color: colors.onAccent, fontWeight: '700', fontSize: 14 }}>{label}</Text>
    </Tap>
  );
  const form = (fs: Field[]) => fs.map((f) => (
    <View key={f.id} style={{ marginBottom: 8 }}>
      <FieldInput f={f} value={values[f.id]} onChange={(v) => set(f.id, v)} settings={settings} />
    </View>
  ));

  let body: React.ReactNode;
  if (a.record === 'done') {
    body = (
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{a.avoid ? (done ? 'Slipped' : 'Clean so far') : done ? 'Done' : 'To do'}</Text>
        {button(a.avoid ? (done ? 'Undo slip' : 'I slipped') : done ? 'Undo' : 'Mark done', () => setDone((d) => !d))}
      </View>
    );
  } else if (a.record === 'count') {
    const step = a.countStep > 0 ? a.countStep : 1;
    body = (
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>{formatNumber(Math.round(count * 100) / 100)}{countUnit ? <Text style={{ color: colors.muted, fontSize: 15, fontWeight: '400' }}>{`  ${countUnit}`}</Text> : null}</Text>
        {button(`+${formatNumber(step)}`, () => setCount((c) => c + step))}
      </View>
    );
  } else if (a.log === 'plan') {
    const ticked = !!values.__tick;
    body = (
      <View>
        <Tap onPress={() => set('__tick', ticked ? '' : 'y')} style={[s.row, { paddingVertical: 4 }]}>
          <Icon name={ticked ? 'checkbox' : 'square-outline'} size={20} color={ticked ? colors.accent : colors.muted} />
          <Text style={{ color: colors.text, fontSize: 15, marginLeft: 8 }}>{terms.item}</Text>
        </Tap>
        {fields.length ? (
          <View style={{ marginTop: 8, paddingLeft: 10, borderLeftWidth: px(2), borderLeftColor: colors.border }}>
            {a.planStyle === 'sets' ? <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>{`${terms.row} 1`}</Text> : null}
            {form(fields)}
          </View>
        ) : null}
      </View>
    );
  } else {
    body = fields.length ? <View>{form(fields)}{button(a.daily ? 'Save today' : 'Log', () => setValues({}))}</View>
      : <Text style={{ color: colors.muted, fontSize: 14 }}>Add something to enter and it shows here.</Text>;
  }

  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>When you log, you'll see</Text>
      <Card style={{ padding: 12, borderStyle: 'dashed' }}>{body}</Card>
    </View>
  );
}
