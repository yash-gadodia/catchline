import { useRouter, type Href } from 'expo-router';
import { SAMPLE_ROUTE } from '../../src/analysis/fixtures';
import { liftLink } from '../../src/features/library/derive';
import LiftsScreen from '../../src/features/library/LiftsScreen';

export default function LiftsRoute() {
  const router = useRouter();
  const unlock = () => router.push('/paywall' as Href);
  return (
    <LiftsScreen
      nav={{
        onOpen: (lift) => {
          const link = liftLink(lift);
          if (link) router.push(link);
          else unlock();
        },
        onRetake: () => router.push('/capture' as Href),
        onUnlock: unlock,
        onRecord: () => router.push('/capture' as Href),
        onImport: () => router.push('/capture?source=import' as Href),
        onSample: () => router.push(SAMPLE_ROUTE),
        onCue: (id) => router.push({ pathname: '/cue/[id]', params: { id } }),
      }}
    />
  );
}
