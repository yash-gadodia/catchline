import { useRouter, type Href } from 'expo-router';
import YouScreen from '../../src/features/you/YouScreen';

export default function YouRoute() {
  const router = useRouter();
  return (
    <YouScreen
      nav={{
        onDemo: () => router.push('/onboarding/demo?from=app' as Href),
        onWhatIsStored: () => router.push('/you/stored'),
        onDeleteAccount: () => router.push('/you/delete'),
        onPlan: () => router.push('/paywall/plans'),
        onHelp: () => {},
      }}
    />
  );
}
