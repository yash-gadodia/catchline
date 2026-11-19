import { useRouter, type Href } from 'expo-router';
import YouScreen from '../../src/features/you/YouScreen';

export default function YouRoute() {
  const router = useRouter();
  return (
    <YouScreen
      nav={{
        onWhatIsStored: () => router.push('/you/stored' as Href),
        onDeleteAccount: () => router.push('/you/delete' as Href),
        onPlan: () => router.push('/paywall' as Href),
        onReport: () => router.push('/report' as Href),
        onWhatsNew: () => router.push('/whats-new' as Href),
        onInvite: () => router.push('/you/invite' as Href),
      }}
    />
  );
}
