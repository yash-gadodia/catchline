import { useLocalSearchParams, useRouter } from 'expo-router';
import ReportProblemScreen from '../src/features/you/ReportProblemScreen';
import { t } from '../src/i18n';

export default function ReportRoute() {
  const router = useRouter();
  const { lift, context, shot } = useLocalSearchParams<{ lift?: string; context?: string; shot?: string }>();
  return (
    <ReportProblemScreen
      liftId={lift}
      context={context}
      shot={shot}
      back={lift ? t('analysis.actions.title') : t('you.title')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
