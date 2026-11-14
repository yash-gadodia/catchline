import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Pressable, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
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
import { barSpeed, peakIn } from './speed';
import SpeedChart, { SPEED_CHART_MIN_H } from './SpeedChart';
import type { FrameWindow } from './chart';
import { Freehand, Grid, PlumbLine } from './ReferenceTools';
import type { LastLift } from './useLastLift';
import { ANGLE_MAX_OFF_SIDE_DEG, drawnSide, frameAt, jointAngles, joints, liftRange, repAt, repStarts, spread, startLineX, timeOf } from './tracker';
import { dragged, NO_ZOOM, pinched, type PictureZoom } from './videoZoom';
import { t } from '../../i18n';

type Speed = 0.25 | 0.5 | 1 | 2 | 4;
const SPEEDS: Speed[] = [0.25, 0.5, 1, 2, 4];
const SCRUB_H = 44;
// the divider between the video and the chart: how small the video can go, how big when the space under it has not
// been measured, and how far one VoiceOver step moves it
const VIDEO_MIN = 0.25;
const VIDEO_MAX = 0.6;
const DIVIDER_STEP = 40;

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
  onSideBySide,
  onAdjustPlate,
  onDetails,
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
  // Opens this lift next to the last lift of the same kind (two videos in step).
  onSideBySide?: () => void;
  // Opens the plate the tracker found, to move or resize it and track again (bar paths only).
  onAdjustPlate?: () => void;
  // Opens the lift's name, tags and note.
  onDetails?: () => void;
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
  // (at the clip's real rate, as the overlay is: the recorded rate reads fast on a clip with uneven frame timing)
  const barSpeedOf = useMemo(() => barSpeed(analysis.reps[0]?.path ?? [], fps, analysis.lift), [analysis, fps]);
  // the peak shown is the rep on screen's (a set of several reps peaks once per rep)
  const starts = useMemo(() => repStarts(analysis.reps[0]?.path ?? [], analysis.video.fps || 30), [analysis]);
  const src = { width: analysis.video.width, height: analysis.video.height };
  // a lift with bar speed gives the picture a little less height, for the speed chart under the controls; the lifter
  // drags the divider between them to give either one more
  const [videoH, setVideoH] = useState<number | null>(null);
  const maxH = videoH ?? Math.round(height * (barSpeedOf ? 0.5 : 0.6));
  const boxW = Math.min(width, Math.round((maxH * src.width) / src.height));
  const box = { width: boxW, height: Math.round((boxW * src.height) / src.width) };
  const fit: Fit = { x: 0, y: 0, width: box.width, height: box.height };
  const offSide = analysis.noCueReason?.offSideDeg;
  const anglesOk = body !== null && (offSide == null || offSide <= ANGLE_MAX_OFF_SIDE_DEG);

  // The player keeps to the lift itself (tracking marks it) until the lifter asks for the whole clip.
  const hasLift = liftRange(analysis.lift, count, false).cropped;
  const adjustable = !!onAdjustPlate && analysis.traceKind !== 'hip';
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
  // the reference tools last for this look at the lift only
  const [tools, setTools] = useState({ grid: false, plumb: false });
  const [plumbX, setPlumbX] = useState<number | null>(null);
  const [freehand, setFreehand] = useState(false);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  // the part of the lift the speed chart is zoomed in on: playback loops inside it
  const [zoom, setZoom] = useState<FrameWindow | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const frameRef = useRef(opensOn);
  const path = analysis.reps[0]?.path ?? [];
  // The top of the lift, felt once as the first look passes it.
  const peak = useRef(reveal ? peakFrame(path, first, last) : null);
  // Set on playing again from the end, or from the start of the zoomed window: the times still arriving from the old
  // position are skipped until one inside these frames arrives.
  const restarting = useRef<FrameWindow | null>(null);

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
        if (at < restarting.current.first || at >= restarting.current.last) return;
        restarting.current = null;
      }
      if (revealRef.current === 'playing' && peak.current !== null && at >= peak.current) {
        peak.current = null;
        impact('light');
      }
      // zoomed in on the chart, it loops inside the frames the chart shows
      const loop = zoomRef.current;
      if (loop && player.playing && (at >= loop.last || at < loop.first)) {
        restarting.current = loop;
        frameRef.current = loop.first;
        setFrameState(loop.first);
        player.currentTime = timeOf(loop.first, fps);
        return;
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
    restarting.current = null;
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
    const from = zoom ?? { first, last };
    if (frameRef.current >= from.last || frameRef.current < from.first) {
      restarting.current = from;
      frameRef.current = from.first;
      setFrameState(from.first);
      player.currentTime = timeOf(from.first, fps);
    }
    player.play();
  };

  // Back to the lift from a frame outside it: the lift's first frame.
  const toggleWhole = () => {
    const next = liftRange(analysis.lift, count, !whole);
    setWhole(!whole);
    setZoom(null);
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

  // The divider: the video takes what the lifter gives it, down to a quarter of the screen and up to where the chart
  // under it would no longer fit (or the picture is as wide as the screen).
  const charted = barSpeedOf !== null && revealing !== 'playing';
  const bottomH = useRef(0);
  const minBottom = space.s3 + SPEED_CHART_MIN_H + (onShare ? space.s2 + control.compactHeight : 0) + Math.max(insets.bottom, space.s4);
  const videoLimits = () => {
    const min = Math.round(height * VIDEO_MIN);
    const room = bottomH.current > 0 ? box.height + bottomH.current - minBottom : Math.round(height * VIDEO_MAX);
    return { min, max: Math.max(min, Math.min(room, Math.round((width * src.height) / src.width))) };
  };
  const resizing = useRef<{ y: number; h: number; min: number; max: number } | null>(null);
  const resizeTo = (h: number, { min, max }: { min: number; max: number }) => setVideoH(Math.round(Math.min(Math.max(h, min), max)));

  // Pinch the picture to enlarge it, drag it once enlarged (owner, 14-11: parity with WL Analysis). A tap still plays
  // and pauses; the drawing tools keep their own touches.
  const [picture, setPicture] = useState<PictureZoom>(NO_ZOOM);
  const pictureRef = useRef(picture);
  pictureRef.current = picture;
  const boxRef = useRef(box);
  boxRef.current = box;
  const pinch = useRef<{ from: PictureZoom; a: { x: number; y: number }; b: { x: number; y: number } | null } | null>(null);
  const fingers = (e: GestureResponderEvent) => e.nativeEvent.touches.map((f) => ({ x: f.pageX, y: f.pageY }));
  const startPinch = (e: GestureResponderEvent) => {
    const f = fingers(e);
    pinch.current = f.length ? { from: pictureRef.current, a: f[0], b: f[1] ?? null } : null;
  };
  const zoomHandlers = {
    onMoveShouldSetResponder: (e: GestureResponderEvent) => !drawing && !freehand && (e.nativeEvent.touches.length === 2 || (pictureRef.current.scale > 1 && e.nativeEvent.touches.length === 1)),
    onResponderGrant: startPinch,
    onResponderMove: (e: GestureResponderEvent) => {
      const f = fingers(e);
      const p = pinch.current;
      // a finger added or lifted starts the gesture again from where the picture is
      if (!p || (f.length >= 2) !== (p.b !== null)) return startPinch(e);
      if (p.b && f.length >= 2) setPicture(pinched(p.from, p.a, p.b, f[0], f[1], boxRef.current));
      else if (f.length === 1) setPicture(dragged(p.from, f[0].x - p.a.x, f[0].y - p.a.y, boxRef.current));
    },
    onResponderRelease: () => (pinch.current = null),
    onResponderTerminate: () => (pinch.current = null),
  };

  const s = (p: Point) => toScreen(p, fit);
  const plumb = Math.min(Math.max(plumbX ?? startLineX(analysis.reps[0]) ?? 0.5, 0), 1);
  const j = overlays.angles ? joints(body, frame) : [];
  const side = drawnSide(body, offSide);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="tracker-screen">
      <TopBar title={title} onBack={onBack} onMore={onMore} more={!!onMore} />
      <View {...zoomHandlers} testID="tracker-stage" style={{ alignItems: 'center', backgroundColor: colors.surface }}>
        <Pressable
          onPress={togglePlay}
          disabled={drawing || freehand}
          accessibilityRole="button"
          accessibilityLabel={playing ? t('analysis.player.pause') : t('analysis.player.play')}
          testID="tracker-video"
          style={{ width: box.width, height: box.height, overflow: 'hidden' }}
        >
          <View testID="tracker-picture" style={{ width: box.width, height: box.height, transform: [{ translateX: picture.x }, { translateY: picture.y }, { scale: picture.scale }] }}>
          <VideoView player={player} style={{ width: box.width, height: box.height }} contentFit="fill" nativeControls={false} allowsVideoFrameAnalysis={false} />
          {tools.grid ? <Grid box={box} /> : null}
          <TrackOverlay analysis={analysis} body={body} frame={frame} box={box} show={overlays} ghost={comparing && lastLift ? lastLift.points : null} speed={barSpeedOf?.at} whole />
          {overlays.angles && anglesOk
            ? spread(jointAngles(j, src, side).map((a) => ({ ...a, x: s(a.at).x + 10, y: s(a.at).y - 12 })), 56, 28).map((a) => (
                <View key={a.name} pointerEvents="none" style={{ position: 'absolute', left: Math.min(Math.max(4, a.x), box.width - 56), top: Math.min(Math.max(4, a.y), box.height - 26) }}>
                  <Readout testID={`angle-${a.name}`}>{`${Math.round(a.deg)}°`}</Readout>
                </View>
              ))
            : null}
          <DrawLayer box={box} fit={fit} video={src} shapes={shapes} onShapes={setShapes} drawing={drawing} />
          {tools.plumb ? <PlumbLine box={box} x={plumb} onMove={setPlumbX} /> : null}
          <Freehand box={box} strokes={strokes} onStrokes={setStrokes} drawing={freehand} />
          </View>
          {/* time, and under it the bar speed: stacked so they never meet on a narrow (portrait) video */}
          <View pointerEvents="none" style={{ position: 'absolute', top: space.s3, left: space.s3, alignItems: 'flex-start', gap: space.s1 }}>
            <Readout testID="tracker-readout">{cropped ? `${seconds((frame - first) / fps)} s · ${frame + 1} / ${count}` : `${frame + 1} / ${count} · ${seconds(frame / fps)} s`}</Readout>
            {barSpeedOf?.peak && overlays.path ? (
              <Readout testID="tracker-speed">
                {t('analysis.tracker.barSpeed', { now: speedAt(barSpeedOf.at, frame), peak: (peakIn(barSpeedOf.at, repAt(starts, frame).start, repAt(starts, frame).end) ?? barSpeedOf.peak.v).toFixed(2) })}
              </Readout>
            ) : null}
          </View>
          {picture.scale > 1 ? (
            <Pressable
              testID="picture-reset"
              accessibilityRole="button"
              accessibilityLabel={t('analysis.tracker.zoomReset')}
              onPress={() => setPicture(NO_ZOOM)}
              hitSlop={6}
              style={{ position: 'absolute', right: space.s3, top: space.s3, height: control.chipHeight, paddingHorizontal: space.s3, justifyContent: 'center', backgroundColor: shade(0.6), borderWidth: stroke.hairline, borderColor: colors.hairline, ...shape.control }}
            >
              <Text style={{ ...type.caption, color: colors.text }}>{`${picture.scale.toFixed(1)}× · ${t('analysis.tracker.zoomReset')}`}</Text>
            </Pressable>
          ) : null}
          {lastLift && revealing !== 'playing' && !drawing && !freehand ? (
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
                maxWidth: box.width - 2 * space.s3,
                height: control.chipHeight,
                paddingHorizontal: space.s3,
                justifyContent: 'center',
                backgroundColor: shade(0.6),
                borderWidth: stroke.hairline,
                borderColor: comparing ? colors.text : colors.hairline,
                ...shape.control,
              }}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...type.caption, color: colors.text }}>
                {comparing ? t('analysis.tracker.comparing', { when: lastLift.title }) : t('analysis.tracker.compare')}
              </Text>
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
          {(['grid', 'plumb'] as const).map((k) => (
            <Chip key={k} testID={`toggle-${k}`} toggle on={tools[k]} onPress={() => setTools((all) => ({ ...all, [k]: !all[k] }))}>
              {t(`analysis.tracker.tool.${k}`)}
            </Chip>
          ))}
          <Chip
            testID="toggle-freehand"
            toggle
            on={freehand}
            onPress={() => {
              if (!freehand) exitDraw();
              setFreehand(!freehand);
            }}
          >
            {t('analysis.tracker.tool.draw')}
          </Chip>
          {hasLift ? (
            <Chip testID="toggle-whole" toggle on={whole} onPress={toggleWhole}>
              {t('analysis.tracker.wholeClip')}
            </Chip>
          ) : null}
          {playing ? null : (
            <Chip
              testID="toggle-draw"
              toggle
              on={drawing}
              onPress={() => {
                if (drawing) return exitDraw();
                setFreehand(false);
                setDrawing(true);
              }}
            >
              {t('analysis.tracker.tool.measure')}
            </Chip>
          )}
          {shapes.length > 0 || strokes.length > 0 ? (
            <Chip
              testID="toggle-clear"
              label={t('analysis.player.clearDrawings')}
              on
              onPress={() => {
                setShapes([]);
                setStrokes([]);
                impact('light');
              }}
            >
              {t('analysis.player.overlay.clear')}
            </Chip>
          ) : null}
        </FadeRow>
        {(lastLift && onSideBySide) || adjustable || onDetails ? (
          <FadeRow testID="tracker-actions" contentContainerStyle={{ gap: space.s2, paddingHorizontal: space.gutter, paddingBottom: space.s2, alignItems: 'center' }}>
            {lastLift && onSideBySide ? (
              <Chip testID="side-by-side" on onPress={onSideBySide}>
                {t('analysis.tracker.sideBySide')}
              </Chip>
            ) : null}
            {adjustable ? (
              <Chip testID="adjust-plate" on onPress={onAdjustPlate}>
                {t('analysis.tracker.adjustPlate')}
              </Chip>
            ) : null}
            {onDetails ? (
              <Chip testID="lift-details" on onPress={onDetails}>
                {t('analysis.tracker.details')}
              </Chip>
            ) : null}
          </FadeRow>
        ) : null}
      </View>
      {charted ? (
        <View
          testID="tracker-divider"
          accessibilityRole="adjustable"
          accessibilityLabel={t('analysis.tracker.divider')}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => resizeTo(box.height + (e.nativeEvent.actionName === 'increment' ? DIVIDER_STEP : -DIVIDER_STEP), videoLimits())}
          hitSlop={{ top: 10, bottom: 10 }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => (resizing.current = { y: e.nativeEvent.pageY, h: box.height, ...videoLimits() })}
          onResponderMove={(e) => {
            if (resizing.current) resizeTo(resizing.current.h + e.nativeEvent.pageY - resizing.current.y, resizing.current);
          }}
          onResponderRelease={() => (resizing.current = null)}
          onResponderTerminate={() => (resizing.current = null)}
          style={{ height: space.s5, alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={{ width: space.s7, height: space.s1, backgroundColor: colors.text3 }} />
        </View>
      ) : null}
      <View
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          bottomH.current = h;
          // a small phone: the video gives up what the chart is short of, down to its smallest size
          if (charted && h < minBottom) resizeTo(box.height - (minBottom - h), { min: Math.round(height * VIDEO_MIN), max: box.height });
        }}
        testID="tracker-bottom"
        style={{ flex: 1, paddingHorizontal: space.gutter, paddingTop: charted ? 0 : space.s3, paddingBottom: Math.max(insets.bottom, space.s4), gap: space.s2, justifyContent: 'space-between' }}
      >
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
        {barSpeedOf && charted ? <SpeedChart at={barSpeedOf.at} frame={frame} first={first} last={last} rep={repAt(starts, frame)} onSeek={seek} fps={fps} zoom={zoom} onZoom={setZoom} /> : null}
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
