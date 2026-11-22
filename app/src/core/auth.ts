// Who is signed in. Everyone has an account: Google (one tap) or an email and password, plus a username. The phone's database stays the
// source of truth, so after the first sign-in the app works fully offline; the account is what the cloud copy belongs to.
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { useSyncExternalStore } from 'react';
import { cloudClient, cloudConfigured } from './cloud';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
export const googleConfigured = !!WEB_CLIENT_ID;
export { cloudConfigured };

export interface Session { loading: boolean; userId: string | null; email: string | null; name: string | null }

let current: Session = { loading: true, userId: null, email: null, name: null };
const listeners = new Set<() => void>();
let started = false;

function apply(s: { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } } | null): void {
  const meta = s?.user.user_metadata ?? {};
  const name = (typeof meta.full_name === 'string' && meta.full_name) || (typeof meta.name === 'string' && meta.name) || null;
  current = { loading: false, userId: s?.user.id ?? null, email: s?.user.email ?? null, name };
  listeners.forEach((l) => l());
}

// Look for a saved sign-in (this needs no connection) and follow changes to it.
export function startAuth(): void {
  if (started) return;
  started = true;
  if (!cloudConfigured) { apply(null); return; }
  const auth = cloudClient().auth;
  auth.getSession().then(({ data }) => apply(data.session)).catch(() => apply(null));
  auth.onAuthStateChange((_event, session) => apply(session));
}

export function useSession(): Session {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current);
}

export const currentUserId = (): string | null => current.userId;

// ---- signing in ----

export async function signInWithGoogle(): Promise<void> {
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices();
  const res = await GoogleSignin.signIn();
  if (!isSuccessResponse(res)) throw new Error('cancelled');
  const token = res.data.idToken;
  if (!token) throw new Error('no token');
  const { error } = await cloudClient().auth.signInWithIdToken({ provider: 'google', token });
  if (error) throw error;
}

// Create an account with an email and password, or sign in to one. If the project asks for the email to be confirmed first, there is
// no session yet, which is reported as 'confirm'.
export async function emailAccount(mode: 'create' | 'signin', email: string, password: string): Promise<void> {
  const auth = cloudClient().auth;
  if (mode === 'signin') {
    const { error } = await auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    return;
  }
  const { data, error } = await auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  if (!data.session) throw new Error('confirm');
}

export async function signOutNow(): Promise<void> {
  try { await GoogleSignin.signOut(); } catch { /* not signed in with Google */ }
  await cloudClient().auth.signOut();
}

// Remove the account and everything in the cloud under it (the database removes it all together).
export async function deleteAccountNow(): Promise<void> {
  const { error } = await cloudClient().rpc('delete_my_account');
  if (error) throw error;
  await signOutNow();
}

// ---- plain sentences, never the raw error ----
export function authProblem(e: unknown): string {
  const text = String((e as { message?: string })?.message ?? e).toLowerCase();
  if (text === 'cancelled' || text.includes('cancel')) return '';
  if (text === 'confirm') return 'Check your email to confirm the address, then sign in.';
  if (text.includes('invalid login') || text.includes('invalid credentials')) return 'That email and password do not match.';
  if (text.includes('already registered') || text.includes('already been registered')) return 'That email already has an account. Sign in instead.';
  if (text.includes('password') && (text.includes('least') || text.includes('weak') || text.includes('short'))) return 'Use a longer password (at least 6 characters).';
  if (text.includes('valid email') || text.includes('invalid email')) return 'That does not look like an email address.';
  if (text.includes('network') || text.includes('fetch') || text.includes('timeout')) return 'No connection. Sign-in needs one the first time.';
  if (text.includes('rate') || text.includes('too many')) return 'Too many tries. Wait a minute and try again.';
  if (text.includes('play services')) return 'Google sign-in needs Google Play services on this phone.';
  return 'Could not sign in. Try again.';
}
