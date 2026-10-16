import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import Btn from '../../components/Btn';
import { colors, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import type { LiftGroup } from './lifts';
import { t } from '../../i18n';
import { Screen, Title } from './ui';

export function guide(group: LiftGroup): { lines: string[]; distance: string; caption: string } {
  return group === 'barbell'
    ? {
        lines: [t('onboarding.guide.barbell.line1'), t('onboarding.guide.barbell.line2'), t('onboarding.guide.oneSet')],
        distance: '3–4 m',
        caption: t('onboarding.guide.barbell.caption'),
      }
    : {
        lines: [t('onboarding.guide.gymnastics.line1'), t('onboarding.guide.gymnastics.line2'), t('onboarding.guide.oneSet')],
        distance: '4–5 m',
        caption: t('onboarding.guide.gymnastics.caption'),
      };
}

export default function GuideScreen({
  group,
  onDone,
  onHide,
}: {
  group: LiftGroup;
  onDone: () => void;
  onHide?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const g = guide(group);
  return (
    <Screen top={insets.top} bottom={insets.bottom} testID={`guide-${group}`}>
      <Title>{t('onboarding.guide.title')}</Title>
      <View style={{ height: 300, backgroundColor: colors.surface, overflow: 'hidden' }}>
        <Svg viewBox="0 0 342 300" width="100%" height="100%" fill="none">
          <Line x1={0} y1={250} x2={342} y2={250} stroke={colors.hairline} strokeWidth={1} />
          <Rect x={36} y={222} width={14} height={28} fill={colors.text} opacity={0.9} />
          <Rect x={30} y={236} width={26} height={14} fill={colors.hairline} />
          {group === 'barbell' ? <Lifter /> : <Hanger />}
          <G stroke={colors.flare} strokeWidth={1.5}>
            <Line x1={56} y1={236} x2={236} y2={236} />
            <Polyline points="62,231 56,236 62,241" />
            <Polyline points="230,231 236,236 230,241" />
          </G>
          <SvgText x={124} y={228} fontFamily={fontFamily.display} fontSize={20} fill={colors.flare}>
            {g.distance}
          </SvgText>
          <Path d="M50 230 L150 90" stroke={colors.hairline} strokeWidth={1} strokeDasharray="3 4" />
          <Path d="M50 230 L300 250" stroke={colors.hairline} strokeWidth={1} strokeDasharray="3 4" />
          <SvgText x={24} y={282} fontFamily={fontFamily.mono} fontSize={12} fill={colors.text2}>
            {g.caption}
          </SvgText>
        </Svg>
      </View>
      <View style={{ gap: space.s3 }}>
        {g.lines.map((l) => (
          <Text key={l} style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>
            {l}
          </Text>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <Btn onPress={onDone} testID="guide-done">
        {t('onboarding.guide.done')}
      </Btn>
      {onHide ? (
        <Btn kind="text" onPress={onHide} testID="guide-hide" style={{ alignSelf: 'center' }}>
          {t('onboarding.guide.hide')}
        </Btn>
      ) : null}
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

function Hanger() {
  return (
    <G>
      <Line x1={220} y1={60} x2={320} y2={60} stroke={colors.text} strokeWidth={3} opacity={0.7} />
      <G fill={colors.text} opacity={0.55}>
        <Rect x={254} y={60} width={6} height={30} rx={3} />
        <Rect x={272} y={60} width={6} height={30} rx={3} />
        <Circle cx={266} cy={100} r={9} />
        <Path d="M257 110 L275 110 L280 160 L276 214 L268 214 L268 172 L264 172 L262 214 L254 214 L252 160Z" />
      </G>
    </G>
  );
}
