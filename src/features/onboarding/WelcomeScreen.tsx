import { Linking, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Btn from '../../components/Btn';
import { colors, shade, space } from '../../design/tokens';
import { display, type } from '../../design/typography';
import { PRIVACY_URL, TERMS_URL } from '../../lib/links';
import { t } from '../../i18n';
import SampleLift from './SampleLift';

// All of onboarding: a tracked lift playing, the promise, and the two ways to a lift of the lifter's own. Going on
// accepts the terms named under the buttons.
export default function WelcomeScreen({ onPick, onFilm, reduceMotion }: { onPick: () => void; onFilm: () => void; reduceMotion?: boolean }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const systemReduce = useReducedMotion();
  const box = { width, height: Math.max(height - 400, 240) };

  return (
    <View testID="welcome-screen" style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'flex-end' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height }}>
        <SampleLift box={box} reduce={reduceMotion ?? systemReduce} />
        <LinearGradient
          colors={[shade(0), colors.bg]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 }}
          pointerEvents="none"
        />
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) + space.s2, gap: space.s4 }}>
        <View style={{ gap: space.s2 }}>
          <Text style={[display(44), { color: colors.text }]}>{t('onboarding.welcome.title')}</Text>
          <Text style={{ color: colors.text, ...type.body }}>{t('onboarding.welcome.body')}</Text>
          <Text style={{ color: colors.text2, ...type.callout }}>{t('onboarding.welcome.private')}</Text>
        </View>
        <View style={{ gap: space.s3 }}>
          <Btn onPress={onPick} testID="welcome-pick">
            {t('onboarding.welcome.pick')}
          </Btn>
          <Btn kind="secondary" compact onPress={onFilm} testID="welcome-film">
            {t('onboarding.welcome.film')}
          </Btn>
        </View>
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
