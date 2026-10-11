import { useRouter } from 'expo-router';
import CuesScreen from '../../src/features/library/CuesScreen';

export default function CuesRoute() {
  const router = useRouter();
  return <CuesScreen onOpen={(cue) => router.push({ pathname: '/cue/[id]', params: { id: cue.id } })} />;
}
