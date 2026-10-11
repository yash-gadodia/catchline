import { useEffect } from 'react';
import { Image, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Easing,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { Analysis } from '../../analysis/types';
import { coverFit, polylineLength, svgPath, toScreen } from '../../analysis/geometry';
import { frameSource } from '../../analysis/frames';
import { keyFrameForPhase, liftPath, pointAt, repByIndex } from '../../analysis/timeline';
import Btn from '../../components/Btn';
import { colors, space } from '../../design/tokens';
import { display } from '../../design/typography';
import DrawnPath from '../analysis/DrawnPath';
import { KeyDots, OverlaySvg } from '../analysis/overlays';

const STROBE: { phase: string; opacity: number; gray: boolean }[] = [
  { phase: 'setup', opacity: 1, gray: true },
  { phase: 'first_pull', opacity: 0.5, gray: true },
  { phase: 'transition', opacity: 0.55, gray: true },
  { phase: 'second_pull', opacity: 0.5, gray: true },
  { phase: 'catch', opacity: 0.85, gray: false },
];

export const LOOP = { drawMs: 1900, holdMs: 1300 };

export default function WelcomeScreen({
  sample,
  onStart,
  onImport,
  onSample,
  reduceMotion,
}: {
  sample: Analysis;
  onStart: () => void;
  onImport: () => void;
  onSample?: () => void;
  reduceMotion?: boolean;
}) {
  const systemReduce = useReducedMotion();
  const reduce = reduceMotion ?? systemReduce;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const box = { width, height: Math.max(height - 260, width) };
  const fit = coverFit({ width: sample.video.width, height: sample.video.height }, box, { x: 0.5, y: 0.45 });
  const rep = repByIndex(sample, sample.bestRepIndex);
  const s = (p: { x: number; y: number }) => toScreen(p, fit);
  const path = liftPath(rep).map(s);
  const dots = rep.keyFrames
    .filter((k) => ['setup', 'transition', 'second_pull', 'catch'].includes(k.phase))
    .map((k) => pointAt(rep.path, k.frame))
    .filter((p): p is { x: number; y: number } => p !== null)
    .map(s);
  const draw = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) return;
    draw.value = withRepeat(
      withSequence(
        withTiming(1, { duration: LOOP.drawMs, easing: Easing.out(Easing.cubic) }),
        withDelay(LOOP.holdMs, withTiming(0, { duration: 0 }))
      ),
      -1
    );
  }, [reduce]);

  return (
    <View testID="welcome-screen" style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'flex-end' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height, overflow: 'hidden' }}>
        {STROBE.map((st, i) => {
          const source = frameSource(keyFrameForPhase(rep, st.phase)?.image, st.gray);
          if (!source) return null;
          return (
            <View
              key={st.phase}
              testID={`welcome-strobe-${st.phase}`}
              style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: st.opacity, mixBlendMode: i === 0 ? 'normal' : 'lighten' }}
            >
              <Image source={source} style={{ position: 'absolute', left: fit.x, top: fit.y, width: fit.width, height: fit.height }} />
            </View>
          );
        })}
        <OverlaySvg box={box}>
          <DrawnPath d={svgPath(path)} length={polylineLength(path)} progress={draw} />
          <KeyDots points={dots} />
        </OverlaySvg>
        <LinearGradient
          colors={['rgba(0,0,0,0)', colors.bg]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 160 }}
          pointerEvents="none"
        />
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) + space.s6, gap: space.s5 }}>
        <Text style={[display(44), { color: colors.text }]}>{'Film a lift.\nGet the one thing to fix.'}</Text>
        <Btn onPress={onStart} testID="welcome-start">
          Start
        </Btn>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.s6 }}>
          <Btn kind="text" onPress={onImport} testID="welcome-import">
            Import a clip
          </Btn>
          {onSample ? (
            <Btn kind="text" onPress={onSample} testID="welcome-sample">
              Try a sample lift
            </Btn>
          ) : null}
        </View>
      </View>
    </View>
  );
}
