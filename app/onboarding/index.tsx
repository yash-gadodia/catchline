import { useEffect } from 'react';
import { EVENTS, track } from '../../src/lib/analytics';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { backendEnabled, syncConsent } from '../../src/data/backend';
import WelcomeScreen from '../../src/features/onboarding/WelcomeScreen';
import { useOnboarding } from '../../src/features/onboarding/store';

// Onboarding is this one screen: a tracked lift playing, then the lifter's own video or the sample tour. Going on
// records the consent named under the buttons.
export default function WelcomeRoute() {
  const router = useRouter();
  // replay=1: opened again from the You page; not counted in the welcome funnel
  const replay = useLocalSearchParams<{ replay?: string }>().replay === '1';
  const count: typeof track = (event, props) => (replay ? undefined : track(event, props));
  const accept = () => {
    useOnboarding.getState().acceptConsent();
    if (backendEnabled()) syncConsent().catch(() => undefined);
  };
  const start = (href: Href) => {
    useOnboarding.getState().complete();
    router.replace(href);
  };
  useEffect(() => {
    count(EVENTS.WELCOME_VIEWED, {});
  }, []);
  return (
    <WelcomeScreen
      onSample={() => {
        count(EVENTS.WELCOME_CHOICE, { choice: 'sample' });
        // the terms line sits under this button too: going on to the sample accepts them, as Pick does (#237)
        accept();
        router.push('/analysis/sample?from=welcome' as Href);
      }}
      onPick={() => {
        count(EVENTS.WELCOME_CHOICE, { choice: 'pick' });
        accept();
        start('/capture/import');
      }}
    />
  );
}
