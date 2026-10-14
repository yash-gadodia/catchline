import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import SendToCoachSheet from '../../src/features/share/SendToCoachSheet';

export default function SendToCoachRoute() {
  const { fixture } = useLocalSearchParams<{ fixture?: string }>();
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const load = useAnalysis(fixture);
  if (load.status !== 'ready') return <AnalysisPlaceholder status={load.status} onBack={back} />;
  return <SendToCoachSheet analysis={load.analysis} onClose={back} />;
}
