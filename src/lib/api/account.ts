import { supabase } from '../supabase';
import { ApiError, toApiError } from './errors';

export type ConsentKind = 'terms' | 'health_disclaimer' | 'upload_privacy';

export type Allowance = {
  plan: 'free' | 'hook' | 'pull' | 'platform' | 'founding';
  period: 'lifetime' | 'month';
  cap: number;
  used: number;
  bonus: number;
  remaining: number;
};

let starting: Promise<string> | null = null;

/**
 * The app has no sign-in screen: the first backend call starts an anonymous
 * account (Apple/Google link to it later). Returns the user id. Several screens
 * ask at once on first launch; they share one start, or each would create its
 * own account and all but the last would be left empty.
 */
export function ensureSession(): Promise<string> {
  starting ??= startSession().finally(() => {
    starting = null;
  });
  return starting;
}

async function startSession(): Promise<string> {
  const { data, error: refresh } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  // A refresh that failed on the network (offline, a 5xx) comes back as "no session" while the account is still saved
  // on the phone. Signing in here would write a new anonymous account over it: the lifter's lifts, plan and Apple
  // sign-in would be gone. Fail instead; the next call tries the refresh again.
  if (refresh?.name === 'AuthRetryableFetchError') throw new ApiError('not_authenticated', refresh.message);
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error || !signed.user) throw new ApiError('not_authenticated', error?.message);
  return signed.user.id;
}

/** Append a consent decision (createLift needs a granted 'upload_privacy'). */
export async function recordConsent(kind: ConsentKind, version: string, granted: boolean): Promise<void> {
  const { error } = await supabase.from('consents').insert({ kind, version, granted });
  if (error) throw toApiError(error);
}

export async function getAllowance(): Promise<Allowance> {
  const { data, error } = await supabase.rpc('lift_allowance');
  if (error) throw toApiError(error);
  return data as Allowance;
}

export type PlanSync = { plan: Allowance['plan']; founding: boolean; result: string };

/**
 * The sync-plan edge function reads the caller's RevenueCat subscriber and
 * applies it to profiles.plan (upgrades only), for a webhook that was missed
 * or is slow.
 */
export async function syncPlan(): Promise<PlanSync> {
  const { data, error } = await supabase.functions.invoke('sync-plan');
  if (error) throw toApiError(error);
  return data as PlanSync;
}

/**
 * The delete-account edge function erases the caller's rows (delete_my_account)
 * and the auth user itself, so the token in hand is dead afterwards: drop it
 * locally only (a server sign-out would 403 against a user that no longer exists).
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account');
  if (error && !(await userGone())) throw toApiError(error);
  await supabase.auth.signOut({ scope: 'local' });
}

// The function answers 401 for a token whose user is already gone (deleted on
// another phone); the auth server says which: user_not_found means deleted.
async function userGone(): Promise<boolean> {
  const { error } = await supabase.auth.getUser();
  return error?.code === 'user_not_found';
}

/** Founding seats sold so far (public RPC, no PII). */
export async function foundingSeats(): Promise<{ taken: number; cap: number }> {
  const { data, error } = await supabase.rpc('founding_seats');
  if (error) throw toApiError(error);
  return data as { taken: number; cap: number };
}
