import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { t } from '../../i18n';
import Btn from '../../components/Btn';
import Segmented from '../../components/Segmented';
import TopBar from '../../components/TopBar';
import { colors, space } from '../../design/tokens';
import { display, type } from '../../design/typography';
import TrackOverlay from '../analysis/TrackOverlay';
import { frameAt, timeOf } from '../analysis/tracker';
import { discardRender, renderTrackImage, renderTrackVideo, shareFile } from './exporter';
import { SHARE_SPEEDS, buildTrackSpec, frameCountOf, type ShareSpeed, type TrackShareOptions } from './trackShare';
import { Chip } from './ui';

export type TrackShareDeps = {
  renderVideo: typeof renderTrackVideo;
  renderImage: typeof renderTrackImage;
  share: typeof shareFile;
  discard: typeof discardRender;
};

const DEFAULT_DEPS: TrackShareDeps = { renderVideo: renderTrackVideo, renderImage: renderTrackImage, share: shareFile, discard: discardRender };
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
  const [layers, setLayers] = useState({ path: true, lines: true, body: false });
  const [speed, setSpeed] = useState<ShareSpeed>(1);
  const [frame, setFrameState] = useState(0);
  const [making, setMaking] = useState<{ kind: 'video' | 'image'; progress: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const frameRef = useRef(0);
  const made = useRef<Record<string, string>>({});

  const player = useVideoPlayer(clipUri, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 1 / 60;
    p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      const f = frameAt(currentTime, fps, count);
      if (f === frameRef.current) return;
      frameRef.current = f;
      setFrameState(f);
    });
    return () => sub.remove();
  }, [player, fps, count]);

  useEffect(() => () => Object.values(made.current).forEach((uri) => deps.discard(uri)), []);

  const seek = (next: number) => {
    const f = Math.min(Math.max(0, Math.round(next)), count - 1);
    player.pause();
    if (f === frameRef.current) return;
    frameRef.current = f;
    setFrameState(f);
    player.currentTime = timeOf(f, fps);
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

  const src = { width: analysis.video.width, height: analysis.video.height };
  const maxH = Math.max(240, height - insets.top - insets.bottom - 380);
  const boxW = Math.min(width, Math.round((maxH * src.width) / src.height));
  const box = { width: boxW, height: Math.round((boxW * src.height) / src.width) };

  const options: TrackShareOptions = { ...layers, body: layers.body && body !== null, watermark, speed };

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
    try {
      await deps.share(uri);
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
          <View style={{ height: 3, width: `${(frame / Math.max(count - 1, 1)) * 100}%`, backgroundColor: colors.text }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.gutter }}>
        <View style={{ flexDirection: 'row', gap: space.s2 }}>
          {LAYERS.filter((k) => k !== 'body' || body !== null).map((k) => (
            <Chip key={k} testID={`share-toggle-${k}`} label={t(`analysis.tracker.overlay.${k}`)} on={layers[k]} mono onPress={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} />
          ))}
        </View>
        <Segmented
          testID="share-speed"
          mono
          options={SHARE_SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))}
          value={String(speed)}
          onChange={(v) => {
            const next = SHARE_SPEEDS.find((s) => String(s) === v) ?? 1;
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
