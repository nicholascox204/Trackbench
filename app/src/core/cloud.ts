// The cloud copy, through Supabase. Everything else (what to send, what to take in, who wins) is in sync.ts; this only knows how to talk
// to the service: the client, the signed-in account's id, and the status shown in Settings.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

export { supabaseApi } from './supabaseApi';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;
export const cloudConfigured = !!(URL && KEY);

let client: SupabaseClient | null = null;
export function cloudClient(): SupabaseClient {
  client ??= createClient(URL as string, KEY as string, {
    auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  return client;
}

// The signed-in account (see auth.ts). Without one there is nothing to sync.
export async function signedInUserId(): Promise<string> {
  const { data } = await cloudClient().auth.getSession();
  if (!data.session) throw new Error('not signed in');
  return data.session.user.id;
}

// ---- what the app shows about it ----
export interface CloudStatus { phase: 'idle' | 'syncing' | 'error'; at?: number; sent?: number; received?: number; message?: string }
let status: CloudStatus = { phase: 'idle' };
const listeners = new Set<() => void>();
export const getCloudStatus = (): CloudStatus => status;
export function setCloudStatus(next: CloudStatus): void {
  status = { ...(next.phase === 'syncing' ? { at: status.at } : {}), ...next };
  listeners.forEach((l) => l());
}
export function useCloudStatus(): CloudStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => status);
}

// A plain sentence, never the raw error.
export function friendlyError(e: unknown): string {
  const text = String((e as { message?: string })?.message ?? e).toLowerCase();
  if (text.includes('network') || text.includes('fetch') || text.includes('timeout')) return 'No connection right now. It will try again.';
  if (text.includes('anonymous') || text.includes('sign')) return 'Could not sign in. Check that anonymous sign-ins are on.';
  if (text.includes('jwt') || text.includes('permission') || text.includes('row-level')) return 'The cloud turned the change down.';
  return 'The backup did not finish. It will try again.';
}
