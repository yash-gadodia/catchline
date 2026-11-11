import { useLocalSearchParams, useRouter } from 'expo-router';
import GuideScreen from '../../src/features/onboarding/GuideScreen';
import { t } from '../../src/i18n';

// `?from=capture` opens it from the viewfinder's "?" and just closes again.
export default function GuideRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const router = useRouter();
  if (from === 'capture') return <GuideScreen label={t('onboarding.guide.done')} onDone={() => router.back()} />;
  return <GuideScreen label={t('onboarding.guide.next')} onDone={() => router.push('/onboarding/camera')} />;
}
