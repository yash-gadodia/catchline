import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';
import Btn from '../../components/Btn';
import { Body, Screen, Title } from './ui';
import { t } from '../../i18n';

// Step 3 of 3: pick a video or film one. The camera is only asked for when the
// lifter chooses to film; `denied` is the camera switched off in Settings.
export default function CameraScreen({
  denied,
  onChoose,
  onFilm,
  onSettings,
}: {
  denied: boolean;
  onChoose: () => void;
  onFilm: () => void;
  onSettings: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Screen top={insets.top} bottom={insets.bottom} testID={denied ? 'camera-denied' : 'add-video'}>
      <View style={{ flex: 1 }} />
      <Title>{t(denied ? 'onboarding.camera.deniedTitle' : 'onboarding.add.title')}</Title>
      <Body>{t(denied ? 'onboarding.camera.deniedBody' : 'onboarding.add.body')}</Body>
      <Btn onPress={onChoose} testID="add-choose">
        {t('onboarding.add.choose')}
      </Btn>
      {denied ? (
        <Btn kind="secondary" onPress={onSettings} testID="camera-settings">
          {t('onboarding.camera.openSettings')}
        </Btn>
      ) : (
        <Btn kind="secondary" onPress={onFilm} testID="add-film">
          {t('onboarding.add.film')}
        </Btn>
      )}
    </Screen>
  );
}
