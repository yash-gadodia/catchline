import { useEffect, type ReactNode } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { Analysis } from '../../analysis/types';
import { doneTitle, formatWait, processingSteps } from '../../analysis/format';
import { polylineLength, svgPath } from '../../analysis/geometry';
import { snatchMock } from '../../analysis/fixtures';
import { keyFrameForPhase, liftPath, repByIndex } from '../../analysis/timeline';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { impact, success } from '../../lib/haptics';
import Stage from './Stage';
import DrawnPath from './DrawnPath';
import { OverlaySvg } from './overlays';

export type ProcessingState = 'progress' | 'long' | 'done' | 'too_long';

// One analysis on the single production worker takes about this long; jobs are serial.
export const EXPECTED_ANALYSIS_S = 150;

const PROCESSING_ART = require('../../../assets/art/processing-backdrop.png');

type Props = {
  analysis: Analysis | null;
  clipUri?: string | number | null;
  reduceMotion?: boolean;
  meta?: string;
  firstStep?: string;
  maxS?: number;
  state: ProcessingState;
  step: number;
  elapsed: number;
  etaSeconds?: number;
  onServer?: boolean;
  ahead?: number;
  onHide: () => void;
  onNotify: () => void;
  onKeepWaiting: () => void;
  onSee: () => void;
  onTrim?: () => void;
};

export default function ProcessingSheet({ analysis, clipUri, reduceMotion, meta, firstStep, maxS, state, step, elapsed, etaSeconds = EXPECTED_ANALYSIS_S, onServer, ahead, ...on }: Props) {
  const { width, height } = useWindowDimensions();
  const box = { width, height };
  const systemReduce = useReducedMotion();
  const reduce = reduceMotion ?? systemReduce;
  useEffect(() => {
    if (state === 'done') success();
  }, [state]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID={`processing-${state}`}>
      {state === 'progress' ? (
        <ProgressBackdrop analysis={analysis} clipUri={clipUri} step={step} reduce={reduce} box={box} />
      ) : analysis ? (
        <Backdrop analysis={analysis} state={state} box={box} />
      ) : (
        <View style={{ width, height, backgroundColor: colors.surface }} />
      )}
      {state === 'progress' ? (
        <InProgress
          analysis={analysis}
          step={step}
          firstStep={firstStep}
          meta={meta ?? formatWait(etaSeconds)}
          note={onServer ? <Queue etaSeconds={etaSeconds} ahead={ahead} /> : null}
          onHide={on.onHide}
        />
      ) : null}
      {state === 'too_long' ? (
        <Sheet testID="sheet-too-long">
          <Header title="Too long to send" meta={maxS ? `max ${maxS} s` : ''} strong />
          <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>
            Trim it to just the lift{maxS ? `, under ${maxS} s,` : ''} and send it again. The original stays on your phone.
          </Text>
          <Btn onPress={on.onTrim ?? on.onHide} testID="trim-clip">
            Trim the clip
          </Btn>
          <Btn kind="secondary" onPress={on.onHide} testID="cancel-send">
            Cancel
          </Btn>
        </Sheet>
      ) : null}
      {state === 'long' ? (
        <Sheet testID="sheet-long">
          <Header title="Taking longer than usual" meta={`${Math.round(elapsed)} s`} strong />
          <View style={{ marginTop: -8 }}>
            <Queue etaSeconds={etaSeconds} ahead={ahead} />
          </View>
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

// Behind the step list: the lifter's own clip when it is still on the phone,
// else the silhouette, with the bar path drawing itself in at every step.
function ProgressBackdrop({
  analysis,
  clipUri,
  step,
  reduce,
  box,
}: {
  analysis: Analysis | null;
  clipUri?: string | number | null;
  step: number;
  reduce: boolean;
  box: { width: number; height: number };
}) {
  const layer = { position: 'absolute', left: 0, top: 0, width: box.width, height: box.height } as const;
  return (
    <View pointerEvents="none" style={layer} testID="processing-art-layer">
      {clipUri ? (
        <>
          <ClipLayer uri={clipUri} reduce={reduce} box={box} />
          <View testID="processing-scrim" style={[layer, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
        </>
      ) : (
        <Image testID="processing-art" source={PROCESSING_ART} resizeMode="cover" style={layer} />
      )}
      {reduce ? null : <PathLayer analysis={analysis ?? snatchMock} step={step} box={box} />}
    </View>
  );
}

function ClipLayer({ uri, reduce, box }: { uri: string | number; reduce: boolean; box: { width: number; height: number } }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = !reduce;
    if (!reduce) p.play();
  });
  return (
    <View testID="processing-clip" style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height, opacity: 0.28 }}>
      <VideoView player={player} style={{ width: box.width, height: box.height }} contentFit="cover" nativeControls={false} />
    </View>
  );
}

function PathLayer({ analysis, step, box }: { analysis: Analysis; step: number; box: { width: number; height: number } }) {
  const { width, height } = analysis.video;
  const px = liftPath(repByIndex(analysis, analysis.bestRepIndex)).map((p) => ({ x: p.x * width, y: p.y * height }));
  const pts = anchoredPath(px, box);
  const draw = useSharedValue(0);
  useEffect(() => {
    draw.value = 0;
    draw.value = withTiming(1, { duration: 2400, easing: Easing.out(Easing.cubic) });
  }, [step, draw]);
  return (
    <View testID="processing-motion" style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height, opacity: 0.8 }}>
      <OverlaySvg box={box}>
        <DrawnPath d={svgPath(pts)} length={polylineLength(pts)} progress={draw} halo={false} />
      </OverlaySvg>
    </View>
  );
}

// The silhouette's near plate sits at (27%, 48%) of the screen: the path starts
// there and rises 30% of the screen, keeping its own proportions.
const PLATE = { x: 0.27, y: 0.48 };
const RISE = 0.3;

function anchoredPath(path: { x: number; y: number }[], box: { width: number; height: number }) {
  if (path.length === 0) return [];
  const ys = path.map((p) => p.y);
  const span = Math.max(...ys) - Math.min(...ys) || 1;
  const k = (box.height * RISE) / span;
  const start = path[0];
  return path.map((p) => ({ x: box.width * PLATE.x + (p.x - start.x) * k, y: box.height * PLATE.y + (p.y - start.y) * k }));
}

function Backdrop({ analysis, state, box }: { analysis: Analysis; state: ProcessingState; box: { width: number; height: number } }) {
  const rep = repByIndex(analysis, analysis.cue?.evidence.rep ?? analysis.bestRepIndex);
  const bg =
    state === 'done'
      ? keyFrameForPhase(rep, 'catch') ?? rep.keyFrames[rep.keyFrames.length - 1]
      : keyFrameForPhase(rep, 'first_pull') ?? rep.keyFrames[0];
  const src = { width: analysis.video.width, height: analysis.video.height };
  return (
    <Stage
      src={src}
      box={box}
      focus={{ x: 0.5, y: 0.45 }}
      layers={[{ image: bg.image, gray: state !== 'done', opacity: state === 'done' ? 0.6 : 0.35 }]}
    />
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

function Queue({ etaSeconds, ahead }: { etaSeconds: number; ahead?: number }) {
  const mono = { color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 } as const;
  return (
    <View style={{ gap: 2 }}>
      <Text style={mono}>{`usually ${formatWait(etaSeconds)}`}</Text>
      {ahead ? <Text style={mono}>{`${ahead} ahead of you`}</Text> : null}
    </View>
  );
}

function InProgress({
  analysis,
  step,
  firstStep,
  meta,
  note,
  onHide,
}: {
  analysis: Analysis | null;
  step: number;
  firstStep?: string;
  meta: string;
  note: ReactNode;
  onHide: () => void;
}) {
  return (
    <Sheet testID="sheet-progress">
      <Header title="Watching your reps" meta={meta} />
      {note ? <View style={{ marginTop: -8 }}>{note}</View> : null}
      <View style={{ gap: 12 }}>
        {processingSteps(analysis, step, firstStep).map((s) => (
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
