// Photos on entries (progress photos on a weigh-in, a picture with a journal entry). Taken with the camera or chosen from the
// library, then copied into the app's own folder so it stays even if the original is deleted. Photos stay on this phone: they are
// not part of the account sync or the text export yet, which the tracker's setup says beside the switch.

import { Platform } from 'react-native';

export type PhotoResult = { uri: string } | { error: string } | null; // null: the person cancelled

export async function pickPhoto(from: 'camera' | 'library'): Promise<PhotoResult> {
  try {
    const ImagePicker = await import('expo-image-picker');
    const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { error: from === 'camera' ? 'Camera access is off for Trackbench. Turn it on in your phone settings.' : 'Photo access is off for Trackbench. Turn it on in your phone settings.' };
    const opts = { mediaTypes: ['images' as const], quality: 0.7, allowsEditing: false };
    const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return null;
    const src = res.assets[0].uri;
    if (Platform.OS === 'web') return { uri: src };
    const FS = await import('expo-file-system/legacy');
    const dir = `${FS.documentDirectory}photos/`;
    await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
    const dest = `${dir}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}.jpg`;
    await FS.copyAsync({ from: src, to: dest });
    return { uri: dest };
  } catch (e) {
    return { error: `Could not add the photo: ${e instanceof Error ? e.message : String(e)}` };
  }
}
