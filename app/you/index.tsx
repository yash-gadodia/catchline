import { useRouter, type Href } from 'expo-router';
import YouScreen from '../../src/features/you/YouScreen';
import { intercomConfigured, openIntercomMessenger, openReportInIntercom } from '../../src/data/intercom';

export default function YouRoute() {
  const router = useRouter();
  return (
    <YouScreen
      nav={{
        onDemo: () => router.push('/onboarding/demo?from=app' as Href),
        onWhatIsStored: () => router.push('/you/stored'),
        onDeleteAccount: () => router.push('/you/delete'),
        onPlan: () => router.push('/paywall/plans'),
        onReport: () =>
          void openReportInIntercom().then((opened) => {
            if (!opened) router.push('/report' as Href);
          }),
        onSupport: intercomConfigured()
          ? () =>
              void openIntercomMessenger().then((opened) => {
                if (!opened) router.push('/report' as Href);
              })
          : undefined,
        onWhatsNew: () => router.push('/whats-new' as Href),
        onHelp: () => {},
      }}
    />
  );
}
