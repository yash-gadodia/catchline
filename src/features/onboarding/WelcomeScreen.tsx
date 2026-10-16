import { Image, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Btn from '../../components/Btn';
import { colors, shade, space } from '../../design/tokens';
import { display } from '../../design/typography';
import { t } from '../../i18n';

const HERO = require('../../../assets/art/welcome-hero.png');

export default function WelcomeScreen({ onDemo, onImport }: { onDemo: () => void; onImport: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const box = { width, height: Math.max(height - 260, width) };

  return (
    <View testID="welcome-screen" style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'flex-end' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height, overflow: 'hidden' }}>
        <Image
          testID="welcome-hero"
          source={HERO}
          resizeMode="cover"
          style={{ position: 'absolute', left: 0, top: insets.top, width: box.width, height: box.height - insets.top }}
        />
        <LinearGradient
          colors={[shade(0), colors.bg]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 160 }}
          pointerEvents="none"
        />
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) + space.s6, gap: space.s5 }}>
        <Text style={[display(44), { color: colors.text }]}>{t('onboarding.welcome.title')}</Text>
        <View style={{ gap: space.s3 }}>
          <Btn onPress={onDemo} testID="welcome-demo">
            {t('onboarding.welcome.demo')}
          </Btn>
          <Btn kind="secondary" onPress={onImport} testID="welcome-import">
            {t('onboarding.welcome.import')}
          </Btn>
        </View>
      </View>
    </View>
  );
}
