import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';
import Btn from '../../components/Btn';
import { Body, Screen, Title } from './ui';
import { t } from '../../i18n';

export default function CameraScreen({
  denied,
  onAllow,
  onSettings,
  onImport,
}: {
  denied: boolean;
  onAllow: () => void;
  onSettings: () => void;
  onImport: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Screen top={insets.top} bottom={insets.bottom} testID={denied ? 'camera-denied' : 'camera-prompt'}>
      <View style={{ flex: 1 }} />
      {denied ? (
        <>
          <Title>{t('onboarding.camera.deniedTitle')}</Title>
          <Body>{t('onboarding.camera.deniedBody')}</Body>
          <Btn kind="secondary" onPress={onSettings} testID="camera-settings">
            {t('onboarding.camera.openSettings')}
          </Btn>
          <Btn onPress={onImport} testID="camera-import">
            {t('onboarding.camera.importClip')}
          </Btn>
        </>
      ) : (
        <>
          <Title>{t('onboarding.camera.promptTitle')}</Title>
          <Body>{t('onboarding.camera.promptBody')}</Body>
          <Btn onPress={onAllow} testID="camera-allow">
            {t('onboarding.camera.allow')}
          </Btn>
          <Btn kind="text" onPress={onImport} testID="camera-import" style={{ alignSelf: 'center' }}>
            {t('onboarding.camera.importInstead')}
          </Btn>
        </>
      )}
    </Screen>
  );
}
