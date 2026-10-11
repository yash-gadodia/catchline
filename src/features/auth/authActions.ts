import { supabase } from '../../lib/supabase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

// Supabase auth errors are terse and technical ("Invalid login credentials").
// Translate the common ones into warm, actionable copy before they reach a
// toast; anything unrecognised falls back to the screen's own warm message
// rather than leaking raw API text.
export function humanAuthError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : '';
  const msg = raw.toLowerCase();
  if (msg.includes('invalid login credentials')) {
    return "that email and password don't match — double-check, or reset it below";
  }
  if (msg.includes('email not confirmed')) {
    return 'almost in — tap the confirmation link we emailed you first';
  }
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return 'that email already has an account, log in instead';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'a few too many tries — give it a minute, then go again';
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('fetch failed')) {
    return "couldn't reach us — check your connection and try again";
  }
  if (msg.includes('should be different from the old password')) {
    return "that's the same password as before — pick a fresh one";
  }
  return fallback;
}

function authCallbackUrl(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Linking = require('expo-linking');
  return Linking.createURL('auth-callback');
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<void> {
  const emailRedirectTo = authCallbackUrl();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
      },
      emailRedirectTo,
    },
  });

  if (error) {
    throw error;
  }
}

// Confirmation/recovery email links deep-link back as
// catchline://auth-callback?token_hash=…&type=…
// The auth-callback route exchanges that hash for a session.
export async function verifyEmailOtp(
  tokenHash: string,
  type: 'signup' | 'recovery' = 'signup'
): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    throw error;
  }
}

export async function resendConfirmationEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: authCallbackUrl() },
  });

  if (error) {
    throw error;
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authCallbackUrl(),
  });

  if (error) {
    throw error;
  }
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    throw error;
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function signInWithApple(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleAuth = require('expo-apple-authentication');

    const credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new Error('No identity token received from Apple');
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) {
      throw error;
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('identityToken')) {
      throw err;
    }
    throw new Error(
      'Apple sign-in requires a dev build with expo-apple-authentication (service gate not yet configured)'
    );
  }
}

export async function signInWithGoogle(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const WebBrowser = require('expo-web-browser');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Linking = require('expo-linking');

  const redirectTo = Linking.createURL('auth-callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google sign-in');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  // User backed out of the browser - not an error.
  if (result.type === 'cancel' || result.type === 'dismiss') return;
  if (result.type !== 'success' || !result.url) {
    throw new Error('Google sign-in failed');
  }

  // PKCE: the redirect carries ?code=… → exchange it for a session.
  const parsed = Linking.parse(result.url);
  const code = parsed.queryParams?.code;
  if (typeof code === 'string') {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return;
  }

  // Fallback for implicit flow (#access_token=…&refresh_token=…).
  const hash = result.url.includes('#') ? result.url.split('#')[1] : '';
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (access_token && refresh_token) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (sessionError) throw sessionError;
    return;
  }

  throw new Error('Google sign-in returned no session');
}
