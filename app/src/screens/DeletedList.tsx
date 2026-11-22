// Recently deleted trackers, with a way to bring each back. Shown in Settings, and on the first screen when no tracker is
// left (deleting the last one would otherwise leave no way to reach Settings).

import { Text, View } from 'react-native';
import { forgetDeleted, restoreTracker, useAppState } from '../core/store';
import { TRASH_MAX } from '../core/trash';
import { Button, Card, Muted, Tap, colors, s } from '../ui/kit';

export function DeletedList({ onRestored }: { onRestored?: () => void }) {
  const { state } = useAppState();
  const trash = state.trash ?? [];
  if (trash.length === 0) return null;
  return (
    <Card>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 2 }}>Recently deleted</Text>
      <Muted style={{ marginBottom: 8 }}>The last {TRASH_MAX} trackers you deleted, with their entries. Restoring puts one back at the end of the bar.</Muted>
      {trash.map((d) => (
        <View key={d.id} style={[s.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ color: colors.text, fontSize: 15 }} numberOfLines={1}>{d.tracker.name}</Text>
            <Muted>{`${d.entries.length} ${d.entries.length === 1 ? 'entry' : 'entries'} · deleted ${new Date(d.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}</Muted>
          </View>
          <Button label="Restore" variant="ghost" onPress={() => { restoreTracker(d.id); onRestored?.(); }} />
          <Tap onPress={() => forgetDeleted(d.id)} accessibilityLabel={`Delete ${d.tracker.name} for good`} style={{ padding: 8, marginLeft: 4 }}>
            <Text style={{ color: colors.danger, fontSize: 13 }}>Remove</Text>
          </Tap>
        </View>
      ))}
    </Card>
  );
}
