import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { Analysis, KeyFrame } from '../../analysis/types';
import { coverFit, polylineLength, svgPath, toScreen, type Fit, type Size } from '../../analysis/geometry';
import { frameSource } from '../../analysis/frames';
import { heroValue, movementNote } from '../../analysis/format';
import { keyFrameAt, keyFrameForPhase, liftPath, repByIndex } from '../../analysis/timeline';
import SmallCaps from '../../components/SmallCaps';
import { impact } from '../../lib/haptics';
import { colors, space } from '../../design/tokens';
import { display, type } from '../../design/typography';
import DrawnPath from './DrawnPath';
import { DimensionLine, HeroNumber, OverlaySvg, RefLine } from './overlays';
import { t } from '../../i18n';
import { cueText } from '../../i18n/cues';

// Storyboard (2.3 s): setup + knee pop (0, 180 ms, Heavy each); hip pops (360,
// Soft) and the path draws floor to lockout (easeOutCubic 700 ms) until catch
// pops (Soft) and the path lands (Rigid); 1400 zoom to the fault frame,
// dimension line draws 250 ms, number cuts in; 1900 cue types at 30 ms/char,
// Rigid on the last character.
export const REVEAL = {
  pops: [0, 180, 360, 1060],
  pathStart: 360,
  pathMs: 700,
  zoomAt: 1400,
  lineMs: 250,
  numberAt: 1650,
  typeAt: 1900,
  charMs: 30,
  holdMs: 700,
};

const STROBE: { phase: string; opacity: number; gray: boolean }[] = [
  { phase: 'setup', opacity: 0.35, gray: true },
  { phase: 'first_pull', opacity: 0.45, gray: true },
  { phase: 'transition', opacity: 0.55, gray: true },
  { phase: 'catch', opacity: 1, gray: false },
];

export default function RevealScreen({
  analysis,
  onDone,
  reduceMotion,
}: {
  analysis: Analysis;
  onDone: () => void;
  reduceMotion?: boolean;
}) {
  const systemReduce = useReducedMotion();
  const reduce = reduceMotion ?? systemReduce;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // No cue (no fault fired): the same storyboard without the fault zoom, typing "Clean rep." instead.
  const cue = analysis.cue;
  // A partial (cue held back) types "No cue this time"; the result screen says why.
  const cueLine = cue ? cueText(cue.faultId, cue.text) : t(analysis.noCueReason ? 'analysis.partial.title' : 'analysis.clean.title');
  const rep = repByIndex(analysis, cue?.evidence.rep ?? analysis.bestRepIndex);
  const box: Size = { width, height: Math.round(width * 1.25) };
  const src = { width: analysis.video.width, height: analysis.video.height };
  const fit = coverFit(src, box, { x: 0.5, y: 0.3 });
  const strobe = STROBE.map((s) => ({ ...s, key: keyFrameForPhase(rep, s.phase) })).filter(
    (s): s is typeof s & { key: KeyFrame } => !!s.key
  );
  const fault = keyFrameAt(rep, cue?.evidence.frame ?? rep.startFrame);

  const pops = [useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const draw = useSharedValue(reduce ? 1 : 0);
  const zoom = useSharedValue(1);
  const faultOpacity = useSharedValue(0);
  const line = useSharedValue(0);
  const [showNumber, setShowNumber] = useState(false);
  const [typed, setTyped] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  const typerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Wrapped-style tap zones: a tap mid-typewriter finishes the cue, the next one continues.
  const onTap = () => {
    if (typed > 0 && typed < cueLine.length) {
      clearInterval(typerRef.current);
      setTyped(cueLine.length);
      impact('rigid');
      return;
    }
    onDone();
  };

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const text = cueLine;
    let typer: ReturnType<typeof setInterval> | undefined;

    if (reduce) {
      pops.forEach((p, i) => (p.value = withTiming(strobe[i]?.opacity ?? 0, { duration: 200 })));
      if (cue) {
        at(900, () => {
          faultOpacity.value = withTiming(1, { duration: 200 });
          line.value = 1;
          setShowNumber(true);
        });
      }
      at(1300, () => {
        setTyped(text.length);
        impact('rigid');
      });
      at(1300 + REVEAL.holdMs, () => done.current());
      return () => timers.forEach(clearTimeout);
    }

    REVEAL.pops.forEach((ms, i) => {
      at(ms, () => {
        const target = strobe[i]?.opacity ?? 0;
        pops[i].value = withSequence(withTiming(1, { duration: 0 }), withTiming(target, { duration: 180 }));
        impact(i < 2 ? 'heavy' : 'soft');
      });
    });
    at(REVEAL.pathStart, () => {
      draw.value = withTiming(1, { duration: REVEAL.pathMs, easing: Easing.out(Easing.cubic) });
    });
    at(REVEAL.pathStart + REVEAL.pathMs + 40, () => impact('rigid'));
    if (cue) {
      at(REVEAL.zoomAt, () => {
        faultOpacity.value = withTiming(1, { duration: 200 });
        zoom.value = withTiming(1.25, { duration: 400, easing: Easing.out(Easing.cubic) });
        line.value = withTiming(1, { duration: REVEAL.lineMs });
      });
      at(REVEAL.numberAt, () => setShowNumber(true));
    }
    at(REVEAL.typeAt, () => {
      let n = 0;
      typer = typerRef.current = setInterval(() => {
        n += 1;
        setTyped(n);
        if (n >= text.length) {
          clearInterval(typer);
          impact('rigid');
          at(REVEAL.holdMs, () => done.current());
        }
      }, REVEAL.charMs);
    });
    return () => {
      timers.forEach(clearTimeout);
      if (typer) clearInterval(typer);
    };
    // The storyboard runs once per mount.
  }, []);

  const s = (p: { x: number; y: number }) => toScreen(p, fit);
  const evidenceTo = s(cue?.evidence.to ?? { x: 0.5, y: 0.5 });
  const evidenceFrom = s(cue?.evidence.from ?? { x: 0.5, y: 0.5 });
  const centre = { x: box.width / 2, y: box.height / 2 };
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (1 - zoom.value) * (evidenceTo.x - centre.x) },
      { translateY: (1 - zoom.value) * (evidenceTo.y - centre.y) },
      { scale: zoom.value },
    ],
  }));
  const strobeStyle = useAnimatedStyle(() => ({ opacity: 1 - faultOpacity.value }));
  const faultStyle = useAnimatedStyle(() => ({ opacity: faultOpacity.value * (typed > 0 ? 0.35 : 1) }));
  const lineStyle = useAnimatedStyle(() => ({ opacity: line.value }));
  const path = liftPath(rep).map(s);
  const note = movementNote(analysis);

  return (
    <Pressable style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 56 }} onPress={onTap} testID="reveal-screen">
      <View style={{ width: box.width, height: box.height, overflow: 'hidden' }}>
        <Animated.View style={[{ width: box.width, height: box.height }, zoomStyle]}>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, strobeStyle]}>
            {strobe.map((st, i) => (
              <Layer key={st.phase} image={st.key.image} gray={st.gray} fit={fit} opacity={pops[i]} testID={`strobe-${st.phase}`} />
            ))}
            <OverlaySvg box={box}>
              <DrawnPath d={svgPath(path)} length={polylineLength(path)} progress={draw} />
            </OverlaySvg>
          </Animated.View>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, faultStyle]}>
            <StaticLayer image={fault.image} fit={fit} />
          </Animated.View>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, lineStyle]}>
            <OverlaySvg box={box}>
              <RefLine x={evidenceFrom.x} top={box.height * 0.08} bottom={box.height * 0.92} />
              <DimensionLine from={evidenceFrom} to={evidenceTo} />
            </OverlaySvg>
          </Animated.View>
          {cue && showNumber && typed === 0 ? (
            <HeroNumber text={heroValue(cue)} at={{ x: Math.min(evidenceFrom.x, evidenceTo.x) + 12, y: evidenceTo.y }} size={40} box={box} />
          ) : null}
        </Animated.View>
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s5, gap: space.s2 }}>
        {note ? (
          <Text testID="movement-note" style={{ color: colors.text2, ...type.readout }}>
            {note}
          </Text>
        ) : null}
        {typed > 0 ? (
          <>
            <SmallCaps size={13}>{cue ? t('analysis.reveal.oneThing') : t('analysis.clean.label')}</SmallCaps>
            <Text style={[display(34), { color: colors.text }]} testID="reveal-cue">
              {cueLine.slice(0, typed)}
              {typed < cueLine.length ? <Text style={{ color: colors.flare }}>|</Text> : null}
            </Text>
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

function Layer({
  image,
  gray,
  fit,
  opacity,
  testID,
}: {
  image?: string;
  gray: boolean;
  fit: Fit;
  opacity: SharedValue<number>;
  testID?: string;
}) {
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const source = frameSource(image, gray);
  if (!source) return null;
  return (
    <Animated.View
      testID={testID}
      style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, mixBlendMode: 'lighten' }, style]}
    >
      <Image source={source} style={{ position: 'absolute', left: fit.x, top: fit.y, width: fit.width, height: fit.height }} />
    </Animated.View>
  );
}

function StaticLayer({ image, fit }: { image?: string; fit: Fit }) {
  const source = frameSource(image);
  if (!source) return null;
  return <Image source={source} style={{ position: 'absolute', left: fit.x, top: fit.y, width: fit.width, height: fit.height }} />;
}
