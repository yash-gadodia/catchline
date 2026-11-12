import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { t } from '../../i18n';
import { EVENTS, track } from '../../lib/analytics';
import Btn from '../../components/Btn';
import Segmented from '../../components/Segmented';
import TopBar from '../../components/TopBar';
import { colors, space } from '../../design/tokens';
import { display, type } from '../../design/typography';
import TrackOverlay from '../analysis/TrackOverlay';
import { frameAt, liftRange, timeOf } from '../analysis/tracker';
import { discardRender, fastShareSupported, renderTrackImage, renderTrackVideo, shareFile } from './exporter';
import { askForRatingOnce } from './rating';
import { buildTrackSpec, shareSpeeds, frameCountOf, hasBarPath, type ShareSpeed, type TrackShareOptions } from './trackShare';
import { Chip } from './ui';

export type TrackShareDeps = {
  renderVideo: typeof renderTrackVideo;
  renderImage: typeof renderTrackImage;
  share: typeof shareFile;
  discard: typeof discardRender;
  askRating: typeof askForRatingOnce;
  // tests: whether the binary renders 2x / 4x (default: ask ClipTranscoder)
  fastShare?: boolean;
};

const DEFAULT_DEPS: TrackShareDeps = { renderVideo: renderTrackVideo, renderImage: renderTrackImage, share: shareFile, discard: discardRender, askRating: askForRatingOnce };
const LAYERS = ['path', 'lines', 'body'] as const;
const SCRUB_H = 44;

// Share for a 4.0 lift: the clip with what the tracker draws, as a video or as one frame of it.
export default function TrackShareScreen({
  analysis,
  body,
  clipUri,
  watermark,
  onBack,
  deps = DEFAULT_DEPS,
}: {
  analysis: Analysis;
  body: Body | null;
  clipUri: string;
  watermark: boolean;
  onBack: () => void;
  deps?: TrackShareDeps;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const fps = analysis.video.fps;
  const count = frameCountOf(analysis, body);
  const [layers, setLayers] = useState({ path: true, lines: true, body: true });
  const speeds = shareSpeeds(deps.fastShare ?? fastShareSupported());
  const [speed, setSpeed] = useState<ShareSpeed>(1);
  // Like the player, the share keeps to the lift itself until the lifter asks for the whole clip.
  const hasLift = liftRange(analysis.lift, count, false).cropped;
  const [whole, setWhole] = useState(false);
  const { first, last } = liftRange(analysis.lift, count, whole);
  const [frame, setFrameState] = useState(first);
  const [making, setMaking] = useState<{ kind: 'video' | 'image'; progress: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const frameRef = useRef(first);
  const made = useRef<Record<string, string>>({});

  const player = useVideoPlayer(clipUri, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 1 / 60;
    p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
    if (first > 0) p.currentTime = timeOf(first, fps);
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      let f = frameAt(currentTime, fps, count);
      // past the lift's last frame (or before its first): round again from its first
      if (f > last || f < first) {
        f = first;
        player.currentTime = timeOf(first, fps);
      }
      if (f === frameRef.current) return;
      frameRef.current = f;
      setFrameState(f);
    });
    const loaded = player.addListener('sourceLoad', () => {
      if (first > 0 && frameRef.current === first) player.currentTime = timeOf(first, fps);
    });
    return () => {
      sub.remove();
      loaded.remove();
    };
  }, [player, fps, count, first, last]);

  useEffect(() => () => Object.values(made.current).forEach((uri) => deps.discard(uri)), []);

  const seek = (next: number) => {
    const f = Math.min(Math.max(first, Math.round(next)), last);
    player.pause();
    if (f === frameRef.current) return;
    frameRef.current = f;
    setFrameState(f);
    player.currentTime = timeOf(f, fps);
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

  const src = { width: analysis.video.width, height: analysis.video.height };
  const maxH = Math.max(240, height - insets.top - insets.bottom - 380);
  const boxW = Math.min(width, Math.round((maxH * src.width) / src.height));
  const box = { width: boxW, height: Math.round((boxW * src.height) / src.width) };

  const toggleWhole = () => {
    const next = liftRange(analysis.lift, count, !whole);
    setWhole(!whole);
    if (frameRef.current >= next.first && frameRef.current <= next.last) return;
    frameRef.current = next.first;
    setFrameState(next.first);
    player.currentTime = timeOf(next.first, fps);
  };

  const options: TrackShareOptions = { ...layers, body: layers.body && body !== null, watermark, speed, whole };

  // Renders once per set of choices; the same choices share the file already made.
  const send = async (kind: 'video' | 'image') => {
    if (making) return;
    setNotice(null);
    player.pause();
    const key = kind === 'video' ? JSON.stringify(options) : JSON.stringify({ ...options, speed: 1, frame: frameRef.current });
    let uri = made.current[key];
    if (!uri) {
      setMaking({ kind, progress: 0 });
      try {
        uri =
          kind === 'video'
            ? await deps.renderVideo(clipUri, buildTrackSpec(analysis, body, options), (progress) => setMaking({ kind, progress }))
            : await deps.renderImage(clipUri, buildTrackSpec(analysis, body, options, frameRef.current));
        made.current[key] = uri;
      } catch {
        setNotice(t('share.renderFailed'));
        return;
      } finally {
        setMaking(null);
      }
    }
    const barPath = hasBarPath(analysis);
    track(EVENTS.SHARE_EXPORTED, {
      kind,
      speed: kind === 'video' ? speed : 1,
      overlay_path: options.path,
      overlay_lines: options.lines,
      overlay_body: options.body,
      whole_clip: whole,
      has_bar_path: barPath,
      duration_s: kind === 'video' ? Number(((last - first + 1) / fps / speed).toFixed(1)) : 0,
      completed: true,
    });
    try {
      const res = await deps.share(uri);
      track(EVENTS.SHARE_COMPLETED, { kind, activity: res.outcome === 'cancelled' ? 'dismissed' : (res.activity ?? 'unknown') });
      if (res.outcome === 'shared') void deps.askRating(barPath).catch(() => undefined);
    } catch {
      setNotice(t('share.shareFailed'));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="track-share-screen">
      <TopBar back={t('share.back')} onBack={onBack} more={false} center={<Text style={[type.button, { color: colors.text }]}>{t('share.title')}</Text>} />
      <View style={{ alignItems: 'center', backgroundColor: colors.surface }}>
        <Pressable
          testID="share-preview"
          accessibilityRole="button"
          accessibilityLabel={t('analysis.player.play')}
          onPress={() => (player.playing ? player.pause() : player.play())}
          style={{ width: box.width, height: box.height, overflow: 'hidden' }}
        >
          <VideoView player={player} style={{ width: box.width, height: box.height }} contentFit="fill" nativeControls={false} allowsVideoFrameAnalysis={false} />
          <TrackOverlay analysis={analysis} body={body} frame={frame} box={box} show={options} />
          {watermark ? (
            <Text testID="share-watermark" style={[display(15), { position: 'absolute', right: space.s3, bottom: space.s3, color: colors.text }]}>
              {/* i18n-ok: the brand wordmark, as burned into the file */}
              catchline
            </Text>
          ) : null}
        </Pressable>
      </View>
      <View {...pan.panHandlers} testID="share-scrub" accessibilityRole="adjustable" accessibilityLabel={t('analysis.tracker.scrub')} style={{ height: SCRUB_H, justifyContent: 'center' }}>
        <View style={{ height: 3, backgroundColor: colors.hairline }}>
          <View style={{ height: 3, width: `${(Math.min(Math.max(frame - first, 0), last - first) / Math.max(last - first, 1)) * 100}%`, backgroundColor: colors.text }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.s2, paddingHorizontal: space.gutter }}>
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
          {LAYERS.filter((k) => k !== 'body' || body !== null).map((k) => (
            <Chip key={k} testID={`share-toggle-${k}`} label={t(`analysis.tracker.overlay.${k}`)} on={layers[k]} mono onPress={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} />
          ))}
          {hasLift ? <Chip testID="share-toggle-whole" label={t('analysis.tracker.wholeClip')} on={whole} mono onPress={toggleWhole} /> : null}
        </View>
        <Segmented
          testID="share-speed"
          mono
          options={speeds.map((s) => ({ value: String(s), label: `${s}×` }))}
          value={String(speed)}
          onChange={(v) => {
            const next = speeds.find((s) => String(s) === v) ?? 1;
            player.playbackRate = next;
            setSpeed(next);
          }}
        />
      </View>
      <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.s5, gap: space.s3 }}>
        {notice ? (
          <Text testID="share-notice" style={[type.callout, { color: colors.text2, textAlign: 'center' }]}>
            {notice}
          </Text>
        ) : null}
        <Btn onPress={() => void send('video')} testID="share-video-btn">
          {making?.kind === 'video' ? t('share.making', { pct: Math.round(making.progress * 100) }) : t('share.shareVideo')}
        </Btn>
        <Btn kind="secondary" onPress={() => void send('image')} testID="share-image-btn">
          {t('share.shareImage')}
        </Btn>
      </View>
    </View>
  );
}
