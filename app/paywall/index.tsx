import { useEffect, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { track, EVENTS } from '../../src/lib/analytics';
import { usePurchases, type PurchaseStatus } from '../../src/features/purchases/usePurchases';
import PaywallSheet from '../../src/features/paywall/PaywallSheet';
import { getProofCues } from '../../src/features/paywall/proofCues';
import { makePriceFor } from '../../src/features/paywall/storePrices';
import { purchasePlan, storePlatform, useFoundingSeats } from '../../src/features/paywall/hooks';
import { FOUNDING_SEATS_TOTAL } from '../../src/features/paywall/entitlements';
import { submitDraft } from '../../src/features/capture/submit';
import type { Phase } from '../../src/features/paywall/ui';

// Paywall at video 4. The capture flow saves the clip first, then opens
// /paywall?clip=<id>&movement=snatch over Review.
export default function PaywallRoute() {
  const p = useLocalSearchParams<{
    clip?: string;
    movement?: string;
    phase?: Phase;
    outcome?: PurchaseStatus;
    seats?: string;
  }>();
  const router = useRouter();
  const offerings = usePurchases((s) => s.offerings);
  const demo = usePurchases((s) => s.demo);
  const loaded = useFoundingSeats();
  const seats = p.seats !== undefined ? { total: FOUNDING_SEATS_TOTAL, remaining: Number(p.seats) } : loaded;
  const priceFor = useMemo(() => makePriceFor(offerings), [offerings]);
  const movement = p.movement ?? 'lift';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  useEffect(() => {
    track(EVENTS.PAYWALL_VIEWED, { surface: 'video4' });
  }, []);
  useEffect(() => {
    if (demo && p.outcome) usePurchases.getState().setDemoOutcome(p.outcome);
  }, [demo, p.outcome]);

  return (
    <PaywallSheet
      key={`${p.phase ?? ''}-${p.seats ?? ''}`}
      cues={getProofCues()}
      seats={seats}
      platform={storePlatform()}
      now={new Date()}
      queuedMovement={p.clip ? movement : undefined}
      initialPhase={p.phase}
      priceFor={priceFor}
      purchase={purchasePlan}
      onNotNow={back}
      onRestore={async () => {
        const tier = await usePurchases.getState().restore();
        if (tier !== 'free') back();
      }}
      onWatch={() => {
        if (!submitDraft({ replace: true })) router.replace('/analysis/processing');
      }}
    />
  );
}
