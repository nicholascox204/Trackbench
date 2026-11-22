// The first thing a new person sees: make an account, so their tracking is backed up. Google is the main way in (one tap, so it is the big
// button); an email and password sits behind a plain link for people who do not want to use Google. Nothing else is asked here (the name
// and username come on the next screen), and the app works offline after this.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { authProblem, emailAccount, googleConfigured, signInWithGoogle } from '../core/auth';
import { afterSignIn, skipSignIn } from '../core/store';
import { Button, Scroll, Tap, colors, s, useTopPad } from '../ui/kit';
import { EDGE } from '../ui/theme';

// The Google "G", in its own colours.
function GoogleG({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

export function AuthScreen() {
  const top = useTopPad();
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [showEmail, setShowEmail] = useState(!googleConfigured); // without Google, email is the only way, so it is not hidden
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
        <Text style={{ color: colors.muted, fontSize: 15, marginTop: 8, marginBottom: 28 }}>
          An account keeps everything safe if you change or lose your phone, and brings it back wherever you sign in.
        </Text>

        {googleConfigured ? (
          <Tap
            onPress={() => void run(signInWithGoogle)} disabled={busy} accessibilityLabel="Continue with Google"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: EDGE, borderColor: '#DADCE0', opacity: busy ? 0.5 : 1 }}
          >
            <GoogleG />
            <Text style={{ color: '#1F1F1F', fontSize: 17, fontWeight: '600', marginLeft: 12 }}>{busy ? 'One moment…' : 'Continue with Google'}</Text>
          </Tap>
        ) : null}

        {googleConfigured && !showEmail ? (
          <Tap onPress={() => setShowEmail(true)} style={{ alignSelf: 'center', padding: 14, marginTop: 6 }}>
            <Text style={{ color: colors.muted, fontSize: 15, fontWeight: '600' }}>Use email instead</Text>
          </Tap>
        ) : null}

        {showEmail ? (
          <View style={{ marginTop: googleConfigured ? 22 : 0 }}>
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
            <Button label={busy ? 'One moment…' : mode === 'create' ? 'Create account' : 'Sign in'} variant="ghost" disabled={busy || !ready} onPress={() => void run(() => emailAccount(mode, email, password))} />
            <Tap onPress={() => { setMode(mode === 'create' ? 'signin' : 'create'); setProblem(''); }} style={{ alignSelf: 'center', padding: 12 }}>
              <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>{mode === 'create' ? 'I already have an account' : 'Create a new account'}</Text>
            </Tap>
          </View>
        ) : null}

        {problem ? <Text style={{ color: colors.danger, fontSize: 14, marginTop: 10, textAlign: 'center' }}>{problem}</Text> : null}

        {__DEV__ ? (
          <Tap onPress={skipSignIn} style={{ alignSelf: 'center', padding: 12, marginTop: 24 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Skip (testing only)</Text>
          </Tap>
        ) : null}
      </Scroll>
    </KeyboardAvoidingView>
  );
}
