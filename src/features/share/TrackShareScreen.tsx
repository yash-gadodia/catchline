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
import { colors, shade, shape, space } from '../../design/tokens';
import Mark from '../../components/Mark';
import { display, type } from '../../design/typography';
import TrackOverlay from '../analysis/TrackOverlay';
import { frameAt, liftRange, timeOf } from '../analysis/tracker';
import { discardRender, fastShareSupported, renderTrackImage, shareBrandSupported, shareDetailsSupported, renderTrackVideo, shareFile } from './exporter';
import ShareDetails from './ShareDetails';
import { askForRatingOnce } from './rating';
import { liftCsv } from './csv';
import { shareLiftsCsv } from '../you/liftsCsv';
import { buildTrackSpec, markLayout, shareChart, shareSpeeds, frameCountOf, hasBarPath, type ShareSpeed, type TrackShareOptions } from './trackShare';
import { Chip } from './ui';

export type TrackShareDeps = {
  renderVideo: typeof renderTrackVideo;
  renderImage: typeof renderTrackImage;
  share: typeof shareFile;
  discard: typeof discardRender;
  askRating: typeof askForRatingOnce;
  shareCsv: typeof shareLiftsCsv;
  // tests: whether the binary draws the logo lockup (default: ask ClipTranscoder)
  shareBrand?: boolean;
  // tests: whether the binary renders 2x / 4x (default: ask ClipTranscoder)
  fastShare?: boolean;
  // tests: whether the binary draws the whole path, the graph and the caption (default: ask ClipTranscoder)
  shareDetails?: boolean;
};

const DEFAULT_DEPS: TrackShareDeps = { renderVideo: renderTrackVideo, renderImage: renderTrackImage, share: shareFile, discard: discardRender, askRating: askForRatingOnce, shareCsv: shareLiftsCsv };
const LAYERS = ['path', 'lines', 'body'] as const;
const SCRUB_H = 44;

// Share for a 4.0 lift: the clip with what the tracker draws, as a video or as one frame of it.
export default function TrackShareScreen({
  analysis,
  body,
  clipUri,
  watermark,
  caption = null,
  onBack,
  deps = DEFAULT_DEPS,
}: {
  analysis: Analysis;
  body: Body | null;
  clipUri: string;
  watermark: boolean;
  // the lift's date, and its weight when the lifter gave one: offered as a line on the video
  caption?: string | null;
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
  // 4.0.3 on: the speed graph and the lifter's line on the video. The line starts on only when it carries a weight.
  const details = deps.shareDetails ?? shareDetailsSupported();
  const [graph, setGraph] = useState(true);
  const [captioned, setCaptioned] = useState(analysis.loadKg != null);
  const { first, last } = liftRange(analysis.lift, count, whole);
  const [frame, setFrameState] = useState(first);
  const [making, setMaking] = useState<{ kind: 'video' | 'image'; progress: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lockupW, setLockupW] = useState(120);
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

  const gone = useRef(false);
  const busy = useRef(false);
  useEffect(
    () => () => {
      gone.current = true;
      Object.values(made.current).forEach((uri) => deps.discard(uri));
    },
    []
  );

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
  // the preview takes what the controls and buttons leave (they have grown: speeds, CSV), so nothing overlaps on an SE
  const [room, setRoom] = useState<number | null>(null);
  const maxH = room ?? Math.max(240, height - insets.top - insets.bottom - 380);
  const boxW = Math.min(width, Math.round((maxH * src.width) / src.height));
  const box = { width: boxW, height: Math.round((boxW * src.height) / src.width) };
  const mark = markLayout(src);
  const markScale = box.width / mark.widthPt;

  const toggleWhole = () => {
    const next = liftRange(analysis.lift, count, !whole);
    setWhole(!whole);
    if (frameRef.current >= next.first && frameRef.current <= next.last) return;
    frameRef.current = next.first;
    setFrameState(next.first);
    player.currentTime = timeOf(next.first, fps);
  };

  const lockup = watermark && (deps.shareBrand ?? shareBrandSupported());
  const chart = details && graph ? shareChart(analysis, first, last) : undefined;
  const options: TrackShareOptions = { ...layers, body: layers.body && body !== null, watermark, speed, whole, ...(details ? { details: { graph, caption: captioned ? caption : null } } : {}) };

  // Renders once per set of choices; the same choices share the file already made.
  const send = async (kind: 'video' | 'image') => {
    // a ref: two taps in one frame both read the same `making`
    if (busy.current) return;
    busy.current = true;
    try {
      await sendOnce(kind);
    } finally {
      busy.current = false;
    }
  };
  const sendOnce = async (kind: 'video' | 'image') => {
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
        // the lifter left while it rendered: no share sheet over another screen, and the file goes
        if (gone.current) return void deps.discard(uri);
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
      overlay_graph: !!options.details?.graph,
      overlay_caption: !!options.details?.caption,
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
      <View onLayout={(e) => setRoom(Math.round(e.nativeEvent.layout.height))} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, overflow: 'hidden' }}>
        <Pressable
          testID="share-preview"
          accessibilityRole="button"
          accessibilityLabel={t('analysis.player.play')}
          onPress={() => (player.playing ? player.pause() : player.play())}
          style={{ width: box.width, height: box.height, overflow: 'hidden' }}
        >
          <VideoView player={player} style={{ width: box.width, height: box.height }} contentFit="fill" nativeControls={false} allowsVideoFrameAnalysis={false} />
          <TrackOverlay analysis={analysis} body={body} frame={frame} box={box} show={options} whole={details} />
          {lockup || details ? (
            // the column the video carries (TrackRenderer drawLockup, drawDetails): the lockup on a dark plate, then the lifter's line and the graph
            <View pointerEvents="none" style={{ position: 'absolute', left: box.width * 0.045, top: box.height * 0.12, gap: mark.size * markScale * 0.2, alignItems: 'flex-start' }}>
              {lockup ? (
                <View
                  testID="share-lockup"
                  onLayout={(e) => setLockupW(e.nativeEvent.layout.width)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingHorizontal: space.s2, paddingVertical: space.s2, backgroundColor: shade(0.82), ...shape.control }}
                >
                  <Mark size={mark.size * markScale * 2} />
                  <View>
                    {/* i18n-ok: the brand wordmark, as drawn on the video */}
                    <Text style={[display(mark.size * markScale * 1.45), { color: colors.text }]}>Catchline</Text>
                    <Text numberOfLines={1} style={[display(mark.size * markScale * 0.82), { color: colors.text2 }]}>{t('share.brandLine')}</Text>
                  </View>
                </View>
              ) : null}
              {details ? <ShareDetails unit={mark.size * markScale} width={lockup ? lockupW : mark.size * markScale * 8} caption={captioned ? caption : null} chart={chart} frame={frame} first={first} last={last} /> : null}
            </View>
          ) : null}
          {watermark && !lockup ? (
            <Text testID="share-watermark" style={[display(mark.size * markScale), { position: 'absolute', right: mark.inset * markScale, bottom: mark.inset * markScale, color: colors.text }]}>
              {t('share.mark')}
            </Text>
          ) : null}
        </Pressable>
      </View>
      <View {...pan.panHandlers} testID="share-scrub" accessibilityRole="adjustable" accessibilityLabel={t('analysis.tracker.scrub')} style={{ height: SCRUB_H, justifyContent: 'center' }}>
        <View style={{ height: 3, backgroundColor: colors.hairline }}>
          <View style={{ height: 3, width: `${(Math.min(Math.max(frame - first, 0), last - first) / Math.max(last - first, 1)) * 100}%`, backgroundColor: colors.text }} />
        </View>
      </View>
      <View style={{ gap: space.s3, paddingHorizontal: space.gutter }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
          {LAYERS.filter((k) => k !== 'body' || body !== null).map((k) => (
            <Chip key={k} testID={`share-toggle-${k}`} label={t(`analysis.tracker.overlay.${k}`)} on={layers[k]} mono onPress={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} />
          ))}
          {hasLift ? <Chip testID="share-toggle-whole" label={t('analysis.tracker.wholeClip')} on={whole} mono onPress={toggleWhole} /> : null}
          {details && shareChart(analysis, first, last) ? <Chip testID="share-toggle-graph" label={t('share.graph')} on={graph} mono onPress={() => setGraph((g) => !g)} /> : null}
          {details && caption ? <Chip testID="share-toggle-caption" label={analysis.loadKg != null ? t('share.dateWeight') : t('share.date')} on={captioned} mono onPress={() => setCaptioned((c) => !c)} /> : null}
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
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s4, paddingBottom: insets.bottom + space.s5, gap: space.s3 }}>
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
        {hasBarPath(analysis) ? (
          <Btn
            kind="secondary"
            compact
            onPress={() => void deps.shareCsv(liftCsv(analysis), `catchline-${analysis.id}.csv`).catch(() => setNotice(t('share.shareFailed')))}
            testID="share-csv-btn"
          >
            {t('share.shareData')}
          </Btn>
        ) : null}
      </View>
    </View>
  );
}
