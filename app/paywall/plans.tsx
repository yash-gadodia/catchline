import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePurchases, presentCustomerCenter } from '../../src/features/purchases/usePurchases';
import PlansScreen from '../../src/features/paywall/PlansScreen';
import { renewalDate } from '../../src/features/paywall/copy';
import type { Tier } from '../../src/features/paywall/entitlements';
import { logIntercomEvent } from '../../src/data/intercom';

export default function PlansRoute() {
  const { tier: demoTier } = useLocalSearchParams<{ tier?: Tier }>();
  const router = useRouter();
  const tier = usePurchases((s) => s.tier);
  const period = usePurchases((s) => s.period);
  const expiresAt = usePurchases((s) => s.expiresAt);
  const current = demoTier ?? tier;
  const renews = expiresAt
    ? new Date(expiresAt)
    : current === 'free' || current === 'founding'
      ? null
      : renewalDate(new Date(), period ?? 'annual');
  return (
    <PlansScreen
      current={current}
      renews={renews}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onChangePlan={async () => {
        if (current !== 'free' && (await presentCustomerCenter())) {
          void logIntercomEvent('subscription_cancel_viewed', { plan_tier: current });
          return;
        }
        router.push('/paywall');
      }}
    />
  );
}
