// Settings: how the app looks, default units, and your data.

import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { deleteData, loadNickSetup, mergeBackup, resetAll, setOpenOn, seedDemo, loadPersona, setAppearance, setCloudSync, setDevSync, syncNow, signOutSafely, deleteMyAccount, askToSignIn, setName, setUnits, setWeekStart, useAppState } from '../core/store';
import { exportBackup, exportReadable, parseBackup } from '../core/transfer';
import { minuteText, usualMinute } from '../core/startPick';
import { resetAllPermissions } from '../core/devReset';
import { cloudConfigured, useCloudStatus } from '../core/cloud';
import { useSession } from '../core/auth';
import * as Updates from 'expo-updates';
import { getRestoreTiming } from '../core/store';
import { PERSONAS } from '../core/personas';
import { DeletedList } from './DeletedList';
import { formatNumber } from '../core/units';
import { Button, Card, ChoiceGrid, Muted, Title, colors, s, topPad, Tap, Scroll, Toggle } from '../ui/kit';
import { ScreenHeader } from '../ui/kit';
import { Dropdown } from '../ui/Dropdown';
import { defaultAppearance } from '../ui/theme';
import { LookPicker } from '../ui/LookPicker';

function Label({ children }: { children: string }) {
  return <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6, marginTop: 6 }}>{children}</Text>;
}

export function Settings() {
  const { state } = useAppState();
  const a = state.settings.appearance ?? defaultAppearance;
  const [msg, setMsg] = useState('');
  const cloud = useCloudStatus();
  const session = useSession();
  const [accountMsg, setAccountMsg] = useState('');
  const cloudLine = cloud.phase === 'syncing' ? 'Backing up…' : cloud.phase === 'error' ? `${cloud.message ?? 'The backup did not finish.'} Tap to try again.` : cloud.at ? `Backed up ${new Date(cloud.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${cloud.sent || cloud.received ? ` (${cloud.sent ?? 0} sent, ${cloud.received ?? 0} received)` : ''}. Tap to back up now.` : 'Waiting to back up. Tap to back up now.';
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function copy(text: string, label: string) {
    try {
      await Clipboard.setStringAsync(text);
      setMsg(`${label} copied (${text.length.toLocaleString()} characters).`);
    } catch {
      setMsg('Could not reach the clipboard.');
    }
  }

  function doImport() {
    const res = parseBackup(importText);
    if (!res.ok) return setMsg(res.errors.join(' '));
    const r = mergeBackup(res.value);
    setMsg(`Imported ${r.trackers} tracker(s) and ${r.entries} entr${r.entries === 1 ? 'y' : 'ies'}.`);
    setImportText('');
    setImporting(false);
  }

  return (
    <View style={s.screen}>
      <ScreenHeader label="Settings" />
      <Scroll contentContainerStyle={[s.content, { paddingTop: 12 }]} keyboardShouldPersistTaps="handled">

        {cloudConfigured && session.userId ? (
          <View>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 18, marginBottom: 8 }}>Account</Text>
            <Card>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{state.settings.name || session.name || 'Signed in'}</Text>
              {session.email ? <Muted>{session.email}</Muted> : null}
              <View style={{ height: 12 }} />
              <Button
                label={confirm === 'out' ? 'Tap again: this phone is cleared, your data stays in your account' : 'Sign out'} variant="ghost" style={{ marginBottom: 8 }}
                onPress={async () => { if (confirm !== 'out') { setConfirm('out'); return; } setConfirm(null); const why = await signOutSafely(); if (why) setAccountMsg(why); }}
              />
              <Button
                label={confirm === 'delete' ? 'Tap again to delete your account and all its data' : 'Delete my account'} variant="danger"
                onPress={async () => { if (confirm !== 'delete') { setConfirm('delete'); return; } setConfirm(null); const why = await deleteMyAccount(); if (why) setAccountMsg(why); }}
              />
              {accountMsg ? <Text style={{ color: colors.danger, fontSize: 13, marginTop: 8 }}>{accountMsg}</Text> : null}
            </Card>
            {/* Testing aid: which published version this is, and how long bringing the trackers in last took. */}
            <Muted style={{ marginTop: 8, fontSize: 12 }}>{Updates.createdAt ? `Version from ${Updates.createdAt.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Running from the PC'}</Muted>
            {getRestoreTiming() ? <Muted style={{ marginTop: 4, fontSize: 12 }}>{`Last sign-in: ${getRestoreTiming()}`}</Muted> : null}
          </View>
        ) : cloudConfigured ? (
          // Not signed in: the way in is always here, so a skipped sign-in is never a dead end.
          <View>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 18, marginBottom: 8 }}>Account</Text>
            <Card>
              <Muted style={{ marginBottom: 10 }}>Not signed in. Your trackers are only on this phone.</Muted>
              <Button label="Sign in" onPress={askToSignIn} />
            </Card>
          </View>
        ) : null}

        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 18, marginBottom: 8 }}>You</Text>
        <Card>
          <Label>Name</Label>
          <TextInput style={s.input} defaultValue={state.settings.name ?? ''} onEndEditing={(e) => setName(e.nativeEvent.text)} onChangeText={(v) => { if (v.trim()) setName(v); }} placeholder="Your name" placeholderTextColor={colors.hint} maxLength={40} />
        </Card>

        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 10, marginBottom: 8 }}>Appearance</Text>
        <Card>
          <LookPicker />
          <Label>Tracker icons</Label>
          <ChoiceGrid cols={2} value={a.icons ? 'show' : 'hide'} onPick={(k) => setAppearance({ icons: k === 'show' })} options={[{ key: 'show', label: 'Show' }, { key: 'hide', label: 'Hide' }]} />
          <Label>Home layout</Label>
          <ChoiceGrid cols={2} value={a.layout} onPick={(k) => setAppearance({ layout: k as 'rows' | 'cards' })} options={[{ key: 'rows', label: 'Rows' }, { key: 'cards', label: 'Cards' }]} />
        </Card>

        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 10, marginBottom: 8 }}>Units</Text>
        <Card>
          <Muted style={{ marginBottom: 10 }}>The default for every unit field. Any tracker can override one in its setup. Your stored data never changes.</Muted>
          <ChoiceGrid cols={2} value={state.settings.units} onPick={(k) => setUnits(k as 'imperial' | 'metric')} options={[{ key: 'imperial', label: 'Imperial' }, { key: 'metric', label: 'Metric' }]} />
        </Card>

        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 10, marginBottom: 8 }}>Weeks</Text>
        <Card>
          <Muted style={{ marginBottom: 10 }}>Where a week begins, for weekly goals.</Muted>
          <ChoiceGrid cols={2} value={state.settings.weekStart ?? 'mon'} onPick={(k) => setWeekStart(k as 'mon' | 'sun')} options={[{ key: 'mon', label: 'Monday' }, { key: 'sun', label: 'Sunday' }]} />
        </Card>

        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 10, marginBottom: 8 }}>Data</Text>
        <Card>
          <Muted style={{ marginBottom: 10 }}>Plain text. Copy a readable export to paste into an AI for review, keep a backup, or bring one back in.</Muted>
          <Button label="Copy data for AI review (last 14 days)" variant="ghost" onPress={() => copy(exportReadable(state, null, 14), 'Data')} style={{ marginBottom: 8 }} />
          <Button label="Copy full backup" variant="ghost" onPress={() => copy(exportBackup(state), 'Backup')} style={{ marginBottom: 8 }} />
          {importing ? (
            <View>
              <TextInput
                style={[s.input, { minHeight: 120, textAlignVertical: 'top', fontSize: 12 }]} multiline value={importText}
                onChangeText={setImportText} placeholder="# TRACKER BACKUP (v1) ..." placeholderTextColor={colors.hint}
              />
              <Button label="Import backup" onPress={doImport} style={{ marginTop: 8 }} disabled={!importText.trim()} />
            </View>
          ) : (
            <Button label="Import backup" variant="ghost" onPress={() => setImporting(true)} />
          )}
          {msg ? <Text style={{ color: colors.done, marginTop: 8 }}>{msg}</Text> : null}
        </Card>

        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 10, marginBottom: 8 }}>Opening</Text>
        <Card>
          {/* Three long choices and a list of trackers: dropdowns, not pills. */}
          <Dropdown
            compact label="Open the app on" selected={state.settings.openOn?.mode ?? 'smart'}
            value={({ smart: 'The one I need', last: 'Where I was', pinned: 'Always the same one' } as const)[state.settings.openOn?.mode ?? 'smart']}
            options={[{ key: 'smart', label: 'The one I need' }, { key: 'last', label: 'Where I was' }, { key: 'pinned', label: 'Always the same one' }]}
            onSelect={(k) => setOpenOn(k === 'pinned' ? { mode: 'pinned', id: state.settings.openOn?.mode === 'pinned' ? state.settings.openOn.id : state.trackers[0]?.id ?? '' } : { mode: k as 'smart' | 'last' })}
          />
          {state.settings.openOn?.mode === 'pinned' ? (
            <Dropdown
              compact label="Tracker" selected={state.settings.openOn.id}
              value={state.trackers.find((tr) => state.settings.openOn?.mode === 'pinned' && tr.id === state.settings.openOn.id)?.name ?? 'Choose'}
              options={state.trackers.map((tr) => ({ key: tr.id, label: tr.name }))} onSelect={(id) => setOpenOn({ mode: 'pinned', id })}
            />
          ) : null}
          {(state.settings.openOn?.mode ?? 'smart') === 'smart' && state.trackers.length > 0 ? (
            <View style={{ marginTop: 4, marginBottom: 6 }}>
              <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4 }}>What it has noticed (from your last two months, recent days count more)</Text>
              {state.trackers.map((tr) => {
                const m = usualMinute(state.entries.filter((e) => e.trackerId === tr.id));
                return <Text key={tr.id} style={{ color: colors.text, fontSize: 13, marginBottom: 2 }}>{tr.name}: <Text style={{ color: colors.muted }}>{m === null ? 'no usual time yet' : `usually around ${minuteText(m)}`}</Text></Text>;
              })}
            </View>
          ) : null}
          <Muted>{(state.settings.openOn?.mode ?? 'smart') === 'smart' ? 'Opens a tracker that is still due today, the one you usually log around this time, or back where you just were if you reopen within half an hour. With little history it uses the order of your bar.' : state.settings.openOn?.mode === 'last' ? 'Opens on the tracker you were last on.' : 'Opens on the tracker you pick here.'}</Muted>
        </Card>

        {(state.trash ?? []).length > 0 ? <View style={{ marginTop: 10 }}><DeletedList /></View> : null}

        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 10, marginBottom: 8 }}>Developer</Text>
        <Card>
          <Button label="Load my gym, nutrition and weight setup" variant="ghost" onPress={loadNickSetup} style={{ marginBottom: 8 }} />
          {cloudConfigured && !session.userId ? (
            <View style={{ marginBottom: 8 }}>
              <Toggle label="Back up to the cloud" value={!!state.settings.cloudSync} onChange={setCloudSync} />
              {state.settings.cloudSync ? (
                <Tap onPress={() => void syncNow()}>
                  <Muted>{cloudLine}</Muted>
                </Tap>
              ) : <Muted>Off: your data stays on this phone.</Muted>}
            </View>
          ) : null}
          <Toggle label="Keep trackers in step with presets" value={!!state.settings.devSync} onChange={setDevSync} />
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Example people (replaces everything tracked)</Text>
          {PERSONAS.map((p) => (
            <Button
              key={p.id} variant="ghost" style={{ marginBottom: 6 }}
              label={confirm === `p-${p.id}` ? 'Tap again to replace your data' : `${p.name}: ${p.blurb}`}
              onPress={() => { if (confirm === `p-${p.id}`) { setConfirm(null); loadPersona(p.id); } else setConfirm(`p-${p.id}`); }}
            />
          ))}
          <Button label="Fill 3 weeks of demo history" variant="ghost" onPress={seedDemo} style={{ marginBottom: 8 }} />
          <Button
            label={confirm === 'perms' ? 'Tap again: the app will close' : 'Reset permissions'} variant="ghost" style={{ marginBottom: 8 }}
            onPress={() => { if (confirm === 'perms') { setConfirm(null); void resetAllPermissions(); } else setConfirm('perms'); }}
          />
          <Button
            label={confirm === 'data' ? 'Tap again to delete everything you tracked' : 'Delete my data'} variant="danger" style={{ marginBottom: 4 }}
            onPress={() => { if (confirm === 'data') { deleteData(); setConfirm(null); } else setConfirm('data'); }}
          />
          <Muted style={{ marginBottom: 12 }}>Removes your trackers, entries and points. Keeps your name and look.</Muted>
          <Button
            label={confirm === 'reset' ? 'Tap again to start over' : 'Start over'} variant="danger" style={{ marginBottom: 4 }}
            onPress={() => { if (confirm === 'reset') { resetAll(); setConfirm(null); } else setConfirm('reset'); }}
          />
          <Muted>Erases everything, including your name and look, and goes back to the first screen.</Muted>
          <Muted style={{ marginTop: 8 }}>{formatNumber(state.entries.length)} entries on this device.</Muted>
        </Card>
      </Scroll>
    </View>
  );
}
