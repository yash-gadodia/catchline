import { Linking, View, useWindowDimensions } from 'react-native';
import Text from '../../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Btn from '../../components/Btn';
import { colors, shade, space } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import { PRIVACY_URL, TERMS_URL } from '../../lib/links';
import { t } from '../../i18n';
import SampleLift from './SampleLift';

// All of onboarding: a tracked lift playing, what sets Catchline apart in three lines (private, both sports, bar
// speed free), and two buttons: the 15-second sample tour first, a lift of the lifter's own second. No filming here:
// nobody installs mid-session at the bar.
// Going on accepts the terms named under the buttons.
export default function WelcomeScreen({ onPick, onSample, reduceMotion }: { onPick: () => void; onSample: () => void; reduceMotion?: boolean }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const systemReduce = useReducedMotion();
  const box = { width, height: Math.max(height - 430, 240) };

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
        <View style={{ gap: space.s3 }}>
          <Text style={[display(44), { color: colors.text }]}>{t('onboarding.welcome.title')}</Text>
          <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'stretch' }}>
            <View style={{ width: 3, backgroundColor: colors.flare }} />
            <View style={{ flex: 1, gap: space.s1 }} testID="welcome-usp">
              <Text style={{ color: colors.text, ...type.body, fontFamily: fontFamily.bodyBold }}>{t('onboarding.welcome.private')}</Text>
              <Text style={{ color: colors.text, ...type.body }}>{t('onboarding.welcome.sports')}</Text>
              <Text style={{ color: colors.text, ...type.body }}>{t('onboarding.welcome.free')}</Text>
            </View>
          </View>
        </View>
        <View style={{ gap: space.s3 }}>
          <Btn onPress={onSample} testID="welcome-sample">
            {t('onboarding.welcome.sample')}
          </Btn>
          <Btn kind="secondary" compact onPress={onPick} testID="welcome-pick">
            {t('onboarding.welcome.pick')}
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
        <Text style={{ color: colors.text2, ...type.small, textAlign: 'center' }} testID="welcome-made-by">
          {t('you.madeBy')}
        </Text>
      </View>
    </View>
  );
}
