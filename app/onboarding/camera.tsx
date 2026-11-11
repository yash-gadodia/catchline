import { useState } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCameraPermission } from '../../src/features/capture/camera';
import CameraScreen from '../../src/features/onboarding/CameraScreen';
import { useOnboarding } from '../../src/features/onboarding/store';

// The last onboarding step, and where the viewfinder sends a lifter whose camera is off.
// Dev link: ?state=denied.
export default function AddVideoRoute() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const router = useRouter();
  const camera = useCameraPermission();
  const [refused, setRefused] = useState(false);
  const denied = state === 'denied' || refused || (camera.status === 'denied' && !camera.canAskAgain);
  const start = (href: Href) => {
    useOnboarding.getState().complete();
    router.replace(href);
  };
  return (
    <CameraScreen
      denied={denied}
      onChoose={() => start('/capture/import')}
      onFilm={async () => {
        if ((await camera.request()) === 'granted') start('/capture');
        else setRefused(true);
      }}
      onSettings={camera.openSettings}
    />
  );
}
