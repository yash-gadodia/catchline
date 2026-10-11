import { useLocalSearchParams, useRouter } from 'expo-router';
import FoundingSheet from '../../src/features/paywall/FoundingSheet';
import { purchasePlan, storePlatform, useFoundingSeats } from '../../src/features/paywall/hooks';
import { FOUNDING_SEATS_TOTAL } from '../../src/features/paywall/entitlements';

export default function FoundingRoute() {
  const p = useLocalSearchParams<{ seats?: string }>();
  const router = useRouter();
  const loaded = useFoundingSeats();
  const seats = p.seats !== undefined ? { total: FOUNDING_SEATS_TOTAL, remaining: Number(p.seats) } : loaded;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!seats) return null;
  return (
    <FoundingSheet
      key={p.seats ?? 'live'}
      seats={seats}
      platform={storePlatform()}
      now={new Date()}
      purchase={purchasePlan}
      onYearly={() => router.replace('/paywall')}
      onSeePlans={() => router.replace('/paywall/plans')}
      onDone={back}
    />
  );
}
