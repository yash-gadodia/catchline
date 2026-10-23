import { Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { colors, space } from '../design/tokens';
import { fontFamily } from '../design/typography';
import { t } from '../i18n';
import { useLaunch } from '../lib/launch';
import Btn from './Btn';

export function LaunchRecovery() {
  const stalled = useLaunch((s) => s.stalled);
  if (!stalled) return null;
  return (
    <View
      testID="launch-recovery"
      style={{ position: 'absolute', inset: 0, backgroundColor: colors.bg, justifyContent: 'center', padding: space.gutter, gap: space.s4 }}
    >
      <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 22, lineHeight: 28 }}>
        {t('common.launch.title')}
      </Text>
      <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>
        {t('common.launch.body')}
      </Text>
      <Btn
        kind="secondary"
        testID="launch-retry"
        onPress={() => Updates.reloadAsync().catch(() => useLaunch.setState({ stalled: false }))}
      >
        {t('common.launch.retry')}
      </Btn>
    </View>
  );
}
