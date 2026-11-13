import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import Btn from '../../components/Btn';
import { colors, space } from '../../design/tokens';
import { fontFamily, type } from '../../design/typography';
import { t } from '../../i18n';
import { Screen, Title } from './ui';

export function guideLines(): string[] {
  return [t('onboarding.guide.still'), t('onboarding.guide.frame'), t('onboarding.guide.angle')];
}

// Step 2 of 3, and the viewfinder's "?": how to film a clip the tracker reads well.
export default function GuideScreen({ label, onDone }: { label: string; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Screen top={insets.top} bottom={insets.bottom} testID="guide">
      <Title>{t('onboarding.guide.title')}</Title>
      <View style={{ height: 300, backgroundColor: colors.surface, overflow: 'hidden' }}>
        <Svg viewBox="0 0 342 300" width="100%" height="100%" fill="none">
          <Line x1={0} y1={250} x2={342} y2={250} stroke={colors.hairline} strokeWidth={1} />
          <Rect x={36} y={222} width={14} height={28} fill={colors.text} opacity={0.9} />
          <Rect x={30} y={236} width={26} height={14} fill={colors.hairline} />
          <Lifter />
          <Path d="M50 230 L150 90" stroke={colors.hairline} strokeWidth={1} strokeDasharray="3 4" />
          <Path d="M50 230 L300 250" stroke={colors.hairline} strokeWidth={1} strokeDasharray="3 4" />
          <SvgText x={24} y={282} fontFamily={fontFamily.mono} fontSize={12} fill={colors.text2}>
            {t('onboarding.guide.caption')}
          </SvgText>
        </Svg>
      </View>
      <View style={{ gap: space.s3 }}>
        {guideLines().map((l) => (
          <Text key={l} style={{ color: colors.text, ...type.body }}>
            {l}
          </Text>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <Btn onPress={onDone} testID="guide-done">
        {label}
      </Btn>
    </Screen>
  );
}

function Lifter() {
  return (
    <G>
      <G fill={colors.text} opacity={0.55}>
        <Circle cx={262} cy={118} r={9} />
        <Path d="M254 128 L270 128 L276 172 L270 210 L258 210 L260 182 L250 182 L246 210 L234 210 L240 172Z" />
        <Path d="M262 128 L292 112 L296 120 L268 136Z" />
      </G>
      <Rect x={296} y={106} width={8} height={18} fill={colors.text} opacity={0.55} />
      <Rect x={236} y={106} width={8} height={18} fill={colors.text} opacity={0.55} />
    </G>
  );
}
