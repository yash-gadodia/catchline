import { View } from 'react-native';
import Mark from '../../components/Mark';
import { colors } from '../../design/tokens';

export default function LaunchScreen() {
  return (
    <View
      testID="launch-screen"
      // i18n-ok: brand name
      accessibilityLabel="Catchline"
      style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Mark size={120} />
    </View>
  );
}
