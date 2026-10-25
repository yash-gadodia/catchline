import { useLocalSearchParams, useRouter } from 'expo-router';
import ReportProblemScreen from '../src/features/you/ReportProblemScreen';
import { useAnalysis } from '../src/analysis/useAnalysis';
import { analysisSummary } from '../src/features/analysis/liftActions';
import { intercomConfigured, openReportInIntercom } from '../src/data/intercom';
import { t } from '../src/i18n';

export default function ReportRoute() {
  const router = useRouter();
  const { lift, context } = useLocalSearchParams<{ lift?: string; context?: string }>();
  const load = useAnalysis(lift);
  return (
    <ReportProblemScreen
      liftId={lift}
      context={context}
      numbers={lift && load.status === 'ready' ? analysisSummary(load.analysis) : undefined}
      sendToIntercom={intercomConfigured() ? (body) => openReportInIntercom(lift, body) : undefined}
      back={lift ? t('analysis.actions.title') : t('you.title')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
