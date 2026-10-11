import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import LastFreeSheet from '../../src/features/paywall/LastFreeSheet';
import { useUsage } from '../../src/features/paywall/usageStore';

export default function LastFreeRoute() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const router = useRouter();
  const go = (href: Href) => {
    useUsage.getState().warnLastFree();
    router.replace(href);
  };
  return <LastFreeSheet onContinue={() => go((next ?? '/capture') as Href)} onPlans={() => go('/paywall/plans')} />;
}
