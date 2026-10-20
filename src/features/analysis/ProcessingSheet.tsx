import { useEffect, type ReactNode } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { Analysis } from '../../analysis/types';
import { doneTitle, formatWait, processingSteps } from '../../analysis/format';
import { keyFrameForPhase, repByIndex } from '../../analysis/timeline';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, shade, space } from '../../design/tokens';
import { fontFamily, type } from '../../design/typography';
import { impact, success } from '../../lib/haptics';
import Stage from './Stage';
import ProcessingPath from './ProcessingPath';
import { t } from '../../i18n';

export type ProcessingState = 'progress' | 'long' | 'done' | 'too_long' | 'offline';

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
  // On-device analysis: the lifter can stop the run (the lift is refunded) instead of hiding it.
  onCancel?: () => void;
  onNotify: () => void;
  onKeepWaiting: () => void;
  onSee: () => void;
  onTrim?: () => void;
  // On-device analysis: the models could not be fetched; the lift was refunded, retry sends the clip again.
  onRetry?: () => void;
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
        <ProgressBackdrop clipUri={clipUri} step={step} reduce={reduce} box={box} />
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
          onCancel={on.onCancel}
        />
      ) : null}
      {state === 'offline' ? (
        <Sheet testID="sheet-offline">
          <Header title={t('analysis.processing.offlineTitle')} meta="" strong />
          <Text style={{ color: colors.text2, ...type.body }}>{t('analysis.processing.offlineBody')}</Text>
          <Btn onPress={on.onRetry ?? on.onHide} testID="retry">
            {t('analysis.processing.retry')}
          </Btn>
          <Btn kind="secondary" onPress={on.onHide} testID="cancel-offline">
            {t('analysis.processing.cancel')}
          </Btn>
        </Sheet>
      ) : null}
      {state === 'too_long' ? (
        <Sheet testID="sheet-too-long">
          <Header title={t('analysis.processing.tooLongTitle')} meta={maxS ? t('analysis.processing.maxSeconds', { max: maxS }) : ''} strong />
          <Text style={{ color: colors.text2, ...type.body }}>
            {maxS ? t('analysis.processing.tooLongBodyMax', { max: maxS }) : t('analysis.processing.tooLongBody')}
          </Text>
          <Btn onPress={on.onTrim ?? on.onHide} testID="trim-clip">
            {t('analysis.processing.trim')}
          </Btn>
          <Btn kind="secondary" onPress={on.onHide} testID="cancel-send">
            {t('analysis.processing.cancel')}
          </Btn>
        </Sheet>
      ) : null}
      {state === 'long' ? (
        <Sheet testID="sheet-long">
          <Header title={t('analysis.processing.longTitle')} meta={`${Math.round(elapsed)} s`} strong />
          <View style={{ marginTop: -space.s2 }}>
            <Queue etaSeconds={etaSeconds} ahead={ahead} />
          </View>
          <Text style={{ color: colors.text2, ...type.body }}>
            {t('analysis.processing.longBody')}
          </Text>
          <Btn onPress={on.onNotify} testID="notify-me">
            {t('analysis.processing.notifyMe')}
          </Btn>
          <TextLink onPress={on.onKeepWaiting} testID="keep-waiting">
            {t('analysis.processing.keepWaiting')}
          </TextLink>
        </Sheet>
      ) : null}
      {state === 'done' && analysis ? (
        <Sheet testID="sheet-done">
          <Text style={{ color: colors.text, ...type.title }}>
            {doneTitle(analysis)}
          </Text>
          <Btn
            onPress={() => {
              impact('heavy');
              on.onSee();
            }}
            testID="see-it"
          >
            {t('analysis.processing.seeIt')}
          </Btn>
        </Sheet>
      ) : null}
    </View>
  );
}

// Behind the step list: the lifter's own clip, dimmed, when it is still on the phone
// (no drawn path: it could not match their bar), else the silhouette with its bar
// path drawing in phase by phase.
function ProgressBackdrop({
  clipUri,
  step,
  reduce,
  box,
}: {
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
          <View testID="processing-scrim" style={[layer, { backgroundColor: shade(0.35) }]} />
        </>
      ) : (
        <>
          <Image testID="processing-art" source={PROCESSING_ART} resizeMode="cover" style={layer} />
          <ProcessingPath step={step} reduce={reduce} box={box} />
        </>
      )}
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
      <Text style={{ color: colors.text, ...type.title }}>{title}</Text>
      <Text
        style={{
          color: strong ? colors.text : colors.text2,
          ...type.readout,
          fontFamily: strong ? fontFamily.monoMedium : fontFamily.mono,
        }}
      >
        {meta}
      </Text>
    </View>
  );
}

function Queue({ etaSeconds, ahead }: { etaSeconds: number; ahead?: number }) {
  const mono = { color: colors.text2, ...type.readout } as const;
  return (
    <View style={{ gap: 2 }}>
      <Text style={mono}>{t('analysis.processing.usually', { wait: formatWait(etaSeconds) })}</Text>
      {ahead ? <Text style={mono}>{t('analysis.processing.ahead', { count: ahead })}</Text> : null}
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
  onCancel,
}: {
  analysis: Analysis | null;
  step: number;
  firstStep?: string;
  meta: string;
  note: ReactNode;
  onHide: () => void;
  onCancel?: () => void;
}) {
  return (
    <Sheet testID="sheet-progress">
      <Header title={t('analysis.processing.watching')} meta={meta} />
      {note ? <View style={{ marginTop: -space.s2 }}>{note}</View> : null}
      <View style={{ gap: space.s3 }}>
        {processingSteps(analysis, step, firstStep).map((s) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }} testID={`step-${s.state}`}>
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
            <Text style={{ color: s.state === 'todo' ? colors.text3 : colors.text, ...type.body }}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <TextLink onPress={onCancel ?? onHide} testID={onCancel ? 'cancel' : 'hide'}>
          {onCancel ? t('analysis.processing.cancel') : t('analysis.processing.hide')}
        </TextLink>
        <Text style={{ color: colors.text2, ...type.small, textAlign: 'center' }}>
          {onCancel ? t('analysis.processing.cancelNote') : t('analysis.processing.background')}
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
      <Text style={{ color: colors.text, ...type.label }}>{children}</Text>
    </Pressable>
  );
}
