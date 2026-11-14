import { useRouter, type Href } from 'expo-router';
import YouScreen from '../../src/features/you/YouScreen';
import { openReportInIntercom } from '../../src/data/intercom';

export default function YouRoute() {
  const router = useRouter();
  return (
    <YouScreen
      nav={{
        onWhatIsStored: () => router.push('/you/stored' as Href),
        onDeleteAccount: () => router.push('/you/delete' as Href),
        onPlan: () => router.push('/paywall' as Href),
        onReport: () =>
          void openReportInIntercom().then((opened) => {
            if (!opened) router.push('/report' as Href);
          }),
        onWhatsNew: () => router.push('/whats-new' as Href),
      }}
    />
  );
}
