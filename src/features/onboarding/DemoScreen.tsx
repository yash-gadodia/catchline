import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { DEMO_CLIP, demoBest } from '../../analysis/fixtures';
import { frameSource } from '../../analysis/frames';
import { keyFrameForPhase, repByIndex } from '../../analysis/timeline';
import type { Analysis } from '../../analysis/types';
import Btn from '../../components/Btn';
import { colors, shade, shape, space, stroke } from '../../design/tokens';
import { display, type } from '../../design/typography';
import CueScreen from '../analysis/CueScreen';
import PlayerScreen from '../analysis/PlayerScreen';
import ProcessingSheet from '../analysis/ProcessingSheet';
import RevealScreen from '../analysis/RevealScreen';
import { DEMO_STEPS, PROCESSING_TICK_MS, demoCaption, useDemo, type DemoStep } from './demo';

const noop = () => {};

// "See how it works": the real result screens on a bundled lift, watch-only,
// with a caption per step and Skip. Ends on "Now try yours".
export default function DemoScreen({
  analysis = demoBest,
  clip = DEMO_CLIP,
  start,
  onImport,
  onRecord,
}: {
  analysis?: Analysis;
  clip?: number | string;
  start?: DemoStep;
  onImport: () => void;
  onRecord: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { step, skip } = useDemo(start);
  if (step === 'end') return <TryYours analysis={analysis} onImport={onImport} onRecord={onRecord} />;
  const index = DEMO_STEPS.findIndex((s) => s.step === step);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID={`demo-${step}`}>
      <View style={{ flex: 1 }} pointerEvents="none">
        {step === 'processing' ? <DemoProcessing analysis={analysis} clip={clip} /> : null}
        {step === 'reveal' ? <RevealScreen analysis={analysis} onDone={noop} /> : null}
        {step === 'cue' ? <CueScreen analysis={analysis} nav={{ onTry: noop, onNotForMe: noop, onBack: noop, onFilmAgain: noop }} /> : null}
        {step === 'player' ? <DemoPlayer analysis={analysis} /> : null}
      </View>
      <Pressable
        onPress={skip}
        testID="demo-skip"
        accessibilityRole="button"
        hitSlop={8}
        style={{
          position: 'absolute',
          top: insets.top + space.s2,
          right: space.gutter,
          height: 36,
          paddingHorizontal: space.s4,
          justifyContent: 'center',
          backgroundColor: colors.bg,
          borderWidth: stroke.hairline,
          borderColor: colors.hairline,
          ...shape.control,
        }}
      >
        <Text style={[type.label, { color: colors.text }]}>Skip</Text>
      </Pressable>
      <View
        pointerEvents="none"
        testID="demo-caption"
        style={{
          position: 'absolute',
          left: space.gutter,
          right: space.gutter,
          // The processing sheet fills the bottom, so its caption sits up top.
          ...(step === 'processing' ? { top: insets.top + 64 } : { bottom: Math.max(insets.bottom, space.s4) }),
          paddingVertical: space.s3,
          paddingHorizontal: space.s4,
          backgroundColor: colors.surface,
          borderWidth: stroke.hairline,
          borderColor: colors.text,
          ...shape.control,
          gap: space.s2,
        }}
      >
        <Text style={[type.title, { color: colors.text }]}>{demoCaption(step)}</Text>
        <View style={{ flexDirection: 'row', gap: space.s1 }}>
          {DEMO_STEPS.map((s, i) => (
            <View key={s.step} style={{ flex: 1, height: 3, backgroundColor: i <= index ? colors.flare : colors.hairline }} />
          ))}
        </View>
      </View>
    </View>
  );
}

function DemoProcessing({ analysis, clip }: { analysis: Analysis; clip: number | string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => Math.min(t + 1, 5)), PROCESSING_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <ProcessingSheet
      analysis={analysis}
      clipUri={clip}
      meta={`${tick} s`}
      state={tick >= 5 ? 'done' : 'progress'}
      step={tick}
      elapsed={tick}
      onHide={noop}
      onNotify={noop}
      onKeepWaiting={noop}
      onSee={noop}
    />
  );
}

// Walks the scrubber through every phase's keyframe.
function DemoPlayer({ analysis }: { analysis: Analysis }) {
  const rep = repByIndex(analysis, analysis.cue?.evidence.rep ?? analysis.bestRepIndex);
  const frames = rep.keyFrames.map((k) => k.frame);
  const [i, setI] = useState(0);
  useEffect(() => {
    const ms = (DEMO_STEPS.find((s) => s.step === 'player')?.ms ?? 6000) / frames.length;
    const timer = setInterval(() => setI((n) => Math.min(n + 1, frames.length - 1)), ms);
    return () => clearInterval(timer);
  }, [frames.length]);
  return <PlayerScreen key={frames[i]} analysis={analysis} initialFrame={frames[i]} onBack={noop} onShare={noop} />;
}

export function TryYours({ analysis, onImport, onRecord }: { analysis: Analysis; onImport: () => void; onRecord: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const rep = repByIndex(analysis, analysis.bestRepIndex);
  const still = frameSource((keyFrameForPhase(rep, 'catch') ?? rep.keyFrames[rep.keyFrames.length - 1]).image);
  const art = { width, height: Math.max(height - 340, width) };
  return (
    <View
      testID="demo-try-yours"
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        justifyContent: 'flex-end',
        paddingHorizontal: space.gutter,
        paddingBottom: Math.max(insets.bottom, space.s4) + space.s6,
        gap: space.s5,
      }}
    >
      {still ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: art.width, height: art.height }}>
          <Image testID="demo-try-art" source={still} resizeMode="cover" style={{ width: art.width, height: art.height, opacity: 0.55 }} />
          <LinearGradient colors={[shade(0), colors.bg]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 200 }} />
        </View>
      ) : null}
      <View style={{ gap: space.s3 }}>
        <Text style={[display(44), { color: colors.text }]}>Now try yours</Text>
        <Text style={[type.body, { color: colors.text2 }]}>
          Pick one set filmed from the side, whole body and bar in frame.
        </Text>
      </View>
      <View style={{ gap: space.s3 }}>
        <Btn onPress={onImport} testID="demo-import">
          Import a video
        </Btn>
        <Btn kind="secondary" onPress={onRecord} testID="demo-record">
          Record instead
        </Btn>
      </View>
    </View>
  );
}
