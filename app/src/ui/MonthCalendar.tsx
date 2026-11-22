// A month you can open from the week strip to jump to any day. Each day shows how it went.

import { Text, View } from 'react-native';
import { addDays, startOfDay } from '../core/time';
import { Icon, Tap, colors, s } from './kit';
import { px } from '../ui/theme';

export type DayState = 'hit' | 'some' | 'none';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const startOfMonth = (ts: number): number => { const d = new Date(ts); return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1).getTime()); };
const shiftMonth = (ts: number, n: number): number => { const d = new Date(ts); return startOfDay(new Date(d.getFullYear(), d.getMonth() + n, 1).getTime()); };

export function MonthCalendar({
  month, setMonth, selected, today, stateOf, canPickFuture, onPick,
}: {
  month: number; setMonth: (m: number) => void; selected: number; today: number;
  stateOf: (day: number) => DayState; canPickFuture: boolean; onPick: (day: number) => void;
}) {
  const first = new Date(month);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const start = addDays(month, -lead);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const dots: Record<DayState, string> = { hit: colors.done, some: colors.accent, none: colors.border };
  const forward = month < startOfMonth(today) || canPickFuture;

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: px(1), borderRadius: 12, padding: 10, marginBottom: 12 }}>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
        <Tap onPress={() => setMonth(shiftMonth(month, -1))} style={{ padding: 6 }}><Icon name="chevron-back" size={20} color={colors.accent} /></Tap>
        <Tap onPress={() => { setMonth(startOfMonth(today)); onPick(today); }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{MONTHS[first.getMonth()]} {first.getFullYear()}</Text>
        </Tap>
        <Tap onPress={() => setMonth(shiftMonth(month, 1))} disabled={!forward} style={{ padding: 6, opacity: forward ? 1 : 0.3 }}><Icon name="chevron-forward" size={20} color={colors.accent} /></Tap>
      </View>
      <View style={[s.row, { marginBottom: 4 }]}>
        {LABELS.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 11 }}>{l}</Text>)}
      </View>
      {Array.from({ length: weeks }, (_, w) => (
        <View key={w} style={s.row}>
          {Array.from({ length: 7 }, (_, i) => {
            const d = addDays(start, w * 7 + i);
            const inMonth = new Date(d).getMonth() === first.getMonth();
            const future = d > today;
            const disabled = future && !canPickFuture;
            const sel = d === selected;
            return (
              <Tap
                key={i} disabled={disabled} onPress={() => onPick(d)}
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: 5, marginVertical: 1, marginHorizontal: 1, borderRadius: 8, borderWidth: px(1),
                  borderColor: sel ? colors.done : 'transparent', backgroundColor: sel ? colors.doneBg : 'transparent', opacity: !inMonth ? 0.35 : disabled ? 0.4 : 1,
                }}
              >
                <Text style={{ color: d === today ? colors.text : colors.muted, fontSize: 13, fontWeight: d === today ? '800' : '500' }}>{new Date(d).getDate()}</Text>
                <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 3, backgroundColor: future ? 'transparent' : dots[stateOf(d)] }} />
              </Tap>
            );
          })}
        </View>
      ))}
    </View>
  );
}
