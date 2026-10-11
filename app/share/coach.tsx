import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAnalysis } from '../../src/analysis/fixtures';
import SendToCoachSheet from '../../src/features/share/SendToCoachSheet';

export default function SendToCoachRoute() {
  const { fixture } = useLocalSearchParams<{ fixture?: string }>();
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return <SendToCoachSheet analysis={getAnalysis(fixture)} onClose={back} />;
}
