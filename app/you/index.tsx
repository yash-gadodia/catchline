import { useRouter, type Href } from 'expo-router';
import YouScreen from '../../src/features/you/YouScreen';

export default function YouRoute() {
  const router = useRouter();
  return (
    <YouScreen
      nav={{
        onWhatIsStored: () => router.push('/you/stored'),
        onDeleteAccount: () => router.push('/you/delete'),
        onPlan: () => router.push('/paywall'),
        onReport: () => router.push('/report' as Href),
        onWhatsNew: () => router.push('/whats-new' as Href),
        onInvite: () => router.push('/you/invite' as Href),
      }}
    />
  );
}
