import { useRouter, type Href } from 'expo-router';
import YouScreen from '../../src/features/you/YouScreen';

export default function YouRoute() {
  const router = useRouter();
  return (
    <YouScreen
      nav={{
        onDemo: () => router.push('/onboarding/demo?from=app' as Href),
        onWhatIsStored: () => router.push('/you/stored' as Href),
        onDeleteAccount: () => router.push('/you/delete' as Href),
        onPlan: () => router.push('/paywall/plans' as Href),
        onHelp: () => {
          if (__DEV__) router.push('/dev' as Href);
        },
      }}
    />
  );
}
