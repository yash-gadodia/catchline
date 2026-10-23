import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';
import Btn from '../../components/Btn';
import { Body, Screen, Title } from './ui';
import { t } from '../../i18n';

export default function NotifyScreen({
  denied,
  onAllow,
  onSkip,
}: {
  denied: boolean;
  onAllow: () => void;
  onSkip: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Screen top={insets.top} bottom={insets.bottom} testID="notify-prompt">
      <View style={{ flex: 1 }} />
      <Title>{t('notifications.onboarding.title')}</Title>
      <Body>{t('notifications.onboarding.body')}</Body>
      <Btn onPress={onAllow} testID="notify-allow">
        {denied ? t('notifications.openSettings') : t('notifications.turnOn')}
      </Btn>
      <Btn kind="text" onPress={onSkip} testID="notify-skip" style={{ alignSelf: 'center' }}>
        {t('notifications.notNow')}
      </Btn>
    </Screen>
  );
}
