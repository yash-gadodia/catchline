import { supabase } from '../../lib/supabase';
import { SITE_BASE } from '../../lib/links';

// Give a month, get a month (0025_referrals.sql). The server decides every
// reward; the app shows the code, shares it and claims a friend's.

export type ReferralFriend = { name: string | null; status: 'claimed' | 'qualified'; at: string };
export type MyReferral = {
  code: string;
  kind: 'friend' | 'coach';
  joined: number;
  qualified: number;
  daysEarned: number;
  proUntil: string | null;
  badge: boolean;
  nextMilestone: number | null;
  friends: ReferralFriend[];
};
export type ClaimError = 'code_not_found' | 'own_code' | 'already_claimed' | 'too_late' | 'sign_in_required' | 'generic';
export type ClaimResult =
  | { ok: true; status: 'claimed' | 'qualified'; inviter: string | null }
  | { ok: false; error: ClaimError };

const KNOWN: ClaimError[] = ['code_not_found', 'own_code', 'already_claimed', 'too_late', 'sign_in_required'];

export function normalizeCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
}

export function inviteLink(code: string): string {
  return `${SITE_BASE}/i/?c=${encodeURIComponent(code)}`;
}

export function claimErrorOf(message: string | undefined): ClaimError {
  return KNOWN.find((k) => message?.includes(k)) ?? 'generic';
}

export function monthsOf(days: number): number {
  return Math.round(days / 30);
}

export async function fetchMyReferral(): Promise<MyReferral> {
  const { data, error } = await supabase.rpc('my_referral');
  if (error) throw error;
  return data as MyReferral;
}

export async function claimCode(code: string): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('claim_referral', { p_code: normalizeCode(code) });
  if (error) return { ok: false, error: claimErrorOf(error.message) };
  const r = data as { status: 'claimed' | 'qualified'; inviter: string | null };
  return { ok: true, status: r.status, inviter: r.inviter };
}

// Grants this user's pending months now instead of waiting for the server's own call.
export async function collectRewards(): Promise<void> {
  await supabase.functions.invoke('referral-rewards', { body: {} });
}
