import { useRouter } from 'expo-router';
import WhatsNewScreen from '../src/features/whatsnew/WhatsNewScreen';
import { t } from '../src/i18n';

export default function WhatsNewRoute() {
  const router = useRouter();
  return <WhatsNewScreen back={t('you.title')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
}
