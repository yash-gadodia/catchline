import { useLocalSearchParams } from 'expo-router';
import CameraScreen from '../../src/features/onboarding/CameraScreen';
import { useFlow } from '../../src/features/onboarding/useFlow';

export default function CameraRoute() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const film = useFlow('film');
  const imp = useFlow('import');
  const { camera } = film;
  const denied = state === 'denied' || (camera.status === 'denied' && !camera.canAskAgain);
  return (
    <CameraScreen
      denied={denied}
      onAllow={async () => {
        const status = await camera.request();
        film.go('camera', { camera: status });
      }}
      onSettings={camera.openSettings}
      onImport={() => imp.go('camera')}
    />
  );
}
