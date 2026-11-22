// Alerts: what the app may nudge you about. They come with the style you picked and can be changed freely here.
// What a kind says depends on what your motivation has on. These are saved settings; delivery is not built yet.

import { Text, View } from 'react-native';
import type { AlertKind, AlertSettings, SystemConfig, Tracker } from '../core/types';
import { Dropdown } from '../ui/Dropdown';
import { Card, Chip, Muted, Toggle, colors, s } from '../ui/kit';

export function AlertsPanel({ alerts, config, trackers, onChange }: { alerts: AlertSettings; config: SystemConfig; trackers: Tracker[]; onChange: (a: AlertSettings) => void }) {
  const hearts = config.hearts.on;
  const streaks = config.consistency !== 'none';
  const levels = config.levels.on && config.points.on;
  const warnings = ['a goal is about to be missed', ...(streaks ? ['a streak is about to break'] : []), ...(hearts ? ['a heart is at risk'] : [])];
  const kinds: { id: AlertKind; name: string; sub: string }[] = [
    { id: 'reminders', name: 'Reminders', sub: 'A tracker is due today and not logged yet.' },
    { id: 'warnings', name: 'Warnings', sub: `When ${warnings.join(', ')}.` },
    { id: 'cheers', name: 'Cheers', sub: `When a goal is met${levels ? ' or a level is reached' : ''}.` },
  ];
  const anyOn = kinds.some((k) => alerts.on[k.id]);
  return (
    <View>
      <Muted style={{ marginBottom: 12 }}>Your style set these. Turn any on or off whenever you like, here or later from Edit.</Muted>
      {kinds.map((k) => (
        <Toggle key={k.id} label={k.name} sub={k.sub} value={alerts.on[k.id]} onChange={(v) => onChange({ ...alerts, on: { ...alerts.on, [k.id]: v } })} />
      ))}
      {anyOn ? (
        <View style={{ marginTop: 6 }}>
          <Dropdown
            compact label="Quiet hours" value={alerts.quiet ? `${alerts.quiet.from} to ${alerts.quiet.to}` : 'None'} selected={alerts.quiet ? `${alerts.quiet.from}-${alerts.quiet.to}` : ''}
            options={[{ key: '', label: 'None' }, { key: '22:00-07:00', label: '22:00 to 07:00' }, { key: '21:00-08:00', label: '21:00 to 08:00' }, { key: '23:00-06:00', label: '23:00 to 06:00' }]}
            onSelect={(k) => onChange({ ...alerts, quiet: k ? { from: k.slice(0, 5), to: k.slice(6) } : undefined })}
          />
          <Card>
            <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Leave these trackers out</Text>
            <View style={s.wrap}>
              {trackers.map((t) => {
                const muted = (alerts.mute ?? []).includes(t.id);
                return <Chip key={t.id} label={t.name} active={muted} onPress={() => onChange({ ...alerts, mute: muted ? (alerts.mute ?? []).filter((x) => x !== t.id) : [...(alerts.mute ?? []), t.id] })} />;
              })}
            </View>
          </Card>
        </View>
      ) : null}
      <Muted style={{ marginTop: 4 }}>Saved settings for now. Delivery to your phone is not built yet.</Muted>
    </View>
  );
}
