// The first screen: what to call you, and how the app should look. The name is pinned at the top so it cannot be
// scrolled past or overlooked; the look scrolls beneath it and restyles the screen live, so there is nothing to
// imagine. The defaults already work, so a person who does not care types a name and continues.
// The keyboard's Done only closes the keyboard (people look at the look options next); Continue is what moves on.
// Continue is always pressable: with no name it shakes the field and points at it, rather than sitting greyed out.

import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { handleFree, myProfile, saveProfile, useSession } from '../core/auth';
import { checkHandle, handleProblem, nextHandle, normalizeHandle, suggestHandle } from '../core/profile';
import { finishWelcome, setHandle, useAppState } from '../core/store';
import { Button, Scroll, colors, s, useTopPad } from '../ui/kit';
import { LookPicker } from '../ui/LookPicker';
import { EDGE, px } from '../ui/theme';

export function Welcome({ onDone }: { onDone?: () => void }) {
  const { state } = useAppState();
  const session = useSession();
  const [name, setName] = useState(state.settings.name ?? session.name ?? '');
  const needsHandle = !!session.userId && !state.settings.handle;
  const [handle, setHandleText] = useState('');
  const [touchedHandle, setTouchedHandle] = useState(false);
  const [avail, setAvail] = useState<'idle' | 'checking' | 'free' | 'taken' | 'offline'>('idle');
  const [saving, setSaving] = useState(false);
  const [saveProblem, setSaveProblem] = useState('');
  const [nudged, setNudged] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const empty = name.trim().length === 0;
  const top = useTopPad();

  // An account that already has a username (a new phone, a reinstall) keeps it.
  useEffect(() => {
    if (!needsHandle) return;
    let live = true;
    myProfile().then((p) => { if (live && p) setHandle(p.handle); }).catch(() => undefined);
    return () => { live = false; };
  }, [needsHandle]);

  // Until the person types their own, the username follows the name.
  useEffect(() => {
    if (needsHandle && !touchedHandle) setHandleText(suggestHandle(name, session.email ?? undefined));
  }, [name, needsHandle, touchedHandle, session.email]);

  // Free or taken, checked a moment after typing stops.
  const shape = checkHandle(handle);
  useEffect(() => {
    if (!needsHandle || shape !== 'ok') { setAvail('idle'); return; }
    setAvail('checking');
    let live = true;
    const t = setTimeout(() => {
      handleFree(normalizeHandle(handle)).then((free) => { if (live) setAvail(free ? 'free' : 'taken'); }).catch(() => { if (live) setAvail('offline'); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [handle, needsHandle, shape]);

  async function next() {
    if (!empty && needsHandle) {
      if (shape !== 'ok' || avail === 'taken' || avail === 'checking') return;
      setSaving(true);
      setSaveProblem('');
      try {
        const clean = normalizeHandle(handle);
        if (!(await saveProfile(clean, name.trim()))) { setAvail('taken'); return; }
        setHandle(clean);
      } catch {
        setSaveProblem('Could not save the username. Check the connection and try again.');
        return;
      } finally {
        setSaving(false);
      }
    }
    if (!empty) { finishWelcome(name); onDone?.(); return; }
    setNudged(true);
    input.current?.focus();
    Animated.sequence([8, -8, 6, -6, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 55, useNativeDriver: true }))).start();
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.content, { paddingTop: top, paddingBottom: 12 }]}>
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '700' }}>Welcome</Text>
        <Text style={{ color: colors.muted, fontSize: 14, marginTop: 6, marginBottom: 16 }}>Make it yours first. You can change any of this later in Settings.</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', flex: 1 }}>What should we call you?</Text>
          <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: empty ? colors.accentBg : 'transparent', borderWidth: px(1), borderColor: empty ? colors.accent : colors.border }}>
            <Text style={{ color: empty ? colors.accent : colors.muted, fontSize: 12, fontWeight: '700' }}>{empty ? 'Required' : 'Done'}</Text>
          </View>
        </View>
        <Animated.View style={{ transform: [{ translateX: shake }] }}>
          <TextInput
            ref={input} value={name} onChangeText={(v) => { setName(v); if (v.trim()) setNudged(false); }}
            placeholder="Your name" placeholderTextColor={colors.muted} autoCapitalize="words" autoCorrect={false}
            returnKeyType="done" maxLength={40} onSubmitEditing={() => Keyboard.dismiss()}
            style={[s.input, { fontSize: 18, borderWidth: EDGE, borderColor: nudged ? colors.danger : empty ? colors.accent : colors.border }]}
          />
        </Animated.View>
        {nudged && empty ? <Text style={{ color: colors.danger, fontSize: 13, marginTop: 6 }}>Add your name to continue.</Text> : null}

        {needsHandle ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8 }}>Pick a username</Text>
            <TextInput
              value={handle} onChangeText={(v) => { setTouchedHandle(true); setHandleText(v); }}
              placeholder="username" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} maxLength={21}
              style={[s.input, { fontSize: 18, borderWidth: EDGE, borderColor: shape !== 'ok' || avail === 'taken' ? colors.danger : colors.border }]}
            />
            <Text style={{ color: shape !== 'ok' || avail === 'taken' ? colors.danger : colors.muted, fontSize: 13, marginTop: 6 }}>
              {shape !== 'ok' ? handleProblem(shape) : avail === 'taken' ? `Taken. Try ${nextHandle(normalizeHandle(handle), 2)}.` : avail === 'checking' ? 'Checking…' : avail === 'free' ? 'Free.' : avail === 'offline' ? 'Could not check right now.' : ''}
            </Text>
            {saveProblem ? <Text style={{ color: colors.danger, fontSize: 13, marginTop: 6 }}>{saveProblem}</Text> : null}
          </View>
        ) : null}
      </View>

      <Scroll contentContainerStyle={[s.content, { paddingTop: 8, paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">
        <LookPicker />
      </Scroll>

      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, borderTopWidth: px(1), borderTopColor: colors.border, backgroundColor: colors.bg }}>
        <View style={{ maxWidth: 600, width: '100%', alignSelf: 'center' }}>
          {/* looks unavailable until there is a name, but stays pressable so it can explain itself */}
          <Button label={saving ? 'Saving…' : 'Continue'} disabled={saving} onPress={() => void next()} style={{ opacity: empty || (needsHandle && (shape !== 'ok' || avail === 'taken')) ? 0.4 : 1 }} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
