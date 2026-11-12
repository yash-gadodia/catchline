import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Path, Rect } from 'react-native-svg';
import type { Analysis, Point } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { seconds } from '../../analysis/format';
import { toScreen, type Fit } from '../../analysis/geometry';
import Btn from '../../components/Btn';
import Readout from '../../components/Readout';
import TopBar from '../../components/TopBar';
import { impact } from '../../lib/haptics';
import { colors, control, shade, shape, space, stroke } from '../../design/tokens';
import { type } from '../../design/typography';
import TrackOverlay from './TrackOverlay';
import FadeRow from './FadeRow';
import DrawLayer from './DrawLayer';
import { isComplete, type Shape } from './drawGeometry';
import { openLiftOverlays, useOverlays } from './overlayPrefs';
import { peakFrame } from './compare';
import { barSpeed } from './speed';
import type { LastLift } from './useLastLift';
import { ANGLE_MAX_OFF_SIDE_DEG, drawnSide, frameAt, jointAngles, joints, liftRange, spread, timeOf } from './tracker';
import { t } from '../../i18n';

type Speed = 0.25 | 0.5 | 1;
const SPEEDS: Speed[] = [0.25, 0.5, 1];
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
  reveal,
  lastLift,
  reduceMotion,
}: {
  analysis: Analysis;
  clipUri: string;
  body: Body | null;
  title: string;
  onBack: () => void;
  onShare?: () => void;
  onMore?: () => void;
  // The first look at a lift just tracked: it plays itself once at half speed, the path drawing and the body on,
  // and stops on the last frame with the next action. With Reduce Motion it opens on that last frame.
  reveal?: boolean;
  // The lifter's last lift before this one, to lay its bar path on this video.
  lastLift?: LastLift | null;
  reduceMotion?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Frames are spread over the clip's real length: the recorded rate is one over the shortest frame gap, which runs
  // fast on a clip with uneven frame timing and would slide the overlay off the picture.
  const [duration, setDuration] = useState(0);
  const count = Math.max(analysis.video.frameCount, body?.frames.length ?? 0, 1);
  const fps = duration > 0 ? count / duration : analysis.video.fps;
  // bar speed where the plate model measured the plate (a 4.0 lift with a bar path); none for a hip trail or an older lift
  const barSpeedOf = useMemo(() => barSpeed(analysis.reps[0]?.path ?? [], analysis.video.fps, analysis.lift), [analysis]);
  const src = { width: analysis.video.width, height: analysis.video.height };
  const maxH = Math.round(height * 0.6);
  const boxW = Math.min(width, Math.round((maxH * src.width) / src.height));
  const box = { width: boxW, height: Math.round((boxW * src.height) / src.width) };
  const fit: Fit = { x: 0, y: 0, width: box.width, height: box.height };
  const offSide = analysis.noCueReason?.offSideDeg;
  const anglesOk = body !== null && (offSide == null || offSide <= ANGLE_MAX_OFF_SIDE_DEG);

  // The player keeps to the lift itself (tracking marks it) until the lifter asks for the whole clip.
  const hasLift = liftRange(analysis.lift, count, false).cropped;
  const [whole, setWhole] = useState(false);
  const { cropped, first, last } = liftRange(analysis.lift, count, whole);
  // It opens on the lift's first frame: the readout and the overlay from the first paint, the picture as soon as
  // the clip can seek.
  const systemReduce = useReducedMotion();
  const reduce = reduceMotion ?? systemReduce;
  const [revealing, setRevealing] = useState<'playing' | 'done' | null>(reveal ? (reduce ? 'done' : 'playing') : null);
  const revealRef = useRef(revealing);
  const endReveal = () => {
    if (revealRef.current !== 'playing') return;
    revealRef.current = 'done';
    setRevealing('done');
  };
  const opensOn = reveal && reduce ? last : first;
  const [frame, setFrameState] = useState(opensOn);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(reveal ? 0.5 : 0.25);
  const [comparing, setComparing] = useState(false);
  const prefs = useOverlays();
  useEffect(openLiftOverlays, []);
  const overlays = revealing === 'playing' ? { ...prefs, path: true, body: true } : prefs;
  const [drawing, setDrawing] = useState(false);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const frameRef = useRef(opensOn);
  const path = analysis.reps[0]?.path ?? [];
  // The top of the lift, felt once as the first look passes it.
  const peak = useRef(reveal ? peakFrame(path, first, last) : null);
  // Set on playing again from the end: the times still arriving from the old position are not the end reached again.
  const restarting = useRef(false);

  const player = useVideoPlayer(clipUri, (p) => {
    p.loop = false;
    p.muted = true;
    p.timeUpdateEventInterval = 1 / 60;
    p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
    p.playbackRate = reveal ? 0.5 : 0.25;
    if (opensOn > 0) p.currentTime = timeOf(opensOn, fps);
    if (reveal && !reduce) p.play();
  });

  useEffect(() => {
    const time = player.addListener('timeUpdate', ({ currentTime }) => {
      if (player.duration > 0 && Math.abs(player.duration - duration) > 0.01) setDuration(player.duration);
      const at = frameAt(currentTime, fps, count);
      if (restarting.current) {
        if (at >= last) return;
        restarting.current = false;
      }
      if (revealRef.current === 'playing' && peak.current !== null && at >= peak.current) {
        peak.current = null;
        impact('light');
      }
      // it stops on the last frame, not one past it
      if (at >= last && player.playing) {
        player.pause();
        if (at > last) player.currentTime = timeOf(last, fps);
        endReveal();
      }
      const f = Math.min(Math.max(at, first), last);
      if (f === frameRef.current) return;
      frameRef.current = f;
      setFrameState(f);
    });
    const loaded = player.addListener('sourceLoad', (e) => {
      if (e.duration > 0) setDuration(e.duration);
      if (frameRef.current > 0 && frameRef.current === opensOn) player.currentTime = timeOf(opensOn, e.duration > 0 ? count / e.duration : fps);
    });
    const play = player.addListener('playingChange', ({ isPlaying }) => {
      setPlaying(isPlaying);
      // the clip ran out before a time on its last frame arrived
      if (!isPlaying && frameRef.current >= last - 1) endReveal();
    });
    return () => {
      time.remove();
      play.remove();
      loaded.remove();
    };
  }, [player, fps, count, duration, first, last]);

  const exitDraw = () => {
    setDrawing(false);
    setShapes((all) => (all.every(isComplete) ? all : all.filter(isComplete)));
  };

  const seek = (next: number) => {
    const f = Math.min(Math.max(first, Math.round(next)), last);
    endReveal();
    restarting.current = false;
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
    endReveal();
    if (playing) return player.pause();
    exitDraw();
    if (frameRef.current >= last || frameRef.current < first) {
      restarting.current = true;
      frameRef.current = first;
      setFrameState(first);
      player.currentTime = timeOf(first, fps);
    }
    player.play();
  };

  // Back to the lift from a frame outside it: the lift's first frame.
  const toggleWhole = () => {
    const next = liftRange(analysis.lift, count, !whole);
    setWhole(!whole);
    if (frameRef.current >= next.first && frameRef.current <= next.last) return;
    player.pause();
    frameRef.current = next.first;
    setFrameState(next.first);
    player.currentTime = timeOf(next.first, fps);
  };

  const scrub = useRef({ seek, first, last, width });
  scrub.current = { seek, first, last, width };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => scrub.current.seek(scrub.current.first + (e.nativeEvent.pageX / scrub.current.width) * (scrub.current.last - scrub.current.first)),
      onPanResponderMove: (e) => scrub.current.seek(scrub.current.first + (e.nativeEvent.pageX / scrub.current.width) * (scrub.current.last - scrub.current.first)),
    }),
  ).current;

  const s = (p: Point) => toScreen(p, fit);
  const j = overlays.angles ? joints(body, frame) : [];
  const side = drawnSide(body, offSide);

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
          <VideoView player={player} style={{ width: box.width, height: box.height }} contentFit="fill" nativeControls={false} allowsVideoFrameAnalysis={false} />
          <TrackOverlay analysis={analysis} body={body} frame={frame} box={box} show={overlays} ghost={comparing && lastLift ? lastLift.points : null} />
          {overlays.angles && anglesOk
            ? spread(jointAngles(j, src, side).map((a) => ({ ...a, x: s(a.at).x + 10, y: s(a.at).y - 12 })), 56, 28).map((a) => (
                <View key={a.name} pointerEvents="none" style={{ position: 'absolute', left: Math.min(Math.max(4, a.x), box.width - 56), top: Math.min(Math.max(4, a.y), box.height - 26) }}>
                  <Readout testID={`angle-${a.name}`}>{`${Math.round(a.deg)}°`}</Readout>
                </View>
              ))
            : null}
          <DrawLayer box={box} fit={fit} video={src} shapes={shapes} onShapes={setShapes} drawing={drawing} />
          {/* time, and under it the bar speed: stacked so they never meet on a narrow (portrait) video */}
          <View pointerEvents="none" style={{ position: 'absolute', top: space.s3, left: space.s3, alignItems: 'flex-start', gap: space.s1 }}>
            <Readout testID="tracker-readout">{cropped ? `${seconds((frame - first) / fps)} s · ${frame + 1} / ${count}` : `${frame + 1} / ${count} · ${seconds(frame / fps)} s`}</Readout>
            {barSpeedOf?.peak && overlays.path ? (
              <Readout testID="tracker-speed">
                {t('analysis.tracker.barSpeed', { now: speedAt(barSpeedOf.at, frame), peak: barSpeedOf.peak.v.toFixed(2) })}
              </Readout>
            ) : null}
          </View>
          {lastLift && revealing !== 'playing' && !drawing ? (
            <Pressable
              testID="tracker-compare"
              accessibilityRole="switch"
              accessibilityState={{ checked: comparing }}
              onPress={() => {
                impact('light');
                setComparing((c) => !c);
              }}
              hitSlop={4}
              style={{
                position: 'absolute',
                left: space.s3,
                bottom: space.s3,
                height: control.chipHeight,
                paddingHorizontal: space.s3,
                justifyContent: 'center',
                backgroundColor: shade(0.6),
                borderWidth: stroke.hairline,
                borderColor: comparing ? colors.text : colors.hairline,
                ...shape.control,
              }}
            >
              <Text style={{ ...type.caption, color: colors.text }}>{comparing ? t('analysis.tracker.comparing', { when: lastLift.title }) : t('analysis.tracker.compare')}</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </View>
      <View {...pan.panHandlers} testID="tracker-scrub" accessibilityRole="adjustable" accessibilityLabel={t('analysis.tracker.scrub')} style={{ height: SCRUB_H, justifyContent: 'center' }}>
        <View style={{ height: 3, backgroundColor: colors.hairline }}>
          <View style={{ height: 3, width: `${(Math.min(Math.max(frame - first, 0), last - first) / Math.max(last - first, 1)) * 100}%`, backgroundColor: colors.text }} />
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
              <Chip key={k} testID={`toggle-${k}`} toggle on={overlays[k]} onPress={() => useOverlays.setState({ [k]: !overlays[k] })}>
                {t(`analysis.tracker.overlay.${k}`)}
              </Chip>
            ))}
          {hasLift ? (
            <Chip testID="toggle-whole" toggle on={whole} onPress={toggleWhole}>
              {t('analysis.tracker.wholeClip')}
            </Chip>
          ) : null}
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
          {!path.length && analysis.traceKind === 'bar' ? (
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
        {onShare && revealing !== 'playing' ? (
          <Btn kind={revealing === 'done' ? 'primary' : 'secondary'} compact={revealing !== 'done'} onPress={onShare} testID="tracker-share">
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

// the bar speed at a frame, or a dash where it was not measured (the frames either side of a gap, a jump)
function speedAt(at: Map<number, number>, frame: number): string {
  const v = at.get(frame) ?? at.get(frame - 1) ?? at.get(frame + 1);
  return v === undefined ? '–' : v.toFixed(2);
}
