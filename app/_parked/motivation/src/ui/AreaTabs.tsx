// The thin row below the trackers: Motivation and Settings, always one tap away. Motivation shows your points
// when the game keeps them, and a change in points shows briefly beside them.

import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useDerived } from '../core/store';
import { Tap, colors } from './kit';

export type Area = 'motivation' | 'settings';

export function AreaTabs({ area, onMotivation, onSettings }: { area?: Area; onMotivation: () => void; onSettings: () => void }) {
  const { result, system } = useDerived();
  const [toast, setToast] = useState<string | null>(null);
  const prev = useRef<number | null>(null);
  const points = result?.points ?? null;
  useEffect(() => {
    if (points !== null && prev.current !== null && points !== prev.current) {
      const diff = points - prev.current;
      setToast(`${diff > 0 ? '+' : ''}${diff}`);
      const id = setTimeout(() => setToast(null), 2200);
      prev.current = points;
      return () => clearTimeout(id);
    }
    prev.current = points;
  }, [points]);
  const showPoints = !!system?.config.points.on && points !== null;

  const tab = (which: Area, label: string, icon: string, onPress: () => void, extra?: string) => {
    const on = area === which;
    return (
      <Tap
        onPress={onPress}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 28, borderRadius: 8, marginHorizontal: 4, backgroundColor: on ? colors.accentBg : 'transparent' }}
      >
        <Text style={{ color: on ? colors.accent : colors.muted, fontSize: 12, fontWeight: on ? '800' : '600' }}>{label}</Text>
        {extra ? <Text style={{ color: extra.startsWith('+') ? colors.done : extra.startsWith('-') ? colors.danger : colors.muted, fontSize: 13, fontWeight: '800', marginLeft: 6 }}>{extra}</Text> : null}
      </Tap>
    );
  };

  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 3, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 3 }}>
      {tab('motivation', 'Motivation', 'trophy-outline', onMotivation, toast ?? (showPoints ? String(points) : undefined))}
      {tab('settings', 'Settings', 'settings-outline', onSettings)}
    </View>
  );
}
