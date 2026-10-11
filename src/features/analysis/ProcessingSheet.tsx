import { useEffect } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { Analysis } from '../../analysis/types';
import { doneTitle, processingSteps } from '../../analysis/format';
import { polylineLength, svgPath, toScreen } from '../../analysis/geometry';
import { keyFrameForPhase, liftPath, repByIndex } from '../../analysis/timeline';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { impact, success } from '../../lib/haptics';
import Stage from './Stage';
import DrawnPath from './DrawnPath';
import { OverlaySvg } from './overlays';

export type ProcessingState = 'progress' | 'long' | 'done';

type Props = {
  analysis: Analysis | null;
  meta?: string;
  state: ProcessingState;
  step: number;
  elapsed: number;
  etaSeconds?: number;
  onHide: () => void;
  onNotify: () => void;
  onKeepWaiting: () => void;
  onSee: () => void;
};

export default function ProcessingSheet({ analysis, meta, state, step, elapsed, etaSeconds = 20, ...on }: Props) {
  const { width, height } = useWindowDimensions();
  const box = { width, height };
  useEffect(() => {
    if (state === 'done') success();
  }, [state]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID={`processing-${state}`}>
      {analysis ? (
        <Backdrop analysis={analysis} state={state} box={box} />
      ) : (
        <View style={{ width, height, backgroundColor: colors.surface }} />
      )}
      {state === 'progress' ? <InProgress analysis={analysis} step={step} meta={meta ?? `about ${etaSeconds} s`} onHide={on.onHide} /> : null}
      {state === 'long' ? (
        <Sheet testID="sheet-long">
          <Header title="Taking longer than usual" meta={`${Math.round(elapsed)} s · usually about ${etaSeconds} s`} strong />
          <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>
            Busy right now. Your lift is in the queue and nothing is lost. We'll ping you when the cue is ready.
          </Text>
          <Btn onPress={on.onNotify} testID="notify-me">
            Notify me
          </Btn>
          <TextLink onPress={on.onKeepWaiting} testID="keep-waiting">
            Keep waiting
          </TextLink>
        </Sheet>
      ) : null}
      {state === 'done' && analysis ? (
        <Sheet testID="sheet-done">
          <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 22, lineHeight: 28 }}>
            {doneTitle(analysis)}
          </Text>
          <Btn
            onPress={() => {
              impact('heavy');
              on.onSee();
            }}
            testID="see-it"
          >
            See it
          </Btn>
        </Sheet>
      ) : null}
    </View>
  );
}

function Backdrop({ analysis, state, box }: { analysis: Analysis; state: ProcessingState; box: { width: number; height: number } }) {
  const rep = repByIndex(analysis, analysis.cue?.evidence.rep ?? analysis.bestRepIndex);
  const bg =
    state === 'done'
      ? keyFrameForPhase(rep, 'catch') ?? rep.keyFrames[rep.keyFrames.length - 1]
      : keyFrameForPhase(rep, 'first_pull') ?? rep.keyFrames[0];
  const src = { width: analysis.video.width, height: analysis.video.height };
  const draw = useSharedValue(0);
  useEffect(() => {
    if (state !== 'progress') return;
    draw.value = withRepeat(
      withSequence(withTiming(1, { duration: 2800, easing: Easing.linear }), withTiming(1, { duration: 1200 })),
      -1
    );
  }, [state, draw]);
  return (
    <Stage
      src={src}
      box={box}
      focus={{ x: 0.5, y: 0.45 }}
      layers={[{ image: bg.image, gray: state !== 'done', opacity: state === 'done' ? 0.6 : 0.35 }]}
    >
      {(fit) => {
        if (state !== 'progress') return null;
        const pts = liftPath(rep).map((p) => toScreen(p, fit));
        return (
          <OverlaySvg box={box}>
            <DrawnPath d={svgPath(pts)} length={polylineLength(pts)} progress={draw} halo={false} />
          </OverlaySvg>
        );
      }}
    </Stage>
  );
}

function Header({ title, meta, strong }: { title: string; meta: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 22, lineHeight: 28 }}>{title}</Text>
      <Text
        style={{
          color: strong ? colors.text : colors.text2,
          fontFamily: strong ? fontFamily.monoMedium : fontFamily.mono,
          fontSize: 13,
          lineHeight: 18,
        }}
      >
        {meta}
      </Text>
    </View>
  );
}

function InProgress({ analysis, step, meta, onHide }: { analysis: Analysis | null; step: number; meta: string; onHide: () => void }) {
  return (
    <Sheet testID="sheet-progress">
      <Header title="Watching your reps" meta={meta} />
      <View style={{ gap: 12 }}>
        {processingSteps(analysis, step).map((s) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }} testID={`step-${s.state}`}>
            <View style={{ width: 20 }}>
              {s.state === 'active' ? (
                <Pulse />
              ) : (
                <View
                  style={[
                    { width: 9, height: 9, borderRadius: 4.5, marginLeft: 2 },
                    s.state === 'done' ? { backgroundColor: colors.text } : { borderWidth: 1.5, borderColor: colors.text3 },
                  ]}
                />
              )}
            </View>
            <Text style={{ color: s.state === 'todo' ? colors.text3 : colors.text, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <TextLink onPress={onHide} testID="hide">
          Hide
        </TextLink>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
          Keeps working in the background.
        </Text>
      </View>
    </Sheet>
  );
}

function Pulse() {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withSequence(withTiming(0.35, { duration: 500 }), withTiming(1, { duration: 500 })), -1);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: colors.flare, marginLeft: 2 }, style]} />;
}

function TextLink({ children, onPress, testID }: { children: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" style={{ height: 44, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20 }}>{children}</Text>
    </Pressable>
  );
}
