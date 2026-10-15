import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePurchases } from '../../src/features/purchases/usePurchases';
import CapSheet from '../../src/features/paywall/CapSheet';
import type { PaidTier } from '../../src/features/paywall/entitlements';

export default function CapRoute() {
  const p = useLocalSearchParams<{ tier?: PaidTier; clip?: string; movement?: string }>();
  const router = useRouter();
  const storeTier = usePurchases((s) => s.tier);
  const tier: PaidTier = p.tier ?? (storeTier === 'free' ? 'pull' : storeTier);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return <CapSheet key={tier} tier={tier} now={new Date()} onQueue={back} />;
}
