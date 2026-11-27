// Shown after signing in while the account's trackers come down. It always says what is happening: working, slow, or
// stuck with a way out. It never just waits.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { abandonRestore, restoreAccount, useRestorePhase } from '../core/store';
import { Button, colors, s } from '../ui/kit';

const SLOW_AFTER = 8000;

export function RestoreScreen() {
  const phase = useRestorePhase(); // redraws as the restore moves on
  const [slow, setSlow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (phase !== 'busy') return;
    setSlow(false);
    const t = setTimeout(() => setSlow(true), SLOW_AFTER);
    return () => clearTimeout(t);
  }, [phase]);

  const failed = phase === 'failed';
  return (
    <View style={[s.screen, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
      {failed ? null : <ActivityIndicator size="large" color={colors.accent} />}
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 20, textAlign: 'center' }}>
        {failed ? 'Your trackers did not come in' : 'Bringing in your trackers'}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
        {failed ? 'The connection dropped or is too slow. Nothing is lost; they are safe in your account.' : slow ? 'This is taking longer than usual. A slow connection can take up to half a minute.' : 'Signed in. This takes a few seconds.'}
      </Text>
      {failed ? (
        <View style={{ alignSelf: 'stretch', marginTop: 24, gap: 10 }}>
          <Button label="Try again" onPress={() => void restoreAccount()} />
          <Button label={leaving ? 'Signing out' : 'Sign out'} variant="ghost" disabled={leaving} onPress={() => { setLeaving(true); void abandonRestore(); }} />
        </View>
      ) : null}
    </View>
  );
}
