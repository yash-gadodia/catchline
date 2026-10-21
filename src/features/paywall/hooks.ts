import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { track, EVENTS } from '../../lib/analytics';
import { usePurchases, type PurchaseStatus } from '../purchases/usePurchases';
import { chipState, gateFor, lastFreeDue, trialDue, videosRemaining, type ChipState, type Gate, type StorePlatform } from './entitlements';
import { planKey, type Plan } from './products';
import { getFoundingSeats, type FoundingSeats } from './seats';
import { useUsage } from './usageStore';
import { backendEnabled } from '../../data/backend';
import { getAllowance } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { readFreeUsed } from '../../data/freeLifts';
import { signInWithApple } from '../auth/appleSignIn';

export function storePlatform(): StorePlatform {
  return Platform.OS === 'android' ? 'android' : 'ios';
}

export function useFoundingSeats(): FoundingSeats | null {
  const [seats, setSeats] = useState<FoundingSeats | null>(null);
  useEffect(() => {
    let live = true;
    getFoundingSeats()
      .then((s) => live && setSeats(s))
      .catch(() => live && setSeats(null));
    return () => {
      live = false;
    };
  }, []);
  return seats;
}

// Sign in with Apple before any purchase (Yash, 20 Oct 2026), so a plan always
// belongs to an account and follows the lifter to a new phone. Analysing needs
// no account. A cancelled sign-in is a cancelled purchase; restore needs none.
export async function ensureAccountForPurchase(): Promise<PurchaseStatus | null> {
  if (!backendEnabled() || Platform.OS !== 'ios') return null;
  const { data } = await supabase.auth.getSession();
  if (data.session && !data.session.user.is_anonymous) return null;
  try {
    const result = await signInWithApple();
    return result.cancelled ? 'cancelled' : null;
  } catch {
    return 'failed';
  }
}

// The store purchase plus the analytics every paywall surface reports.
export async function purchasePlan(plan: Plan): Promise<PurchaseStatus> {
  const blocked = await ensureAccountForPurchase();
  if (blocked) return blocked;
  const status = await usePurchases.getState().purchase(plan);
  if (status === 'success') track(EVENTS.PURCHASE_COMPLETED, { plan: planKey(plan) });
  return status;
}

export function useFreeVideosChip(now: Date = new Date()): ChipState | null {
  const tier = usePurchases((s) => s.tier);
  const usage = useUsage((s) => s.usage);
  const variant = useUsage((s) => s.variant);
  return chipState(tier, usage, now, variant);
}

export function useVideosLeft(now: Date = new Date()): number {
  const tier = usePurchases((s) => s.tier);
  const usage = useUsage((s) => s.usage);
  const variant = useUsage((s) => s.variant);
  return videosRemaining(tier, usage, now, variant);
}

// The free count from the Keychain (a reinstall on this phone), then the server's
// mirror (lift_allowance, a new phone after sign-in). Either only ever raises the
// local count. Offline or without a session the server half is skipped.
export async function syncKeychainUsage(): Promise<void> {
  useUsage.getState().adoptFreeUsed(await readFreeUsed());
}

export async function syncServerUsage(now: Date = new Date()): Promise<void> {
  await syncKeychainUsage();
  if (!backendEnabled()) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const allowance = await getAllowance();
    if (allowance) useUsage.getState().adopt(allowance, now);
  } catch {
    // keep the local count
  }
}

// What the capture flow does with the next clip once it is saved.
export function nextClipGate(now: Date = new Date()): Gate {
  const { usage, variant } = useUsage.getState();
  return gateFor(usePurchases.getState().tier, usage, now, variant);
}

// Called by the analysis flow when a result is dismissed: the ad funnel's trial paywall.
export function routeAfterAnalysis(): '/paywall/funnel/trial' | null {
  const { usage, variant } = useUsage.getState();
  return trialDue(usePurchases.getState().tier, usage, variant) ? '/paywall/funnel/trial' : null;
}

// Where Record / Import go: through the "last free video" heads-up once.
export function captureHref(next: string): string {
  const { usage, variant, warnedAt } = useUsage.getState();
  if (!lastFreeDue(usePurchases.getState().tier, usage, variant, warnedAt)) return next;
  return `/paywall/last?next=${encodeURIComponent(next)}`;
}
