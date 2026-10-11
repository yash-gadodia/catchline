import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePurchases } from '../../src/features/purchases/usePurchases';
import CapSheet from '../../src/features/paywall/CapSheet';
import { nextTier, type PaidTier, type Period } from '../../src/features/paywall/entitlements';
import { useUsage } from '../../src/features/paywall/usageStore';

export default function CapRoute() {
  const p = useLocalSearchParams<{ tier?: PaidTier; period?: Period; clip?: string; movement?: string }>();
  const router = useRouter();
  const storeTier = usePurchases((s) => s.tier);
  const storePeriod = usePurchases((s) => s.period);
  const tier: PaidTier = p.tier ?? (storeTier === 'free' ? 'pull' : storeTier);
  const period: Period = p.period ?? storePeriod ?? 'annual';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <CapSheet
      key={`${tier}-${period}`}
      tier={tier}
      period={period}
      now={new Date()}
      onQueue={() => {
        if (p.clip) useUsage.getState().queueClip({ id: p.clip, movement: p.movement ?? 'lift' });
        back();
      }}
      onUpgrade={() => {
        const to = nextTier(tier);
        if (to) router.replace({ pathname: '/paywall/upgrade', params: { from: tier, to, period } });
      }}
    />
  );
}
