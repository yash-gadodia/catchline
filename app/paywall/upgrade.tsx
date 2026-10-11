import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePurchases } from '../../src/features/purchases/usePurchases';
import UpgradeSheet from '../../src/features/paywall/UpgradeSheet';
import { purchasePlan, storePlatform } from '../../src/features/paywall/hooks';
import { foundingUpgradeQuote, upgradeQuote, type Period, type SubTier } from '../../src/features/paywall/entitlements';

const DAY = 24 * 60 * 60 * 1000;

export default function UpgradeRoute() {
  const p = useLocalSearchParams<{ from?: SubTier | 'founding'; to?: SubTier; period?: Period; days?: string }>();
  const router = useRouter();
  const expiresAt = usePurchases((s) => s.expiresAt);
  const from = p.from ?? 'hook';
  const to = p.to ?? 'pull';
  const period = p.period ?? 'annual';
  const now = new Date();
  const periodDays = period === 'annual' ? 365 : 30;
  const daysLeft = p.days
    ? Number(p.days)
    : expiresAt
      ? Math.ceil((Date.parse(expiresAt) - now.getTime()) / DAY)
      : periodDays;
  const quote =
    from === 'founding'
      ? foundingUpgradeQuote(to, period)
      : upgradeQuote(from, to, period, daysLeft, periodDays, storePlatform());
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <UpgradeSheet
      key={`${from}-${to}-${period}`}
      from={from}
      to={to}
      period={period}
      quote={quote}
      platform={storePlatform()}
      now={now}
      purchase={purchasePlan}
      onStay={back}
      onDone={back}
    />
  );
}
