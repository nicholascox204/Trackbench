// Settings: how the app looks, default units, and your data.

import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { deleteData, loadNickSetup, mergeBackup, resetAll, setOpenOn, seedDemo, loadPersona, setAppearance, setCloudSync, setDevSync, syncNow, signOutSafely, deleteMyAccount, setName, setUnits, setWeekStart, useAppState } from '../core/store';
import { exportBackup, exportReadable, parseBackup } from '../core/transfer';
import { minuteText, usualMinute } from '../core/startPick';
import { resetAllPermissions } from '../core/devReset';
import { cloudConfigured, useCloudStatus } from '../core/cloud';
import { useSession } from '../core/auth';
import { PERSONAS } from '../core/personas';
import { DeletedList } from './DeletedList';
import { formatNumber } from '../core/units';
import { Button, Card, Chip, Muted, Title, colors, s, topPad, Tap, Scroll, Toggle } from '../ui/kit';
import { ScreenHeader } from '../ui/kit';
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
              <Tap onPress={() => void syncNow()} style={{ marginTop: 6, marginBottom: 10 }}><Muted>{cloudLine}</Muted></Tap>
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
          </View>
        ) : null}

        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 18, marginBottom: 8 }}>You</Text>
        <Card>
          <Label>Name</Label>
          <TextInput style={s.input} defaultValue={state.settings.name ?? ''} onEndEditing={(e) => setName(e.nativeEvent.text)} onChangeText={(v) => { if (v.trim()) setName(v); }} placeholder="Your name" placeholderTextColor={colors.muted} maxLength={40} />
        </Card>

        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 10, marginBottom: 8 }}>Appearance</Text>
        <Card>
          <LookPicker />
          <Label>Tracker icons</Label>
          <View style={s.wrap}>
            <Chip label="Show" active={a.icons} onPress={() => setAppearance({ icons: true })} />
            <Chip label="Hide" active={!a.icons} onPress={() => setAppearance({ icons: false })} />
          </View>
          <Label>Home layout</Label>
          <View style={s.wrap}>
            {(['rows', 'cards'] as const).map((d) => <Chip key={d} label={d[0].toUpperCase() + d.slice(1)} active={a.layout === d} onPress={() => setAppearance({ layout: d })} />)}
          </View>
        </Card>

        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 10, marginBottom: 8 }}>Units</Text>
        <Card>
          <Muted style={{ marginBottom: 10 }}>The default for every unit field. Any tracker can override one in its setup. Your stored data never changes.</Muted>
          <View style={s.wrap}>
            <Chip label="Imperial (lb, mi, in)" active={state.settings.units === 'imperial'} onPress={() => setUnits('imperial')} />
            <Chip label="Metric (kg, km, cm)" active={state.settings.units === 'metric'} onPress={() => setUnits('metric')} />
          </View>
        </Card>

        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 10, marginBottom: 8 }}>Weeks</Text>
        <Card>
          <Muted style={{ marginBottom: 10 }}>Where a week begins, for weekly goals.</Muted>
          <View style={s.wrap}>
            <Chip label="Monday" active={(state.settings.weekStart ?? 'mon') === 'mon'} onPress={() => setWeekStart('mon')} />
            <Chip label="Sunday" active={state.settings.weekStart === 'sun'} onPress={() => setWeekStart('sun')} />
          </View>
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
                onChangeText={setImportText} placeholder="# TRACKER BACKUP (v1) ..." placeholderTextColor={colors.muted}
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
          <Label>Open the app on</Label>
          <View style={s.wrap}>
            <Chip label="The one I need" active={(state.settings.openOn?.mode ?? 'smart') === 'smart'} onPress={() => setOpenOn({ mode: 'smart' })} />
            <Chip label="Where I was" active={state.settings.openOn?.mode === 'last'} onPress={() => setOpenOn({ mode: 'last' })} />
            <Chip label="Always the same one" active={state.settings.openOn?.mode === 'pinned'} onPress={() => setOpenOn({ mode: 'pinned', id: state.settings.openOn?.mode === 'pinned' ? state.settings.openOn.id : state.trackers[0]?.id ?? '' })} />
          </View>
          {state.settings.openOn?.mode === 'pinned' ? (
            <View style={[s.wrap, { marginTop: 4 }]}>
              {state.trackers.map((tr) => <Chip key={tr.id} label={tr.name} active={state.settings.openOn?.mode === 'pinned' && state.settings.openOn.id === tr.id} onPress={() => setOpenOn({ mode: 'pinned', id: tr.id })} />)}
            </View>
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
