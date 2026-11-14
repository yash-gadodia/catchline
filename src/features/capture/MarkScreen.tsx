import { useEffect, useRef, useState } from 'react';
import { PanResponder, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Circle } from 'react-native-svg';
import Btn from '../../components/Btn';
import { colors, shape, shade, space, stroke } from '../../design/tokens';
import { type } from '../../design/typography';
import { selection } from '../../lib/haptics';
import { Header, Underlined } from './hud';
import MarkExample from './MarkExample';
import { containRect, grab, markFrom, type PlateMark } from './plateMark';
import { t } from '../../i18n';

// The plate, on one frame of the clip (`at` seconds), for the lifter to check (owner, 14-11: find the plate first,
// then let me adjust). `initial` is the plate that was found, null when none was. The lifter moves or resizes the
// circle, or draws a new one. Before tracking (`onSkip` given, 4.0.3 on) the plate found can be taken as it is and a
// lift with no plate skips the step; after it, the clip is tracked again only once the circle has been changed.
export default function MarkScreen({
  uri,
  at,
  initial,
  onBack,
  onTrack,
  onSkip,
}: {
  uri: string;
  at: number;
  initial: PlateMark | null;
  onBack: () => void;
  onTrack: (mark: PlateMark) => void;
  onSkip?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The picture takes what the instruction and buttons leave, so a long line (German) never pushes Track off screen.
  const [stageH, setStageH] = useState(Math.round(height * 0.58));
  const box = { width, height: stageH };
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const [mark, setMark] = useState<PlateMark | null>(initial);
  const [drag, setDrag] = useState<{ cx: number; cy: number; r: number } | null>(null);
  const [moved, setMoved] = useState(false);
  // the hint sits on the picture until the first press (owner, 13-11: the instruction under the picture was unclear)
  const [touched, setTouched] = useState(false);
  // What the finger is doing now, so the instruction follows it (owner, 13-11: a plain tap did nothing and hid the hint):
  // 'drag' while the finger is down (the app cannot tell when it reaches the rim, so it never says "let go"),
  // 'tap' after letting go too early to be a circle.
  const [coach, setCoach] = useState<'drag' | 'tap' | null>(null);
  const rect = frame ? containRect(frame, box) : null;

  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
    p.currentTime = at;
    p.pause();
  });
  // The frame's real shape (upright, as shown) comes from a thumbnail; the player answers with none until its item
  // has loaded, so it is asked again until it does, with the video track's own size as a stand-in meanwhile.
  useEffect(() => {
    let live = true;
    let tries = 0;
    const ask = () => {
      tries += 1;
      const track = player.videoTrack?.size ?? player.availableVideoTracks[0]?.size;
      if (track && track.width > 0 && track.height > 0) setFrame((f) => f ?? { width: track.width, height: track.height });
      player.generateThumbnailsAsync([at], { maxWidth: 64 }).then(
        (thumbs) => {
          if (!live) return;
          if (thumbs[0] && thumbs[0].width > 0) {
            setFrame({ width: thumbs[0].width, height: thumbs[0].height });
            clearInterval(timer);
          }
        },
        () => undefined,
      );
      if (tries >= 12) clearInterval(timer);
    };
    const timer = setInterval(ask, 500);
    ask();
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [player, at]);

  // What a press does depends on where it lands on the circle already there: inside moves it, on the rim resizes it,
  // anywhere else starts a new one from that point.
  type Hold = { mode: 'new' | 'move' | 'resize'; x: number; y: number; cx: number; cy: number; r: number };
  const live = useRef({ rect, mark, hold: null as Hold | null });
  live.current.rect = rect;
  live.current.mark = mark;
  const circleAt = (h: Hold, dx: number, dy: number) =>
    h.mode === 'move' ? { cx: h.cx + dx, cy: h.cy + dy, r: h.r } : { cx: h.cx, cy: h.cy, r: Math.hypot(h.x + dx - h.cx, h.y + dy - h.cy) };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        const { rect: r, mark: m } = live.current;
        const c = m && r ? { cx: r.x + m.x * r.width, cy: r.y + m.y * r.height, r: m.r * r.height } : null;
        const mode = c ? grab(Math.hypot(p.x - c.cx, p.y - c.cy), c.r) : 'new';
        const hold: Hold = mode === 'new' || !c ? { mode: 'new', x: p.x, y: p.y, cx: p.x, cy: p.y, r: 0 } : { mode, x: p.x, y: p.y, ...c };
        live.current.hold = hold;
        setTouched(true);
        setCoach(hold.mode === 'new' ? 'drag' : null);
        setDrag(circleAt(hold, 0, 0));
      },
      onPanResponderMove: (_, g) => {
        const h = live.current.hold;
        if (h) setDrag(circleAt(h, g.dx, g.dy));
      },
      onPanResponderRelease: (_, g) => {
        const h = live.current.hold;
        const r = live.current.rect;
        live.current.hold = null;
        setDrag(null);
        if (!h || !r) return;
        const c = circleAt(h, g.dx, g.dy);
        const next = markFrom({ x: c.cx, y: c.cy }, { x: c.cx + c.r, y: c.cy }, r);
        if (next) {
          selection();
          setMark(next);
          setMoved(true);
          setCoach(null);
        } else if (h.mode === 'new') {
          // a tap, or a circle too small to be a plate: say what was missing (the example comes back when nothing is marked)
          setCoach('tap');
          setTouched(false);
        }
      },
      onPanResponderTerminate: () => {
        live.current.hold = null;
        setCoach(null);
        setDrag(null);
      },
    }),
  ).current;

  const shown = drag ?? (mark && rect ? { cx: rect.x + mark.x * rect.width, cy: rect.y + mark.y * rect.height, r: mark.r * rect.height } : null);

  return (
    <View testID="mark-screen" style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Header
        left={<Underlined onPress={onBack} testID="mark-back">{t('capture.mark.back')}</Underlined>}
        center={<Text style={{ color: colors.text, ...type.button }}>{onSkip ? t('capture.mark.checkTitle') : t('capture.mark.title')}</Text>}
        right={<View />}
      />
      <View
        {...pan.panHandlers}
        testID="mark-stage"
        accessibilityLabel={t('capture.mark.stage')}
        onLayout={(e) => setStageH(Math.round(e.nativeEvent.layout.height))}
        style={{ flex: 1, width: box.width, backgroundColor: colors.surface, overflow: 'hidden' }}
      >
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height }}>
          <VideoView player={player} style={{ width: box.width, height: box.height }} contentFit="contain" nativeControls={false} allowsVideoFrameAnalysis={false} />
          {shown && shown.r > 0 ? (
            <Svg width={box.width} height={box.height} style={{ position: 'absolute', left: 0, top: 0 }}>
              <Circle cx={shown.cx} cy={shown.cy} r={shown.r} stroke={colors.halo} strokeWidth={stroke.halo} fill="none" />
              <Circle cx={shown.cx} cy={shown.cy} r={shown.r} stroke={colors.flare} strokeWidth={stroke.path} fill="none" />
              <Circle cx={shown.cx} cy={shown.cy} r={4} fill={colors.flare} stroke={colors.halo} strokeWidth={1.5} />
            </Svg>
          ) : null}
        </View>
        {drag && coach === 'drag' ? (
          <View testID="mark-coach" pointerEvents="none" style={{ position: 'absolute', top: space.s4, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ ...type.button, color: colors.text, backgroundColor: shade(0.72), paddingHorizontal: space.s4, paddingVertical: space.s2, ...shape.control, overflow: 'hidden' }}>
              {t('capture.mark.coachDrag')}
            </Text>
          </View>
        ) : null}
        {!touched && !mark ? (
          <View
            testID="mark-hint"
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height, alignItems: 'center', justifyContent: 'center', gap: space.s4, backgroundColor: shade(0.72) }}
          >
            {coach === 'tap' ? (
              <Text testID="mark-tap-hint" style={{ ...type.button, color: colors.flare }}>
                {t('capture.mark.coachTap')}
              </Text>
            ) : null}
            <MarkExample size={Math.min(160, Math.round(box.height * 0.32))} />
            <View style={{ gap: space.s2 }}>
              {[t('capture.mark.step1'), t('capture.mark.step2')].map((s, i) => (
                <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
                  <Text style={{ ...type.button, color: colors.flare, width: space.s4 }}>{i + 1}</Text>
                  <Text style={{ ...type.button, color: colors.text }}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s4, paddingBottom: Math.max(insets.bottom, space.s4), gap: space.s5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s4 }}>
          <Text testID="mark-help" style={{ ...type.callout, color: colors.text2, flex: 1 }}>
            {!mark ? t('capture.mark.help') : moved ? t('capture.mark.redo') : onSkip ? t('capture.mark.check') : t('capture.mark.found')}
          </Text>
        </View>
        <View style={{ gap: space.s3 }}>
          <Btn onPress={() => mark && onTrack(mark)} disabled={!mark || (!onSkip && !moved)} testID="mark-track">
            {onSkip ? t('capture.mark.go') : t('capture.mark.track')}
          </Btn>
          {onSkip ? (
            <Btn kind="secondary" compact onPress={onSkip} testID="mark-skip">
              {t('capture.mark.skip')}
            </Btn>
          ) : (
            <Btn kind="secondary" compact onPress={onBack} testID="mark-cancel">
              {t('capture.mark.cancel')}
            </Btn>
          )}
        </View>
      </View>
    </View>
  );
}
