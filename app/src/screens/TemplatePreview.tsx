// One quiet line showing how a template is logged, in place of its description: the boxes you fill, the circles you tap,
// the list you tick. Built from the template's own fields, so it is never sample data and never out of date. Muted
// throughout and a single line that never wraps; whatever does not fit is cut at the edge.

import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { draftFromAnswers } from '../core/setup';
import { getState } from '../core/store';
import type { Template } from '../core/templates';
import type { Field } from '../core/types';
import { fieldUnit } from '../core/units';
import { Icon, colors } from '../ui/kit';
import { px } from '../ui/theme';

const H = 22;
const box = { height: H, borderWidth: px(1), borderColor: colors.border, borderRadius: 6, paddingHorizontal: 6, flexDirection: 'row' as const, alignItems: 'center' as const, marginRight: 5 };
const word = { color: colors.muted, fontSize: 12 };

function Token({ f, title }: { f: Field; title?: string }) {
  const unit = fieldUnit(f, getState().settings);
  if (f.type === 'rating') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
        {f.name !== title ? <Text style={[word, { marginRight: 4 }]}>{f.name}</Text> : null}
        {[0, 1, 2, 3, 4].map((i) => <View key={i} style={{ width: 8, height: 8, borderRadius: 4, borderWidth: px(1), borderColor: colors.muted, marginRight: 2 }} />)}
      </View>
    );
  }
  const icon = f.type === 'time' ? 'time-outline' : f.type === 'choice' ? undefined : f.type === 'text' ? 'create-outline' : undefined;
  return (
    <View style={box}>
      {icon ? <View style={{ marginRight: 3 }}><Icon name={icon} size={12} color={colors.muted} /></View> : null}
      <Text style={word} numberOfLines={1}>{f.name}</Text>
      {unit && f.type !== 'time' ? <Text style={[word, { marginLeft: 3, opacity: 0.7 }]}>{unit}</Text> : null}
      {f.type === 'choice' ? <View style={{ marginLeft: 2 }}><Icon name="chevron-down" size={11} color={colors.muted} /></View> : null}
    </View>
  );
}

export function TemplatePreview({ t }: { t: Template }) {
  const draft = useMemo(() => draftFromAnswers({ ...t.make(), name: t.name }, getState().settings), [t]);
  const fields = draft.fields.filter((f) => !f.label);
  // Text fields only show when they are all there is (a journal); otherwise the numbers and choices say more.
  const shown = fields.some((f) => f.type !== 'text') ? fields.filter((f) => f.type !== 'text') : fields;
  let body: React.ReactNode;
  if (draft.input === 'check') {
    body = (
      <>
        <Icon name={draft.avoid ? 'ban-outline' : 'ellipse-outline'} size={15} color={colors.muted} />
        <Text style={[word, { marginLeft: 5 }]}>{draft.avoid ? 'Log a slip' : 'Tap when done'}</Text>
      </>
    );
  } else if (draft.input === 'tap') {
    body = (
      <>
        {[0, 1, 2].map((i) => <View key={i} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.muted, opacity: 0.55, marginRight: 3 }} />)}
        <Text style={[word, { marginLeft: 3 }]}>{`+1 ${fields[0]?.unit ?? fields[0]?.name ?? ''}`.trim()}</Text>
      </>
    );
  } else if (draft.input === 'plan') {
    body = shown.length ? (
      <>
        <View style={{ marginRight: 5 }}><Icon name="square-outline" size={15} color={colors.muted} /></View>
        {shown.slice(0, 2).map((f, i) => <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center' }}>{i > 0 ? <Text style={[word, { marginRight: 5 }]}>×</Text> : null}<Token f={f} title={t.name} /></View>)}
      </>
    ) : (
      <>
        {['checkbox-outline', 'checkbox-outline', 'square-outline'].map((n, i) => <View key={i} style={{ marginRight: 3 }}><Icon name={n} size={15} color={colors.muted} /></View>)}
        <Text style={[word, { marginLeft: 3 }]}>Your list</Text>
      </>
    );
  } else {
    // A form: up to two boxes; two times in a row read as a span.
    const two = shown.slice(0, 2);
    const span = two.length === 2 && two[0].type === 'time' && two[1].type === 'time';
    body = two.map((f, i) => (
      <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
        {span && i === 1 ? <Text style={[word, { marginRight: 5 }]}>→</Text> : null}
        <Token f={f} title={t.name} />
      </View>
    ));
  }
  return <View style={{ flexDirection: 'row', alignItems: 'center', height: H, marginTop: 4, overflow: 'hidden' }}>{body}</View>;
}
