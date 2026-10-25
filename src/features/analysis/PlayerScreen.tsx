import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import type { Analysis, Measurement, Phase, PhaseName } from '../../analysis/types';
import { confidenceLine, fmt, liftTitle, measurementLabel, missNote, peakSpeed, phaseLabel, seconds, speedText } from '../../analysis/format';
import { toScreen } from '../../analysis/geometry';
import {
  clampFrame,
  crossesPhase,
  keyFrameAt,
  liftPath,
  measurementsByPhase,
  pathFrom,
  pathUpTo,
  phaseFrame,
  phaseOfFrame,
  phaseSeconds,
  pointAt,
  repByIndex,
} from '../../analysis/timeline';
import Btn from '../../components/Btn';
import Readout from '../../components/Readout';
import SmallCaps from '../../components/SmallCaps';
import TopBar from '../../components/TopBar';
import { impact } from '../../lib/haptics';
import { colors, control, opacity, shape, space, stroke } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import Stage, { type StageLayer } from './Stage';
import { CurrentDot, FlarePath, KeyDots, OverlaySvg, RefLine } from './overlays';
import Filmstrip, { type PhaseMark } from './Filmstrip';
import FadeRow from './FadeRow';
import DrillCard from '../drills/DrillCard';
import DrillLine from '../drills/DrillLine';
import CueNotes, { Disclaimer } from './CueNotes';
import { useRetestable } from './RetestVerdict';
import DrawLayer from './DrawLayer';
import { isComplete, type Shape } from './drawGeometry';
import { t } from '../../i18n';
import { cueText, cueWhy } from '../../i18n/cues';
import { noCueCopy } from './partial';

export type Speed = '0.25' | '0.5' | '1';
const SPEEDS: Speed[] = ['0.25', '0.5', '1'];
type Overlays = { path: boolean; strobe: boolean; lines: boolean };

const STROBE_OPACITY = [0.35, 0.45, 0.55, 0.5, 0.5, 0.6, 0.4];
const UNTIMED: PhaseName[] = ['setup', 'recovery'];
const SWIPE = 30;

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
  const cue = analysis.cue;
  const rep = repByIndex(analysis, cue?.evidence.rep ?? analysis.bestRepIndex);
  const partial = cue ? null : noCueCopy(analysis);
  const miss = rep.made ? null : missNote(analysis);
  const cuePhase = cue ? phaseOfFrame(rep, cue.evidence.frame) : null;
  const openFrame = initialFrame ?? (rep.phases[0] ? phaseFrame(rep, rep.phases[0].name) : rep.startFrame);
  const [frame, setFrameState] = useState(clampFrame(rep, openFrame));
  const [speed, setSpeed] = useState<Speed>('0.25');
  const [playing, setPlaying] = useState(false);
  const [overlays, setOverlays] = useState<Overlays>({ path: true, strobe: false, lines: true });
  const [drawing, setDrawing] = useState(false);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const frameRef = useRef(frame);
  const retestable = useRetestable(analysis, retestCueId);
  const showSpeed = peakSpeed(analysis) !== null;
  const byPhase = measurementsByPhase(
    rep,
    analysis.measurements.filter((m) => showSpeed || m.id !== 'bar_speed'),
  );
  const marks: Partial<Record<PhaseName, PhaseMark>> = {};
  for (const p of rep.phases) {
    if (byPhase[p.name]?.some((m) => m.status === 'follows')) marks[p.name] = 'follows';
  }
  if (cuePhase) marks[cuePhase] = 'cue';

  const exitDraw = () => {
    setDrawing(false);
    setShapes((all) => (all.every(isComplete) ? all : all.filter(isComplete)));
  };

  const setFrame = (next: number) => {
    const f = clampFrame(rep, next);
    const prev = frameRef.current;
    if (f === prev) return;
    exitDraw();
    if (crossesPhase(rep, prev, f)) impact('rigid');
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

  const phaseName = phaseOfFrame(rep, frame);
  const index = rep.phases.findIndex((p) => p.name === phaseName);
  const phase = index >= 0 ? rep.phases[index] : null;
  const key = keyFrameAt(rep, frame);
  const box = { width, height: Math.round(Math.min(width * 1.25, height * 0.4)) };
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

  const pickPhase = (name: PhaseName) => {
    setPlaying(false);
    const f = clampFrame(rep, phaseFrame(rep, name));
    if (f === frameRef.current) return;
    exitDraw();
    impact('rigid');
    frameRef.current = f;
    setFrameState(f);
  };

  const stepPhase = (dir: 1 | -1) => {
    const next = rep.phases[index + dir];
    if (next) pickPhase(next.name);
  };

  const togglePlay = () => {
    impact('light');
    if (!playing && frameRef.current >= rep.endFrame) setFrame(rep.startFrame);
    if (!playing) exitDraw();
    setPlaying((p) => !p);
  };

  const swipe = useRef({ step: stepPhase, drawing });
  swipe.current = { step: stepPhase, drawing };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => !swipe.current.drawing && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > SWIPE) swipe.current.step(g.dx < 0 ? 1 : -1);
      },
    }),
  ).current;

  const atSeconds = (f: number) => seconds((f - rep.startFrame) / analysis.video.fps);
  const measured = phase ? byPhase[phase.name] ?? [] : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="player-screen">
      <TopBar title={liftTitle(analysis, rep.index)} onBack={onBack} onMore={onMore} />
      <View {...pan.panHandlers} testID="player-video">
        <Pressable
          onPress={togglePlay}
          disabled={drawing}
          accessibilityLabel={playing ? t('analysis.player.pause') : t('analysis.player.play')}
          testID="stage-press"
        >
          <Stage src={src} box={box} focus={focus} layers={layers} testID="player-stage">
            {(fit) => {
              const s = (p: { x: number; y: number }) => toScreen(p, fit);
              const current = pointAt(rep.path, frame);
              return (
                <>
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
                  <DrawLayer
                    box={box}
                    fit={fit}
                    video={src}
                    pxPerCm={analysis.pxPerCm}
                    shapes={shapes}
                    onShapes={setShapes}
                    drawing={drawing}
                  />
                </>
              );
            }}
          </Stage>
        </Pressable>
        <View pointerEvents="none" style={{ position: 'absolute', top: space.s3, left: space.s3 }}>
          <Readout testID="player-readout">{`${frame} · ${phase ? phaseLabel(phase.name).toLowerCase() : '–'} · ${atSeconds(frame)} s`}</Readout>
        </View>
        <Chevron dir={-1} disabled={index <= 0} onPress={() => stepPhase(-1)} top={box.height / 2} />
        <Chevron dir={1} disabled={index >= rep.phases.length - 1} onPress={() => stepPhase(1)} top={box.height / 2} />
        <View testID="phase-bar" pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, flexDirection: 'row', gap: 2 }}>
          {rep.phases.map((p, i) => (
            <View
              key={p.name}
              testID={`phase-bar-${p.name}`}
              style={{
                flex: p.endFrame - p.startFrame + 1,
                backgroundColor: i === index ? colors.text : i < index ? colors.text2 : colors.text,
                opacity: i > index ? 0.25 : 1,
              }}
            />
          ))}
        </View>
      </View>
      <View style={{ borderBottomWidth: stroke.hairline, borderBottomColor: colors.hairline }}>
        <FadeRow testID="player-controls" contentContainerStyle={{ gap: space.s2, paddingHorizontal: space.gutter, paddingVertical: space.s2, alignItems: 'center' }}>
          <Pill
            testID="player-play"
            label={playing ? t('analysis.player.pause') : t('analysis.player.play')}
            onPress={togglePlay}
            on
          >
            <Svg width={12} height={12} viewBox="0 0 12 12">
              {playing ? (
                <>
                  <Rect x={2} y={1} width={3} height={10} fill={colors.text} />
                  <Rect x={7} y={1} width={3} height={10} fill={colors.text} />
                </>
              ) : (
                <Path d="M2 1 L11 6 L2 11 Z" fill={colors.text} />
              )}
            </Svg>
          </Pill>
          <Pill
            testID="speed"
            label={t('analysis.player.speed', { speed: `${speed}×` })}
            onPress={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
            on
          >
            {`${speed}×`}
          </Pill>
          <View style={{ width: stroke.hairline, height: space.s5, backgroundColor: colors.hairline }} />
          {(['path', 'strobe', 'lines'] as const).map((k) => (
            <Pill key={k} testID={`toggle-${k}`} toggle on={overlays[k]} onPress={() => setOverlays((o) => ({ ...o, [k]: !o[k] }))}>
              {t(`analysis.player.overlay.${k}`)}
            </Pill>
          ))}
          {playing ? null : (
            <Pill
              testID="toggle-draw"
              toggle
              on={drawing}
              onPress={() => {
                if (drawing) exitDraw();
                else setDrawing(true);
              }}
            >
              {t('analysis.player.overlay.draw')}
            </Pill>
          )}
          {shapes.length > 0 ? (
            <Pill
              testID="toggle-clear"
              label={t('analysis.player.clearDrawings')}
              on
              onPress={() => {
                setShapes([]);
                impact('light');
              }}
            >
              {t('analysis.player.overlay.clear')}
            </Pill>
          ) : null}
        </FadeRow>
      </View>
      <Filmstrip rep={rep} fps={analysis.video.fps} active={phase?.name ?? null} marks={marks} onPick={pickPhase} />
      <ScrollView
        testID="player-cue-area"
        style={{ flex: 1, borderTopWidth: stroke.hairline, borderTopColor: colors.hairline }}
        contentContainerStyle={{ paddingTop: space.s3, paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4), gap: space.s2 }}
      >
        {miss ? (
          <Text testID="miss-note" style={{ ...type.callout, color: colors.text }}>
            {miss}
          </Text>
        ) : null}
        {phase ? <PhaseHead phase={phase} fps={analysis.video.fps} /> : null}
        {cue && phase && phase.name === cuePhase ? (
          <View testID="player-cue" style={{ borderLeftWidth: stroke.outline, borderLeftColor: colors.flare, paddingLeft: space.s3, paddingVertical: space.s2, gap: space.s1 }}>
            <SmallCaps size={11} color={colors.flare}>
              {t('analysis.player.theCue')}
            </SmallCaps>
            <Text style={[display(26), { color: colors.text }]}>{cueText(cue.faultId, cue.text)}</Text>
            <Text style={{ ...type.callout, color: colors.text }}>{cueWhy(cue.faultId, cue.why)}</Text>
            <Text testID="player-confidence" style={{ ...type.caption, color: colors.text2 }}>
              {confidenceLine(cue)}
            </Text>
          </View>
        ) : null}
        {phase ? (
          measured.length ? (
            <View>
              {measured.map((m, i) => (
                <MeasurementRow key={m.id} m={m} last={i === measured.length - 1} />
              ))}
            </View>
          ) : (
            <Text testID="phase-empty" style={{ ...type.callout, color: colors.text2 }}>
              {UNTIMED.includes(phase.name)
                ? t('analysis.player.nothingMeasured')
                : `${t('analysis.player.nothingMeasured')} ${t('analysis.player.lasted', { seconds: seconds(phaseSeconds(phase, analysis.video.fps)) })}`}
            </Text>
          )
        ) : null}
        {cue && phase && phase.name === cuePhase ? <DrillCard faultId={cue.faultId} /> : null}
        {cue && phase && phase.name === cuePhase ? <DrillLine faultId={cue.faultId} /> : null}
        {partial ? (
          <>
            <Text style={[display(26), { color: colors.text }]} numberOfLines={2}>
              {t('analysis.partial.title')}
            </Text>
            <Text testID="player-no-cue" style={{ ...type.caption, color: colors.text2 }}>
              {`${partial.reason} ${partial.tip}`}
            </Text>
          </>
        ) : null}
        <CueNotes notes={analysis.notes} />
        <View style={{ flexDirection: 'row', gap: space.s2, paddingTop: space.s2 }}>
          {onCompare ? (
            <Btn kind="secondary" compact onPress={onCompare} style={{ flex: 1 }} testID="player-compare">
              {t('analysis.player.compare')}
            </Btn>
          ) : null}
          <Btn kind="secondary" compact onPress={onShare} style={{ flex: 1 }} testID="player-share">
            {t('analysis.player.share')}
          </Btn>
          {retestable && onRetest ? (
            <Btn compact onPress={() => onRetest(retestable.id)} style={{ flex: 2 }} testID="player-retest">
              {t('analysis.cue.retest')}
            </Btn>
          ) : null}
        </View>
        <Disclaimer />
      </ScrollView>
    </View>
  );
}

function PhaseHead({ phase, fps }: { phase: Phase; fps: number }) {
  const range = t('analysis.player.frames', { start: phase.startFrame, end: phase.endFrame });
  const meta = UNTIMED.includes(phase.name) ? range : `${range} · ${seconds(phaseSeconds(phase, fps))} s`;
  return (
    <View testID="phase-head" style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.s3 }}>
      <Text testID="phase-name" style={[display(30), { color: colors.text, textTransform: 'uppercase', flexShrink: 1 }]}>
        {phaseLabel(phase.name)}
      </Text>
      <Text style={{ ...type.caption, color: colors.text2 }}>{meta}</Text>
    </View>
  );
}

function valueText(m: Measurement): string {
  if (m.status === 'not_seen') return t('format.status.notSeen');
  return m.unit === 'm/s' ? speedText(m.value) : `${fmt(m.value)} ${m.unit}`;
}

function MeasurementRow({ m, last }: { m: Measurement; last: boolean }) {
  const tag = m.status === 'cue' ? t('analysis.player.tag.cue') : m.status === 'follows' ? t('analysis.player.tag.follows') : null;
  return (
    <View
      testID={`measure-${m.id}`}
      style={{ paddingVertical: space.s3, gap: space.s1, borderBottomWidth: last ? 0 : stroke.hairline, borderBottomColor: colors.hairline }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.s2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2, flexShrink: 1, flexWrap: 'wrap' }}>
          <Text style={{ ...type.label, color: colors.text }}>{measurementLabel(m)}</Text>
          {tag ? (
            <SmallCaps size={10} color={colors.flare}>
              {tag}
            </SmallCaps>
          ) : null}
        </View>
        <Text style={{ ...type.title, fontFamily: fontFamily.mono, color: m.status === 'cue' ? colors.flare : colors.text, fontVariant: ['tabular-nums'] }}>
          {valueText(m)}
        </Text>
      </View>
      {m.note || m.best != null ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s3 }}>
          <Text style={{ ...type.small, color: colors.text2, flexShrink: 1 }}>{m.note}</Text>
          {m.best != null ? (
            <Text style={{ ...type.caption, color: colors.text3 }}>{t('analysis.player.bestRep', { value: `${fmt(m.best)} ${m.unit}` })}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Chevron({ dir, disabled, onPress, top }: { dir: 1 | -1; disabled: boolean; onPress: () => void; top: number }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={dir < 0 ? 'phase-prev' : 'phase-next'}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={dir < 0 ? t('analysis.player.prevPhase') : t('analysis.player.nextPhase')}
      style={{
        position: 'absolute',
        top: top - 32,
        [dir < 0 ? 'left' : 'right']: 0,
        width: 44,
        height: 64,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.2 : 0.85,
      }}
    >
      <Text style={{ ...display(36), color: colors.text, textShadowColor: colors.halo, textShadowRadius: 6 }}>{dir < 0 ? '‹' : '›'}</Text>
    </Pressable>
  );
}

function Pill({
  testID,
  on,
  toggle,
  label,
  onPress,
  children,
}: {
  testID: string;
  on: boolean;
  toggle?: boolean;
  label?: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={toggle ? 'switch' : 'button'}
      accessibilityState={toggle ? { checked: on } : undefined}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={2}
      style={{
        height: control.chipHeight,
        minWidth: control.chipHeight,
        paddingHorizontal: space.s3,
        borderWidth: stroke.hairline,
        borderColor: toggle && on ? colors.text : colors.hairline,
        ...shape.control,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {typeof children === 'string' ? <Text style={{ ...type.caption, color: on ? colors.text : colors.text3 }}>{children}</Text> : children}
    </Pressable>
  );
}
