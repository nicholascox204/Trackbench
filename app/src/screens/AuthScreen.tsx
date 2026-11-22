// The first thing a new person sees: make an account, so their tracking is backed up. Google is one tap; an email and password works
// too. Nothing else is asked here (the name and username come on the next screen), and the app works offline after this.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { authProblem, emailAccount, googleConfigured, signInWithGoogle } from '../core/auth';
import { afterSignIn, skipSignIn } from '../core/store';
import { Button, Scroll, Tap, colors, s, useTopPad } from '../ui/kit';
import { EDGE } from '../ui/theme';

export function AuthScreen() {
  const top = useTopPad();
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  async function run(go: () => Promise<void>): Promise<void> {
    setBusy(true);
    setProblem('');
    try {
      await go();
      await afterSignIn();
    } catch (e) {
      setProblem(authProblem(e));
    } finally {
      setBusy(false);
    }
  }

  const ready = email.includes('@') && password.length >= 6;

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Scroll contentContainerStyle={[s.content, { paddingTop: top + 24, paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '700' }}>Back up your data</Text>
        <Text style={{ color: colors.muted, fontSize: 15, marginTop: 8, marginBottom: 24 }}>
          An account keeps everything safe if you change or lose your phone, and brings it back wherever you sign in.
        </Text>

        {googleConfigured ? (
          <Button label="Continue with Google" disabled={busy} onPress={() => void run(signInWithGoogle)} />
        ) : null}

        {googleConfigured ? <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', marginVertical: 14 }}>or use an email</Text> : null}

        <TextInput
          value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted}
          autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress"
          style={[s.input, { fontSize: 17, borderWidth: EDGE, borderColor: colors.border, marginBottom: 10 }]}
        />
        <TextInput
          value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.muted}
          secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType={mode === 'create' ? 'newPassword' : 'password'}
          style={[s.input, { fontSize: 17, borderWidth: EDGE, borderColor: colors.border, marginBottom: 12 }]}
        />
        {problem ? <Text style={{ color: colors.danger, fontSize: 14, marginBottom: 10 }}>{problem}</Text> : null}
        <Button
          label={busy ? 'One moment…' : mode === 'create' ? 'Create account' : 'Sign in'} variant={googleConfigured ? 'ghost' : undefined}
          disabled={busy || !ready} onPress={() => void run(() => emailAccount(mode, email, password))}
        />
        <Tap onPress={() => { setMode(mode === 'create' ? 'signin' : 'create'); setProblem(''); }} style={{ alignSelf: 'center', padding: 12 }}>
          <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>{mode === 'create' ? 'I already have an account' : 'Create a new account'}</Text>
        </Tap>

        {__DEV__ ? (
          <Tap onPress={skipSignIn} style={{ alignSelf: 'center', padding: 12, marginTop: 24 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Skip (testing only)</Text>
          </Tap>
        ) : null}
      </Scroll>
    </KeyboardAvoidingView>
  );
}
