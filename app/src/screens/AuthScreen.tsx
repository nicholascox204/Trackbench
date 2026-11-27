// The first thing a new person sees: create an account (or sign in). Google is the big button and works for both; email and password are open below it.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { authProblem, cloudConfigured, emailAccount, googleConfigured, signInWithGoogle } from '../core/auth';
import { afterSignIn, setRestoring, skipSignIn } from '../core/store';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'google' | 'email'>(null); // which way in is working, so only that button says so
  const [problem, setProblem] = useState('');

  async function run(way: 'google' | 'email', go: () => Promise<void>): Promise<void> {
    setBusy(way);
    setProblem('');
    setRestoring(true); // hold the app still until the account's trackers are in
    try {
      await go();
      await afterSignIn();
    } catch (e) {
      setProblem(authProblem(e));
    } finally {
      setRestoring(false);
      setBusy(null);
    }
  }

  const ready = email.includes('@') && password.length >= 6;

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Scroll contentContainerStyle={[s.content, { flexGrow: 1, justifyContent: 'center', paddingTop: top + 24, paddingBottom: 72 }]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '700', textAlign: 'center' }}>{mode === 'create' ? 'Create your account' : 'Sign in'}</Text>
        <Text style={{ color: colors.muted, fontSize: 15, marginTop: 8, marginBottom: 28, textAlign: 'center' }}>
          Your trackers stay safe if you change phones.
        </Text>

        {googleConfigured ? (
          <Tap
            onPress={() => void run('google', signInWithGoogle)} disabled={!!busy} accessibilityLabel='Continue with Google'
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: EDGE, borderColor: '#DADCE0', opacity: busy && busy !== 'google' ? 0.5 : 1 }}
          >
            <GoogleG />
            <Text style={{ color: '#1F1F1F', fontSize: 17, fontWeight: '600', marginLeft: 12 }}>{busy === 'google' ? 'One moment…' : 'Continue with Google'}</Text>
          </Tap>
        ) : null}

        {googleConfigured ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 18 }}>
            <View style={{ flex: 1, height: EDGE, backgroundColor: colors.border }} />
            <Text style={{ color: colors.muted, fontSize: 14, marginHorizontal: 12 }}>or use email</Text>
            <View style={{ flex: 1, height: EDGE, backgroundColor: colors.border }} />
          </View>
        ) : null}

        <TextInput
          value={email} onChangeText={setEmail} placeholder='Email' placeholderTextColor={colors.hint}
          autoCapitalize='none' autoCorrect={false} keyboardType='email-address' textContentType='emailAddress'
          style={[s.input, { fontSize: 17, borderWidth: EDGE, borderColor: colors.border, marginBottom: 10 }]}
        />
        <TextInput
          value={password} onChangeText={setPassword} placeholder='Password' placeholderTextColor={colors.hint}
          secureTextEntry autoCapitalize='none' autoCorrect={false} textContentType={mode === 'create' ? 'newPassword' : 'password'}
          style={[s.input, { fontSize: 17, borderWidth: EDGE, borderColor: colors.border, marginBottom: 12 }]}
        />
        <Button label={busy === 'email' ? 'One moment…' : mode === 'create' ? 'Create account' : 'Sign in'} disabled={!!busy || !ready} onPress={() => void run('email', () => emailAccount(mode, email, password))} />
        <Button
          label={mode === 'create' ? 'I already have an email account' : 'New here? Create an account'} variant='ghost'
          onPress={() => { setMode(mode === 'create' ? 'signin' : 'create'); setProblem(''); }} style={{ marginTop: 10 }}
        />

        {!cloudConfigured ? <Text style={{ color: colors.danger, fontSize: 14, marginTop: 10, textAlign: 'center' }}>This copy of the app cannot reach your account right now. It needs an update before you can sign in.</Text> : null}
        {problem ? <Text style={{ color: colors.danger, fontSize: 14, marginTop: 10, textAlign: 'center' }}>{problem}</Text> : null}

        {/* Only the browser preview on the PC can skip, to check screens while developing; phones never can. */}
        {__DEV__ && Platform.OS === 'web' ? (
          <Tap onPress={skipSignIn} style={{ alignSelf: 'center', padding: 12, marginTop: 24 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Skip (browser preview only)</Text>
          </Tap>
        ) : null}
      </Scroll>
    </KeyboardAvoidingView>
  );
}
