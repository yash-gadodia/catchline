import * as AppleAuthentication from 'expo-apple-authentication';
import { syncLibrary } from '../../data/library';
import { supabase } from '../../lib/supabase';
import { ApiError } from '../../lib/api/errors';
import { usePurchases } from '../purchases/usePurchases';
import { syncAuthUser } from './authUser';
import { hashNonce, rawNonce } from './nonce';

export type AppleSignIn = { cancelled: true } | { cancelled: false; userId: string; transferred: boolean };

export function isAppleCancel(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED';
}

export function appleDisplayName(fullName: AppleAuthentication.AppleAuthenticationFullName | null): string | null {
  const name = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ').trim();
  return name || null;
}

// Native Sign in with Apple -> Supabase session. An anonymous session with data
// hands its rows to the Apple user through begin/complete_account_transfer
// (0006). A paid anonymous user restores so RevenueCat moves the entitlement to
// the new app user id (the webhook then updates profiles.plan).
export async function signInWithApple(): Promise<AppleSignIn> {
  const before = (await supabase.auth.getSession()).data.session;
  const wasPaid = usePurchases.getState().tier !== 'free';
  let token: string | null = null;
  if (before?.user.is_anonymous) {
    const { data } = await supabase.rpc('begin_account_transfer');
    token = data ?? null;
  }

  const raw = rawNonce();
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: await hashNonce(raw),
    });
  } catch (e) {
    if (isAppleCancel(e)) return { cancelled: true };
    throw e;
  }
  if (!credential.identityToken) throw new ApiError('not_authenticated', 'Apple returned no identity token');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: raw,
  });
  if (error || !data.user) throw new ApiError('not_authenticated', error?.message);
  const userId = data.user.id;

  let transferred = false;
  if (token) {
    const { error: transferError } = await supabase.rpc('complete_account_transfer', { p_token: token });
    transferred = !transferError;
    if (transferError) console.log(`[auth] account transfer failed: ${transferError.message}`);
  }

  // Apple sends the name on the first authorisation only, so write it when given.
  const name = appleDisplayName(credential.fullName);
  if (name) await supabase.from('profiles').update({ display_name: name }).eq('id', userId);

  await syncAuthUser(data.session);
  if (wasPaid) await usePurchases.getState().restore();
  await syncLibrary().catch(() => undefined);
  return { cancelled: false, userId, transferred };
}

// Ends the Apple session on this phone; the next backend call (ensureSession)
// starts a fresh anonymous account. supabase-js already drops the local session
// when the server says the token is gone (401/403/404).
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new ApiError('unknown', error.message);
  await syncAuthUser(null);
}
