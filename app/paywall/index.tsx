import { useEffect, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { track, EVENTS } from '../../src/lib/analytics';
import { presentCustomerCenter, usePurchases, type PurchaseStatus } from '../../src/features/purchases/usePurchases';
import PaywallSheet from '../../src/features/paywall/PaywallSheet';
import { annualSavingFor, makePriceFor } from '../../src/features/paywall/storePrices';
import { purchasePlan, storePlatform, useFoundingSeats, useVideosLeft } from '../../src/features/paywall/hooks';
import { FOUNDING_SEATS_TOTAL } from '../../src/features/paywall/entitlements';
import { submitDraft } from '../../src/features/capture/submit';
import type { Phase } from '../../src/features/paywall/ui';

// The one paywall. Capture saves the clip first and opens /paywall/cap?clip=<id> when
// this week's free videos are used; the Plan row and the free chip open /paywall.
// Dev links: &phase=, &outcome= (what a demo purchase resolves to), &seats=.
export default function PaywallRoute() {
  const p = useLocalSearchParams<{ clip?: string; phase?: Phase; outcome?: PurchaseStatus; seats?: string }>();
  const router = useRouter();
  const tier = usePurchases((s) => s.tier);
  const offerings = usePurchases((s) => s.offerings);
  const demo = usePurchases((s) => s.demo);
  const loaded = useFoundingSeats();
  const seats = p.seats !== undefined ? { total: FOUNDING_SEATS_TOTAL, remaining: Number(p.seats) } : loaded;
  const priceFor = useMemo(() => makePriceFor(offerings), [offerings]);
  const savePct = useMemo(() => annualSavingFor(offerings), [offerings]);
  const freeLeft = useVideosLeft();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  // After a purchase or restore: track the clip the lifter already picked, else close.
  const done = () => {
    if (!p.clip || !submitDraft({ replace: true })) back();
  };

  useEffect(() => {
    track(EVENTS.PAYWALL_VIEWED, { surface: freeLeft > 0 ? 'plan' : 'weekly_cap' });
  }, []);
  useEffect(() => {
    if (demo && p.outcome) usePurchases.getState().setDemoOutcome(p.outcome);
  }, [demo, p.outcome]);

  return (
    <PaywallSheet
      key={`${p.phase ?? ''}-${p.seats ?? ''}`}
      tier={tier}
      freeLeft={freeLeft}
      seats={seats}
      platform={storePlatform()}
      now={new Date()}
      queued={!!p.clip}
      initialPhase={p.phase}
      priceFor={priceFor}
      savePct={savePct}
      purchase={purchasePlan}
      onNotNow={back}
      onRestore={async () => {
        if ((await usePurchases.getState().restore()) !== 'free') done();
      }}
      onManage={() => void presentCustomerCenter()}
      onDone={done}
    />
  );
}
