import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Analysis, PhaseName } from '../../analysis/types';
import { confidenceLine, liftTitle, phaseLabel, shortPhase } from '../../analysis/format';
import { toScreen } from '../../analysis/geometry';
import {
  clampFrame,
  crossesPhase,
  keyFrameAt,
  keyFrameForPhase,
  liftPath,
  pathFrom,
  pathUpTo,
  phaseAt,
  pointAt,
  repByIndex,
} from '../../analysis/timeline';
import Btn from '../../components/Btn';
import Readout from '../../components/Readout';
import Segmented from '../../components/Segmented';
import TopBar from '../../components/TopBar';
import { impact } from '../../lib/haptics';
import { colors, opacity, radius, space } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import Stage, { type StageLayer } from './Stage';
import { CurrentDot, FlarePath, KeyDots, OverlaySvg, RefLine } from './overlays';
import Scrubber from './Scrubber';
import JogWheel from './JogWheel';
import PhaseChips from './PhaseChips';
import CueNotes, { Disclaimer } from './CueNotes';
import { useRetestable } from './RetestVerdict';

export type Speed = '0.25' | '0.5' | '1';
type Overlays = { path: boolean; strobe: boolean; lines: boolean };

const STROBE_OPACITY = [0.35, 0.45, 0.55, 0.5, 0.5, 0.6, 0.4];

export default function PlayerScreen({
  analysis,
  initialFrame,
  onBack,
  onCompare,
  onShare,
  onMore,
  retestCueId,
  onRetest,
}: {
  analysis: Analysis;
  initialFrame?: number;
  onBack: () => void;
  onCompare?: () => void;
  onShare: () => void;
  onMore?: () => void;
  retestCueId?: string;
  onRetest?: (cueId: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const rep = repByIndex(analysis, analysis.cue?.evidence.rep ?? analysis.bestRepIndex);
  const [frame, setFrameState] = useState(clampFrame(rep, initialFrame ?? analysis.cue?.evidence.frame ?? rep.startFrame));
  const [speed, setSpeed] = useState<Speed>('0.25');
  const [playing, setPlaying] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [overlays, setOverlays] = useState<Overlays>({ path: true, strobe: false, lines: true });
  const frameRef = useRef(frame);
  const retestable = useRetestable(analysis, retestCueId);

  const setFrame = (next: number, tick: 'phase' | 'frame' = 'phase') => {
    const f = clampFrame(rep, next);
    const prev = frameRef.current;
    if (f === prev) return;
    if (crossesPhase(rep, prev, f)) impact('rigid');
    else if (tick === 'frame') impact('light');
    frameRef.current = f;
    setFrameState(f);
  };

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (frameRef.current >= rep.endFrame) {
        setPlaying(false);
        return;
      }
      setFrame(frameRef.current + 1);
    }, 1000 / (analysis.video.fps * Number(speed)));
    return () => clearInterval(id);
  }, [playing, speed, rep, analysis.video.fps]);

  const phase = phaseAt(rep, frame);
  const key = keyFrameAt(rep, frame);
  // capped so the cue, its notes and the disclaimer start above the fold on a 6.1" phone
  const box = { width, height: Math.round(Math.min(width * 1.25, height * 0.45)) };
  const src = { width: analysis.video.width, height: analysis.video.height };
  const focus = { x: 0.5, y: 0.3 };

  const layers: StageLayer[] = [{ image: key.image, key: 'current' }];
  if (overlays.strobe) {
    rep.keyFrames.forEach((k, i) => {
      if (k.frame < key.frame) {
        layers.push({ image: k.image, gray: true, opacity: STROBE_OPACITY[i] ?? opacity.strobeMin, blend: true, key: `strobe-${k.frame}` });
      }
    });
  }

  const step = (n: number) => {
    setPlaying(false);
    setFrame(frameRef.current + n, 'frame');
  };

  const pickPhase = (name: PhaseName) => {
    const k = keyFrameForPhase(rep, name);
    const p = rep.phases.find((q) => q.name === name);
    setFrame(k?.frame ?? p?.startFrame ?? frame);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="player-screen">
      <TopBar title={liftTitle(analysis, rep.index)} onBack={onBack} onMore={onMore} />
      <View>
        <Pressable
          onPress={() => {
            impact('light');
            setPlaying((p) => !p);
          }}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          testID="stage-press"
        >
          <Stage src={src} box={box} focus={focus} layers={layers} testID="player-stage">
            {(fit) => {
              const s = (p: { x: number; y: number }) => toScreen(p, fit);
              const current = pointAt(rep.path, frame);
              return (
                <OverlaySvg box={box}>
                  {overlays.lines ? (
                    <RefLine x={s(rep.path[0]).x} top={box.height * 0.08} bottom={box.height * 0.94} alpha={0.4} />
                  ) : null}
                  {overlays.path ? (
                    <>
                      <FlarePath points={pathFrom(liftPath(rep), frame).map(s)} faint testID="path-future" />
                      <FlarePath points={pathUpTo(rep.path, frame).map(s)} testID="path-done" />
                      <KeyDots
                        points={rep.keyFrames
                          .filter((k) => k.frame !== frame)
                          .map((k) => pointAt(rep.path, k.frame))
                          .filter((p): p is { x: number; y: number } => p !== null)
                          .map(s)}
                      />
                      <CurrentDot point={current ? s(current) : null} />
                    </>
                  ) : null}
                </OverlaySvg>
              );
            }}
          </Stage>
        </Pressable>
        <View testID="overlay-toggles" style={{ position: 'absolute', left: space.gutter, bottom: 64, flexDirection: 'row', gap: 6 }}>
          {(['path', 'strobe', 'lines'] as const).map((k) => (
            <Pressable
              key={k}
              testID={`toggle-${k}`}
              accessibilityRole="switch"
              accessibilityState={{ checked: overlays[k] }}
              onPress={() => setOverlays((o) => ({ ...o, [k]: !o[k] }))}
              style={{
                height: 44,
                paddingHorizontal: 12,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: colors.scrim,
                borderRadius: radius.control,
              }}
            >
              <Text
                style={{
                  color: overlays[k] ? colors.text : colors.text3,
                  fontFamily: fontFamily.mono,
                  fontSize: 12,
                  lineHeight: 16,
                }}
              >
                {k}
              </Text>
            </Pressable>
          ))}
        </View>
        <View
          style={{ position: 'absolute', left: space.gutter, right: space.gutter, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <Scrubber
            rep={rep}
            frame={frame}
            label={`${phase ? phaseLabel(phase.name).toLowerCase() : 'frame'} · ${frame}`}
            onFrame={(f) => setFrame(f)}
            onScrubbing={(on) => {
              setScrubbing(on);
              if (on) setPlaying(false);
            }}
          />
          {scrubbing ? null : <Readout testID="speed-readout">{`${speed}×`}</Readout>}
        </View>
      </View>
      <PhaseChips rep={rep} fps={analysis.video.fps} active={phase?.name ?? null} onPick={pickPhase} />
      <View style={{ paddingVertical: 4, paddingHorizontal: space.gutter, flexDirection: 'row', alignItems: 'center' }}>
        <Segmented
          mono
          testID="speed"
          value={speed}
          onChange={setSpeed}
          options={[
            { value: '0.25', label: '0.25×' },
            { value: '0.5', label: '0.5×' },
            { value: '1', label: '1×' },
          ]}
        />
        <StepButton dir={-1} onPress={() => step(-1)} />
        <JogWheel onStep={step} onTap={step} />
        <StepButton dir={1} onPress={() => step(1)} />
        <View style={{ minWidth: 48, alignItems: 'flex-end' }}>
          <Text
            testID="frame-number"
            style={{ ...type.readout, color: colors.text, fontVariant: ['tabular-nums'] }}
          >
            {frame}
          </Text>
          <Text testID="frame-phase" numberOfLines={1} style={{ ...type.caption, color: colors.text2 }}>
            {phase ? shortPhase(phase.name) : '–'}
          </Text>
        </View>
      </View>
      <ScrollView
        testID="player-cue-area"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: space.s2, paddingHorizontal: space.gutter, gap: space.s2 }}
      >
        {analysis.cue ? (
          <>
            <Text style={[display(26), { color: colors.text }]} numberOfLines={2}>
              {analysis.cue.text}
            </Text>
            <Text testID="player-confidence" style={{ ...type.caption, color: colors.text2 }}>
              {confidenceLine(analysis.cue)}
            </Text>
          </>
        ) : null}
        <CueNotes notes={analysis.notes} />
        <Disclaimer />
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: space.s2, paddingTop: space.s2, paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) }}>
        {onCompare ? (
          <Btn kind="secondary" compact onPress={onCompare} style={{ flex: 1 }} testID="player-compare">
            Compare
          </Btn>
        ) : null}
        <Btn kind="secondary" compact onPress={onShare} style={{ flex: 1 }} testID="player-share">
          Share
        </Btn>
        {retestable && onRetest ? (
          <Btn compact onPress={() => onRetest(retestable.id)} style={{ flex: 2 }} testID="player-retest">
            Retest this cue
          </Btn>
        ) : null}
      </View>
    </View>
  );
}

function StepButton({ dir, onPress }: { dir: 1 | -1; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      testID={dir < 0 ? 'step-back' : 'step-forward'}
      accessibilityRole="button"
      accessibilityLabel={dir < 0 ? 'Back one frame' : 'Forward one frame'}
      hitSlop={4}
      style={{ width: 36, height: 40, marginLeft: dir < 0 ? space.s2 : 0, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ ...type.title, color: colors.text }}>{dir < 0 ? '‹' : '›'}</Text>
    </Pressable>
  );
}
