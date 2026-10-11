import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { track, EVENTS } from '../../lib/analytics';
import { usePurchases, type PurchaseStatus } from '../purchases/usePurchases';
import { chipState, gateFor, trialDue, type ChipState, type Gate, type StorePlatform } from './entitlements';
import { planKey, type Plan } from './products';
import { getFoundingSeats, type FoundingSeats } from './seats';
import { useUsage } from './usageStore';

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

// The store purchase plus the analytics every paywall surface reports.
export async function purchasePlan(plan: Plan): Promise<PurchaseStatus> {
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
