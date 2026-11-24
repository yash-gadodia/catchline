import { useRouter, type Href } from 'expo-router';
import LearnScreen from '../../src/features/learn/LearnScreen';
import { LEARN_LIFTS } from '../../src/features/learn/lifts';

export default function LearnRoute() {
  const router = useRouter();
  return <LearnScreen lifts={LEARN_LIFTS} onOpen={(id) => router.push(`/learn/${id}` as Href)} />;
}
