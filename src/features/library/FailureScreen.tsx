import { useState, type ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import Btn from '../../components/Btn';
import Readout from '../../components/Readout';
import SmallCaps from '../../components/SmallCaps';
import { colors, shade, space } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import { FAILURE_COPY, type FailureAction, type FailureReason } from './failures';
import { Frame, Underlined } from './ui';
import { t } from '../../i18n';

// Anything outside the closed set (a raw worker string, an older build's code) shows the generic copy.
const known = (reason: string): FailureReason => (reason in FAILURE_COPY ? (reason as FailureReason) : 'unknown');

export default function FailureScreen({
  reason: rawReason,
  header,
  refCode,
  onAction,
}: {
  reason: FailureReason;
  header: string;
  refCode: string;
  onAction: (a: FailureAction) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reason = known(rawReason);
  const copy = FAILURE_COPY[reason];
  const stageH = Math.round(Math.min((width * 420) / 390, height * 0.46));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID={`failure-${reason}`}>
      <View style={{ height: 56, justifyContent: 'center', paddingHorizontal: space.gutter }}>
        <Text style={{ color: colors.text2, ...type.readout }} testID="failure-header">
          {header}
        </Text>
      </View>
      <FailureStage reason={reason} width={width} height={stageH} />
      <View style={{ flex: 1, paddingTop: space.s5, paddingHorizontal: space.gutter, gap: 10 }}>
        <SmallCaps>{copy.kicker}</SmallCaps>
        <Text style={[display(36), { color: colors.text }]}>{copy.title}</Text>
        <Text style={{ color: colors.text2, ...type.callout }}>{copy.body}</Text>
      </View>
      <View style={{ paddingTop: space.s4, paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s7), gap: space.s3 }}>
        {copy.alt ? (
          <View style={{ flexDirection: 'row', gap: space.s2 }}>
            <Btn style={{ flex: 1 }} onPress={() => onAction(copy.primary.action)} testID="failure-primary">
              {copy.primary.label}
            </Btn>
            <Btn style={{ flex: 1 }} kind="secondary" onPress={() => onAction(copy.alt!.action)} testID="failure-alt">
              {copy.alt.label}
            </Btn>
          </View>
        ) : (
          <Btn kind={copy.primary.outline ? 'secondary' : 'primary'} onPress={() => onAction(copy.primary.action)} testID="failure-primary">
            {copy.primary.label}
          </Btn>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Underlined onPress={() => onAction(copy.links[0].action)} testID="failure-link-0">
            {copy.links[0].label}
          </Underlined>
          {reason === 'unknown' ? (
            <RefCode code={refCode} />
          ) : (
            <Underlined onPress={() => onAction(copy.links[1].action)} testID="failure-link-1">
              {copy.links[1].label}
            </Underlined>
          )}
        </View>
      </View>
    </View>
  );
}

function FailureStage({ reason, width, height }: { reason: FailureReason; width: number; height: number }) {
  const copy = FAILURE_COPY[reason];
  const overlay = (children: ReactNode) => (
    <Svg width={width} height={height} viewBox="0 0 390 420" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      {children}
    </Svg>
  );
  const readout = (pos: object, color: string = colors.text) =>
    copy.readout ? (
      <Readout style={[{ position: 'absolute' }, pos]} color={color} testID="failure-readout">
        {copy.readout}
      </Readout>
    ) : null;

  if (reason === 'low_frame_rate') {
    const half = (width - 2) / 2;
    return (
      <View style={{ width, height, flexDirection: 'row', gap: 2, backgroundColor: colors.surface }}>
        <Frame image="asset:snatch/3-hip" width={half} height={height} />
        <Frame image="asset:snatch/5-turnover" width={half} height={height} />
        {readout({ left: 24, bottom: 16, right: 24 })}
      </View>
    );
  }

  return (
    <View style={{ width, height }}>
      {reason === 'too_far' ? (
        <Frame image={copy.image} width={width} height={height} zoom={0.42} focus={{ x: 0.5, y: 0.6 }} />
      ) : reason === 'too_shaky' ? (
        <>
          <Frame image={copy.image} width={width} height={height} />
          <View style={{ position: 'absolute', left: 8, top: -6 }}>
            <Frame image={copy.image} width={width} height={height} opacity={0.5} />
          </View>
        </>
      ) : (
        <Frame
          image={copy.image}
          width={width}
          height={height}
          gray={reason === 'unknown'}
          opacity={reason === 'unknown' ? 0.4 : 1}
          zoom={reason === 'bar_out_of_frame' ? 1.2 : 1}
          focus={reason === 'clip_cut_off' ? { x: 0.5, y: 0.2 } : reason === 'multiple_lifters' ? { x: 0, y: 0.45 } : { x: 0.5, y: 0.5 }}
        />
      )}
      {reason === 'too_dark' ? <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: shade(0.78) }} /> : null}
      {reason === 'clip_cut_off' ? (
        <LinearGradient
          colors={[shade(0), colors.halo]}
          locations={[0.55, 0.8]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
        />
      ) : null}

      {reason === 'bar_out_of_frame' ? (
        <>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 6, backgroundColor: colors.flare }} />
          {overlay(
            <Path d="M186 400 C188 330 194 270 214 210 C230 160 240 100 240 20" stroke={colors.flare} strokeWidth={3} strokeLinecap="round" strokeDasharray="8 6" fill="none" />
          )}
          {readout({ left: 24, top: 16 }, colors.flare)}
        </>
      ) : null}
      {reason === 'not_side_on'
        ? overlay(
            <>
              <Line x1={60} y1={300} x2={330} y2={300} stroke={colors.text} strokeDasharray="4 6" opacity={0.5} />
              <Line x1={70} y1={330} x2={300} y2={262} stroke={colors.flare} strokeWidth={2} />
              <Path d="M300 262 A 60 60 0 0 1 300 300" stroke={colors.flare} strokeWidth={1.5} strokeDasharray="3 3" fill="none" />
              <SvgText x={250} y={250} fontFamily={fontFamily.displayBlack} fontSize={36} fill={colors.flare}>
                32°
              </SvgText>
            </>
          )
        : null}
      {reason === 'not_side_on' ? readout({ left: 24, bottom: 16 }) : null}
      {reason === 'too_dark' ? (
        <>
          {overlay(<Rect x={90} y={120} width={210} height={240} stroke={colors.flare} strokeWidth={2} strokeDasharray="6 4" fill="none" />)}
          {readout({ left: 24, bottom: 16 })}
        </>
      ) : null}
      {reason === 'too_far' ? (
        <>
          {overlay(
            <>
              <Rect x={150} y={190} width={90} height={110} stroke={colors.flare} strokeWidth={2} fill="none" />
              <Line x1={150} y1={320} x2={240} y2={320} stroke={colors.flare} strokeWidth={1.5} />
              <Polyline points="156,315 150,320 156,325" stroke={colors.flare} strokeWidth={1.5} fill="none" />
              <Polyline points="234,315 240,320 234,325" stroke={colors.flare} strokeWidth={1.5} fill="none" />
            </>
          )}
          <Text
            style={{ position: 'absolute', left: (width * 120) / 390, top: (height * 328) / 420, color: colors.flare, ...type.readout }}
            testID="failure-readout"
          >
            {copy.readout}
          </Text>
        </>
      ) : null}
      {reason === 'too_shaky' ? (
        <>
          {overlay(
            <Polyline points="40,380 70,372 100,388 130,370 160,392 190,366 220,390 250,372 280,386 310,368 350,384" stroke={colors.flare} strokeWidth={2} fill="none" />
          )}
          {readout({ left: 24, top: 16 })}
        </>
      ) : null}
      {reason === 'multiple_lifters' ? (
        <>
          {overlay(
            <>
              <Rect x={150} y={60} width={200} height={330} stroke={colors.text} strokeWidth={2} fill="none" />
              <Rect x={0} y={120} width={110} height={200} stroke={colors.flare} strokeWidth={2} strokeDasharray="6 4" fill="none" />
            </>
          )}
          <Readout style={{ position: 'absolute', left: (width * 158) / 390, top: (height * 68) / 420 }}>A</Readout>
          <Readout style={{ position: 'absolute', left: 8, top: (height * 128) / 420 }} color={colors.flare}>
            B
          </Readout>
        </>
      ) : null}
      {reason === 'clip_cut_off' ? (
        <Text
          testID="failure-readout"
          style={{ position: 'absolute', right: 24, top: height / 2 - 18, textAlign: 'right', color: colors.flare, ...type.readout }}
        >
          {copy.readout}
        </Text>
      ) : null}
      {reason === 'unsupported_movement' ? readout({ left: 24, bottom: 16 }) : null}
    </View>
  );
}

// Tap to copy, so a support message carries the job reference.
function RefCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      testID="failure-ref"
      accessibilityRole="button"
      accessibilityHint={t('library.failure.copyHint')}
      hitSlop={8}
      onPress={() => {
        Clipboard.setStringAsync(code).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <Text style={{ color: colors.text2, ...type.readout }}>{copied ? t('library.failure.copied') : t('library.failure.ref', { code })}</Text>
    </Pressable>
  );
}
