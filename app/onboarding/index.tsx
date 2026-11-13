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
  return (
    <WelcomeScreen
      onPick={() => {
        accept();
        start('/capture/import');
      }}
      onFilm={async () => {
        accept();
        if ((await camera.request()) === 'granted') start('/capture');
        else router.push('/onboarding/camera?state=denied');
      }}
    />
  );
}
