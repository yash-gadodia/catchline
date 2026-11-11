import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import type { Analysis, Point } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { seconds } from '../../analysis/format';
import { toScreen, type Fit } from '../../analysis/geometry';
import { pathUpTo, pointAt } from '../../analysis/timeline';
import Btn from '../../components/Btn';
import Readout from '../../components/Readout';
import TopBar from '../../components/TopBar';
import { impact } from '../../lib/haptics';
import { colors, control, opacity, shape, space, stroke } from '../../design/tokens';
import { type } from '../../design/typography';
import { CurrentDot, FlarePath, OverlaySvg, RefLine } from './overlays';
import FadeRow from './FadeRow';
import DrawLayer from './DrawLayer';
import { isComplete, type Shape } from './drawGeometry';
import { ANGLE_MAX_OFF_SIDE_DEG, bones, drawnSide, floorY, frameAt, jointAngles, joints, mostlyPlate, spread, timeOf } from './tracker';
import { t } from '../../i18n';

type Speed = 0.25 | 0.5 | 1;
const SPEEDS: Speed[] = [0.25, 0.5, 1];
type Overlays = { path: boolean; lines: boolean; body: boolean; angles: boolean };
const SCRUB_H = 44;

// The 4.0 result: the lifter's own clip, every frame, with the tracked path and body drawn on it.
export default function TrackerScreen({
  analysis,
  clipUri,
  body,
  title,
  onBack,
  onShare,
  onMore,
}: {
  analysis: Analysis;
  clipUri: string;
  body: Body | null;
  title: string;
  onBack: () => void;
  onShare?: () => void;
  onMore?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const rep = analysis.reps[0];
  const fps = analysis.video.fps;
  const count = Math.max(analysis.video.frameCount, body?.frames.length ?? 0, 1);
  const src = { width: analysis.video.width, height: analysis.video.height };
  const maxH = Math.round(height * 0.6);
  const boxW = Math.min(width, Math.round((maxH * src.width) / src.height));
  const box = { width: boxW, height: Math.round((boxW * src.height) / src.width) };
  const fit: Fit = { x: 0, y: 0, width: box.width, height: box.height };
  const offSide = analysis.noCueReason?.offSideDeg;
  const anglesOk = body !== null && (offSide == null || offSide <= ANGLE_MAX_OFF_SIDE_DEG);

  const [frame, setFrameState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(0.25);
  const [overlays, setOverlays] = useState<Overlays>({ path: true, lines: true, body: false, angles: false });
  const [drawing, setDrawing] = useState(false);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const frameRef = useRef(0);

  const player = useVideoPlayer(clipUri, (p) => {
    p.loop = false;
    p.muted = true;
    p.timeUpdateEventInterval = 1 / 60;
    p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
    p.playbackRate = 0.25;
  });

  useEffect(() => {
    const time = player.addListener('timeUpdate', ({ currentTime }) => {
      const f = frameAt(currentTime, fps, count);
      if (f === frameRef.current) return;
      frameRef.current = f;
      setFrameState(f);
    });
    const play = player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying));
    return () => {
      time.remove();
      play.remove();
    };
  }, [player, fps, count]);

  const exitDraw = () => {
    setDrawing(false);
    setShapes((all) => (all.every(isComplete) ? all : all.filter(isComplete)));
  };

  const seek = (next: number) => {
    const f = Math.min(Math.max(0, Math.round(next)), count - 1);
    player.pause();
    if (f === frameRef.current) return;
    frameRef.current = f;
    setFrameState(f);
    player.currentTime = timeOf(f, fps);
  };

  const step = (dir: 1 | -1) => {
    impact('light');
    seek(frameRef.current + dir);
  };

  const togglePlay = () => {
    impact('light');
    if (playing) return player.pause();
    exitDraw();
    if (frameRef.current >= count - 1) player.currentTime = 0;
    player.play();
  };

  const scrub = useRef({ seek, count, width });
  scrub.current = { seek, count, width };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => scrub.current.seek((e.nativeEvent.pageX / scrub.current.width) * (scrub.current.count - 1)),
      onPanResponderMove: (e) => scrub.current.seek((e.nativeEvent.pageX / scrub.current.width) * (scrub.current.count - 1)),
    }),
  ).current;

  const s = (p: Point) => toScreen(p, fit);
  const path = rep?.path ?? [];
  const current = path.length && frame >= path[0].frame && frame <= path[path.length - 1].frame ? pointAt(path, frame) : null;
  const j = overlays.body || overlays.angles ? joints(body, frame) : [];
  const floor = floorY(body);
  const side = drawnSide(body, offSide);
  const shownJoints = side === 'both' ? j : j.filter((_, i) => i % 2 === side);
  const skeleton = bones(j, side).map(([a, b]) => [s(a), s(b)] as const);
  const startX = rep?.guides && Number.isFinite(rep.guides.startX) ? rep.guides.startX : path[0]?.x;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="tracker-screen">
      <TopBar title={title} onBack={onBack} onMore={onMore} more={!!onMore} />
      <View style={{ alignItems: 'center', backgroundColor: colors.surface }}>
        <Pressable
          onPress={togglePlay}
          disabled={drawing}
          accessibilityRole="button"
          accessibilityLabel={playing ? t('analysis.player.pause') : t('analysis.player.play')}
          testID="tracker-video"
          style={{ width: box.width, height: box.height, overflow: 'hidden' }}
        >
          <VideoView player={player} style={{ width: box.width, height: box.height }} contentFit="fill" nativeControls={false} />
          <OverlaySvg box={box}>
            {overlays.lines ? (
              <G testID="tracker-lines">
                {startX != null ? <RefLine x={s({ x: startX, y: 0 }).x} top={0} bottom={box.height} /> : null}
                {floor != null ? (
                  <Line x1={0} x2={box.width} y1={s({ x: 0, y: floor }).y} y2={s({ x: 0, y: floor }).y} stroke={colors.text} strokeWidth={stroke.hairline} strokeDasharray="2 5" opacity={opacity.lines} />
                ) : null}
              </G>
            ) : null}
            {overlays.body ? (
              <G testID="tracker-body" strokeLinecap="round">
                {skeleton.map(([p, q], i) => (
                  <Line key={`h${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={colors.halo} strokeWidth={stroke.halo} />
                ))}
                {skeleton.map(([p, q], i) => (
                  <Line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={colors.text} strokeWidth={stroke.outline} />
                ))}
                {shownJoints.map((p, i) => (p ? <Circle key={`j${i}`} cx={s(p).x} cy={s(p).y} r={3} fill={colors.text} stroke={colors.halo} strokeWidth={1} /> : null))}
              </G>
            ) : null}
            {overlays.path ? (
              <>
                <FlarePath points={pathUpTo(path, frame).map(s)} testID="path-done" />
                <CurrentDot point={current ? s(current) : null} />
              </>
            ) : null}
          </OverlaySvg>
          {overlays.angles && anglesOk
            ? spread(jointAngles(j, src, side).map((a) => ({ ...a, x: s(a.at).x + 10, y: s(a.at).y - 12 })), 56, 28).map((a) => (
                <View key={a.name} pointerEvents="none" style={{ position: 'absolute', left: Math.min(Math.max(4, a.x), box.width - 56), top: Math.min(Math.max(4, a.y), box.height - 26) }}>
                  <Readout testID={`angle-${a.name}`}>{`${Math.round(a.deg)}°`}</Readout>
                </View>
              ))
            : null}
          <DrawLayer box={box} fit={fit} video={src} shapes={shapes} onShapes={setShapes} drawing={drawing} />
          <View pointerEvents="none" style={{ position: 'absolute', top: space.s3, left: space.s3 }}>
            <Readout testID="tracker-readout">{`${frame + 1} / ${count} · ${seconds(frame / fps)} s`}</Readout>
          </View>
        </Pressable>
      </View>
      <View {...pan.panHandlers} testID="tracker-scrub" accessibilityRole="adjustable" accessibilityLabel={t('analysis.tracker.scrub')} style={{ height: SCRUB_H, justifyContent: 'center' }}>
        <View style={{ height: 3, backgroundColor: colors.hairline }}>
          <View style={{ height: 3, width: `${(frame / Math.max(count - 1, 1)) * 100}%`, backgroundColor: colors.text }} />
        </View>
      </View>
      <View style={{ borderBottomWidth: stroke.hairline, borderBottomColor: colors.hairline }}>
        <FadeRow testID="tracker-controls" contentContainerStyle={{ gap: space.s2, paddingHorizontal: space.gutter, paddingBottom: space.s2, alignItems: 'center' }}>
          <Chip testID="step-back" label={t('analysis.tracker.prevFrame')} on onPress={() => step(-1)}>
            ‹
          </Chip>
          <Chip testID="tracker-play" label={playing ? t('analysis.player.pause') : t('analysis.player.play')} on onPress={togglePlay}>
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
          </Chip>
          <Chip testID="step-forward" label={t('analysis.tracker.nextFrame')} on onPress={() => step(1)}>
            ›
          </Chip>
          <Chip
            testID="speed"
            label={t('analysis.player.speed', { speed: `${speed}×` })}
            on
            onPress={() => {
              const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
              player.playbackRate = next;
              setSpeed(next);
            }}
          >
            {`${speed}×`}
          </Chip>
          <View style={{ width: stroke.hairline, height: space.s5, backgroundColor: colors.hairline }} />
          {(['path', 'lines', 'body', 'angles'] as const)
            .filter((k) => (k === 'body' ? body !== null : k === 'angles' ? anglesOk : true))
            .map((k) => (
              <Chip key={k} testID={`toggle-${k}`} toggle on={overlays[k]} onPress={() => setOverlays((o) => ({ ...o, [k]: !o[k] }))}>
                {t(`analysis.tracker.overlay.${k}`)}
              </Chip>
            ))}
          {playing ? null : (
            <Chip testID="toggle-draw" toggle on={drawing} onPress={() => (drawing ? exitDraw() : setDrawing(true))}>
              {t('analysis.player.overlay.draw')}
            </Chip>
          )}
          {shapes.length > 0 ? (
            <Chip
              testID="toggle-clear"
              label={t('analysis.player.clearDrawings')}
              on
              onPress={() => {
                setShapes([]);
                impact('light');
              }}
            >
              {t('analysis.player.overlay.clear')}
            </Chip>
          ) : null}
        </FadeRow>
      </View>
      <View style={{ flex: 1, paddingHorizontal: space.gutter, paddingTop: space.s3, paddingBottom: Math.max(insets.bottom, space.s4), gap: space.s2, justifyContent: 'space-between' }}>
        <View style={{ gap: space.s1 }}>
          {path.length && !mostlyPlate(path) && analysis.traceKind === 'bar' ? (
            <Text testID="tracker-note-hands" style={{ ...type.caption, color: colors.text2 }}>
              {t('analysis.tracker.fromHands')}
            </Text>
          ) : null}
          {body !== null && !anglesOk ? (
            <Text testID="tracker-note-angles" style={{ ...type.caption, color: colors.text2 }}>
              {t('analysis.tracker.anglesSideOn')}
            </Text>
          ) : null}
        </View>
        {onShare ? (
          <Btn kind="secondary" compact onPress={onShare} testID="tracker-share">
            {t('analysis.player.share')}
          </Btn>
        ) : null}
      </View>
    </View>
  );
}

function Chip({ testID, on, toggle, label, onPress, children }: { testID: string; on: boolean; toggle?: boolean; label?: string; onPress: () => void; children: ReactNode }) {
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
