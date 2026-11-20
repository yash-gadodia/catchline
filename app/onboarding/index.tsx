import { useEffect } from 'react';
import { EVENTS, track } from '../../src/lib/analytics';
import { useRouter, type Href } from 'expo-router';
import { backendEnabled, syncConsent } from '../../src/data/backend';
import { useCameraPermission } from '../../src/features/capture/camera';
import WelcomeScreen from '../../src/features/onboarding/WelcomeScreen';
import { useOnboarding } from '../../src/features/onboarding/store';

// Onboarding is this one screen: a tracked lift playing, then straight to the lifter's own video. Going on records
// the consent named under the buttons.
export default function WelcomeRoute() {
  const router = useRouter();
  const camera = useCameraPermission();
  const accept = () => {
    useOnboarding.getState().acceptConsent();
    if (backendEnabled()) syncConsent().catch(() => undefined);
  };
  const start = (href: Href) => {
    useOnboarding.getState().complete();
    router.replace(href);
  };
  useEffect(() => {
    track(EVENTS.WELCOME_VIEWED, {});
  }, []);
  return (
    <WelcomeScreen
      onSample={() => {
        track(EVENTS.WELCOME_CHOICE, { choice: 'sample' });
        // the terms line sits under this button too: going on to the sample accepts them, as Pick and Film do (#237)
        accept();
        router.push('/analysis/sample?from=welcome' as Href);
      }}
      onPick={() => {
        track(EVENTS.WELCOME_CHOICE, { choice: 'pick' });
        accept();
        start('/capture/import');
      }}
      onFilm={async () => {
        track(EVENTS.WELCOME_CHOICE, { choice: 'film' });
        accept();
        if ((await camera.request()) === 'granted') start('/capture');
        else router.push('/onboarding/camera?state=denied');
      }}
    />
  );
}
