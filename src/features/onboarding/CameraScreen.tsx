import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';
import Btn from '../../components/Btn';
import { Body, Screen, Title } from './ui';

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
          <Title>Camera is off for Catchline.</Title>
          <Body>Turn it on in Settings, or import a clip you've already filmed.</Body>
          <Btn kind="secondary" onPress={onSettings} testID="camera-settings">
            Open Settings
          </Btn>
          <Btn onPress={onImport} testID="camera-import">
            Import a clip
          </Btn>
        </>
      ) : (
        <>
          <Title>Catchline needs the camera to film your lift.</Title>
          <Body>Nothing records until you press the button. You can also import a clip instead.</Body>
          <Btn onPress={onAllow} testID="camera-allow">
            Allow camera
          </Btn>
          <Btn kind="text" onPress={onImport} testID="camera-import" style={{ alignSelf: 'center' }}>
            Import a clip instead
          </Btn>
        </>
      )}
    </Screen>
  );
}
