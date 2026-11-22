// The card for something you are avoiding (No alcohol, Quit smoking). Not slipping is the progress, so the clean days lead: the streak is the
// big thing, and logging a slip is the small, secondary action. A slip can carry a note, for what set it off.

import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { bestClean, cleanDays, entriesOnDay } from '../core/derive';
import { logFree, undoLast, updateEntry, updateTracker } from '../core/store';
import { addDays } from '../core/time';
import type { Entry, Tracker } from '../core/types';
import { NoteInput } from '../ui/FieldInput';
import { NumInput } from '../ui/NumInput';
import { Button, Card, Muted, Tap, colors } from '../ui/kit';
import { EDGE } from '../ui/theme';

export function AvoidCard({ t, entries, day, today, editable }: { t: Tracker; entries: Entry[]; day: number; today: number; editable: boolean }) {
  const slip = entriesOnDay(entries, t.id, day).filter((e) => e.done).slice(-1)[0];
  const slipped = !!slip;
  const isToday = day === today;
  const clean = cleanDays(t, entries, today);
  const best = bestClean(t, entries, today);
  const saved = String(slip?.values?.note ?? '');
  const [note, setNote] = useState(saved);
  useEffect(() => { setNote(String(slip?.values?.note ?? '')); }, [slip?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (v: string) => {
    setNote(v);
    if (!slip) return;
    const { note: _drop, ...rest } = slip.values;
    void _drop;
    updateEntry(slip.id, v.trim() ? { ...rest, note: v } : rest);
  };

  const typed = useRef<number | undefined>(undefined);
  const [boxKey, setBoxKey] = useState(0);
  // The count can be typed: it replaces what is there (earlier slips no longer count), and slips from today on do.
  const setCount = (n: number) => { updateTracker(t.id, { cleanFrom: addDays(today, -Math.max(0, Math.round(n))), cleanSetOn: today }); setBoxKey((k) => k + 1); };
  const slipButton = editable ? <Button label={slipped ? 'Undo slip' : 'I slipped'} variant="ghost" onPress={() => (slipped ? undoLast(t.id, day) : logFree(t.id, {}, day))} /> : null;
  return (
    <Card tone={!slipped && clean > 0 ? 'done' : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {t.streak === false ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <View style={{ width: 84 }}>
              <NumInput
                key={`clean${boxKey}-${clean}`} value={clean} disabled={!editable || (slipped && isToday)}
                onCommit={(v) => { typed.current = v; }}
                onEnd={() => { const v = typed.current; typed.current = undefined; if (v !== undefined && v !== clean) setCount(v); else setBoxKey((k) => k + 1); }}
                style={{ fontSize: 24, fontWeight: '700', height: 46, borderRadius: 8 }}
              />
            </View>
            <Text style={{ color: clean > 0 ? colors.done : colors.text, fontSize: 18, fontWeight: '700', marginLeft: 10, flexShrink: 1 }} numberOfLines={1}>{clean === 1 ? 'day clean' : 'days clean'}</Text>
          </View>
        )}
        {t.streak === false ? <View style={{ flex: 1 }} /> : null}
        <View style={{ marginLeft: 8 }}>{slipButton}</View>
      </View>
      {t.streak === false ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>Best streak <Text style={{ color: colors.text, fontWeight: '700' }}>{best} day{best === 1 ? '' : 's'}</Text></Text>
          {editable ? (
            <Tap onPress={() => setCount(0)} accessibilityLabel="Reset streak" style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: EDGE, borderColor: colors.border }}>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>Reset streak</Text>
            </Tap>
          ) : null}
        </View>
      )}
      {slipped && (editable || saved) ? (
        <View style={{ marginTop: 14 }}>
          {editable ? <NoteInput value={note} onChange={save} placeholder="What set it off? (optional)" /> : <Muted>{saved}</Muted>}
        </View>
      ) : null}
    </Card>
  );
}
