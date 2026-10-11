import { useRouter, type Href } from 'expo-router';
import YouTab from '../../src/features/library/YouTab';

export default function YouRoute() {
  const router = useRouter();
  return <YouTab onOpen={() => router.push('/you' as Href)} onDev={() => router.push('/dev')} />;
}
