import { supabase } from '../supabase';
import { ApiError, toApiError } from './errors';

export type ConsentKind = 'terms' | 'health_disclaimer' | 'upload_privacy' | 'model_training';

export type Allowance = {
  plan: 'free' | 'hook' | 'pull' | 'platform' | 'founding';
  period: 'lifetime' | 'month';
  cap: number;
  used: number;
  bonus: number;
  remaining: number;
};

/**
 * The app has no sign-in screen: the first backend call starts an anonymous
 * account (Apple/Google link to it later). Returns the user id.
 */
export async function ensureSession(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
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
