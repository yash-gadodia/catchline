import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { track, EVENTS } from '../../lib/analytics';
import { usePurchases, type PurchaseStatus } from '../purchases/usePurchases';
import { freeLeft, gateFor, type Gate, type StorePlatform } from './entitlements';
import { packageIdFor, type Plan } from './products';
import { getFoundingSeats, type FoundingSeats } from './seats';
import { useUsage } from './usageStore';
import { backendEnabled } from '../../data/backend';
import { supabase } from '../../lib/supabase';
import { readFreeWeek } from '../../data/freeLifts';
import { signInWithApple } from '../auth/appleSignIn';
import { cancelFreeVideoBack } from '../notifications/nudges';

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
// belongs to an account and follows the lifter to a new phone. Tracking needs
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

// The store purchase plus the analytics the paywall reports.
export async function purchasePlan(plan: Plan): Promise<PurchaseStatus> {
  const id = packageIdFor(plan);
  track(EVENTS.PURCHASE_STARTED, { plan: id });
  const blocked = await ensureAccountForPurchase();
  if (blocked) {
    // the Apple sign-in a purchase asks for was cancelled or failed
    track(EVENTS.PURCHASE_NOT_COMPLETED, { plan: id, outcome: `sign_in_${blocked}` });
    return blocked;
  }
  const status = await usePurchases.getState().purchase(plan);
  if (status === 'success') {
    track(EVENTS.PURCHASE_COMPLETED, { plan: id });
    void cancelFreeVideoBack();
  }
  else track(EVENTS.PURCHASE_NOT_COMPLETED, { plan: id, outcome: status });
  return status;
}

// Free videos left this week (not meaningful on Pro, which has no limit).
export function useVideosLeft(now: Date = new Date()): number {
  return freeLeft(useUsage((s) => s.usage), now);
}

// This week's count from the Keychain, so a reinstall on this phone does not hand
// the free videos back. It only ever raises the local count.
export async function syncKeychainUsage(): Promise<void> {
  const held = await readFreeWeek();
  if (held) useUsage.getState().adoptWeek(held);
}

// The weekly limit lives on the phone only; the root layout and processing still call this name.
export const syncServerUsage = syncKeychainUsage;

// What the capture flow does with the next clip once it is saved.
export function nextClipGate(now: Date = new Date(), ahead = 0): Gate {
  return gateFor(usePurchases.getState().tier, useUsage.getState().usage, now, ahead);
}

// Kept for the screens that still call them: there is no trial paywall after a
// result and no heads-up before the last free video any more.
export function routeAfterAnalysis(): null {
  return null;
}

// A free lifter with no video left this week goes to the paywall before picking or filming, not after the picker,
// the trim and the plate check (19-11: 18 of 58 new phones met the paywall that late).
export function captureHref(next: string, now: Date = new Date()): string {
  const free = usePurchases.getState().tier === 'free';
  return free && freeLeft(useUsage.getState().usage, now) <= 0 ? '/paywall' : next;
}
