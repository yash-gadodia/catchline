import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import TrialPaywall from '../../../src/features/paywall/TrialPaywall';
import { purchasePlan, storePlatform } from '../../../src/features/paywall/hooks';
import { WEB_CHECKOUT_URL, webCheckoutEnabled } from '../../../src/features/paywall/flags';
import { track, EVENTS } from '../../../src/lib/analytics';
import { submitDraft } from '../../../src/features/capture/submit';

export default function TrialRoute() {
  const { web } = useLocalSearchParams<{ web?: string }>();
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  useEffect(() => {
    track(EVENTS.PAYWALL_VIEWED, { surface: 'ad_trial' });
  }, []);
  return (
    <TrialPaywall
      now={new Date()}
      platform={storePlatform()}
      webCheckout={web === '1' || webCheckoutEnabled()}
      purchase={purchasePlan}
      onWeb={(period) => {
        if (WEB_CHECKOUT_URL) WebBrowser.openBrowserAsync(`${WEB_CHECKOUT_URL}?plan=pull_${period}`);
      }}
      onDone={() => {
        if (!submitDraft({ replace: true })) router.replace('/analysis/processing');
      }}
      onClose={back}
    />
  );
}
