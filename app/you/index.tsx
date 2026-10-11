import { useRouter } from 'expo-router';
import YouScreen from '../../src/features/you/YouScreen';

export default function YouRoute() {
  const router = useRouter();
  return (
    <YouScreen
      nav={{
        onWhatIsStored: () => router.push('/you/stored'),
        onDeleteAccount: () => router.push('/you/delete'),
        // TODO(paywall): plan management lives with the paywall track.
        onPlan: () => {},
        onHelp: () => {},
      }}
    />
  );
}
