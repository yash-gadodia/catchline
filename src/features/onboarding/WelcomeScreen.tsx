import { Image, Linking, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Btn from '../../components/Btn';
import { colors, shade, space } from '../../design/tokens';
import { display, type } from '../../design/typography';
import { PRIVACY_URL, TERMS_URL } from '../../lib/links';
import { t } from '../../i18n';

const HERO = require('../../../assets/art/welcome-hero.png');

// Step 1 of 3: the promise, that nothing leaves the phone, and the terms the lifter accepts by going on.
export default function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const box = { width, height: Math.max(height - 340, width) };

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
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) + space.s4, gap: space.s5 }}>
        <View style={{ gap: space.s2 }}>
          <Text style={[display(44), { color: colors.text }]}>{t('onboarding.welcome.title')}</Text>
          <Text style={{ color: colors.text, ...type.body }}>{t('onboarding.welcome.body')}</Text>
          <Text style={{ color: colors.text2, ...type.callout }}>{t('onboarding.welcome.private')}</Text>
        </View>
        <Btn onPress={onContinue} testID="welcome-start">
          {t('onboarding.welcome.start')}
        </Btn>
        <Text style={{ color: colors.text2, ...type.small, textAlign: 'center' }}>
          {t('onboarding.welcome.agree')}
          {'\n'}
          <Text style={{ color: colors.text2, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link" testID="link-terms">
            {t('onboarding.privacy.terms')}
          </Text>
          {' · '}
          <Text style={{ color: colors.text2, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link" testID="link-privacy">
            {t('onboarding.privacy.policy')}
          </Text>
        </Text>
      </View>
    </View>
  );
}
