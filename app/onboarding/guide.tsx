import { useRouter } from 'expo-router';
import GuideScreen from '../../src/features/onboarding/GuideScreen';
import { t } from '../../src/i18n';

// How to film, opened from the viewfinder's "?"; it just closes again.
export default function GuideRoute() {
  const router = useRouter();
  return <GuideScreen label={t('onboarding.guide.done')} onDone={() => router.back()} />;
}
