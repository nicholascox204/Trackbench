// A goal's progress, made obvious: a thick bar, the numbers, and what is left. Green when met, red when over.

import { Text, View } from 'react-native';
import type { GoalProgress } from '../core/goals';
import { Icon, colors, s } from './kit';

type Shown = Pick<GoalProgress, 'headline' | 'fraction' | 'status' | 'detail'>;

export const statusColor = (status: Shown['status']): string =>
  status === 'met' ? colors.done : status === 'over' ? colors.danger : status === 'missed' ? colors.muted : colors.accent;

export function GoalBar({ title, p, compact }: { title: string; p: Shown; compact?: boolean }) {
  const color = statusColor(p.status);
  const fill = p.fraction <= 0 ? 0 : Math.max(0.04, Math.min(1, p.fraction));
  return (
    <View>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
        <View style={[s.row, { flex: 1, marginRight: 10 }]}>
          {p.status === 'met' ? <View style={{ marginRight: 6 }}><Icon name="checkmark-circle" size={18} color={colors.done} /></View> : null}
          <Text style={{ color: colors.text, fontSize: compact ? 14 : 16, fontWeight: '700', flexShrink: 1 }} numberOfLines={2}>{title}</Text>
        </View>
        <Text style={{ color, fontSize: compact ? 13 : 14, fontWeight: '700' }}>{p.headline}</Text>
      </View>
      <View style={{ height: compact ? 10 : 14, borderRadius: 7, backgroundColor: colors.raised, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${fill * 100}%`, borderRadius: 7, backgroundColor: color }} />
      </View>
      {p.detail ? <Text style={{ color: p.status === 'over' ? colors.danger : colors.muted, fontSize: 12, marginTop: 5 }}>{p.detail}</Text> : null}
    </View>
  );
}
