import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, View, useWindowDimensions } from 'react-native';
import Text from '../../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { t } from '../../i18n';
import { EVENTS, track } from '../../lib/analytics';
import { useInvite } from '../referrals/store';
import Btn from '../../components/Btn';
import Segmented from '../../components/Segmented';
import TopBar from '../../components/TopBar';
import { colors, shade, shape, space } from '../../design/tokens';
import Mark from '../../components/Mark';
import { display, fontFamily, type } from '../../design/typography';
import { APP_STORE_URL } from '../../lib/links';
import TrackOverlay from '../analysis/TrackOverlay';
import { frameAt, liftRange, timeOf } from '../analysis/tracker';
import { copyText, discardRender, fastShareSupported, installedShareApps, openShareApp, renderTrackImage, saveVideoToPhotos, shareBrandSupported, shareDetailsSupported, shareStorySupported, renderTrackVideo, shareFile, type ShareApp } from './exporter';
import { fetchMyReferral, inviteLink } from '../referrals/api';
import ShareDetails from './ShareDetails';
import { askForRatingOnce } from './rating';
import Sheet from '../../components/Sheet';
import { liftCsv } from './csv';
import { shareLiftsCsv } from '../you/liftsCsv';
import { STORY_ASPECT, buildStory, buildTrackSpec, markLayout, shareCaption, shareChart, shareSpeeds, storyPlacement, storyValue, frameCountOf, hasBarPath, type ShareSpeed, type TrackShareOptions } from './trackShare';
import { Chip } from './ui';
import { formatLoad } from '../../analysis/format';
import { useOnboarding } from '../onboarding/store';

export type TrackShareDeps = {
  renderVideo: typeof renderTrackVideo;
  renderImage: typeof renderTrackImage;
  share: typeof shareFile;
  discard: typeof discardRender;
  askRating: typeof askForRatingOnce;
  shareCsv: typeof shareLiftsCsv;
  // straight to an app or to Photos, with the caption on the clipboard
  saveVideo: typeof saveVideoToPhotos;
  installedApps: typeof installedShareApps;
  openApp: typeof openShareApp;
  copy: typeof copyText;
  // tests: whether the binary draws the logo lockup (default: ask ClipTranscoder)
  shareBrand?: boolean;
  // tests: whether the binary renders 2x / 4x (default: ask ClipTranscoder)
  fastShare?: boolean;
  // tests: whether the binary renders the 9:16 story (default: ask ClipTranscoder)
  shareStory?: boolean;
  // the lifter's invite code for the story's end card; null when they have none (not signed in)
  inviteCode: () => Promise<string | null>;
  // tests: whether the binary draws the whole path, the graph and the caption (default: ask ClipTranscoder)
  shareDetails?: boolean;
};

const myInviteCode = () => fetchMyReferral().then((r) => r.code, () => null);
const DEFAULT_DEPS: TrackShareDeps = { inviteCode: myInviteCode, saveVideo: saveVideoToPhotos, installedApps: installedShareApps, openApp: openShareApp, copy: copyText, renderVideo: renderTrackVideo, renderImage: renderTrackImage, share: shareFile, discard: discardRender, askRating: askForRatingOnce, shareCsv: shareLiftsCsv };
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
  onInvite,
  deps = DEFAULT_DEPS,
}: {
  analysis: Analysis;
  body: Body | null;
  clipUri: string;
  watermark: boolean;
  // the lift's date, and its weight when the lifter gave one: offered as a line on the video
  caption?: string | null;
  onBack: () => void;
  // after a first share: a line offering a friend a free month (referrals)
  onInvite?: () => void;
  deps?: TrackShareDeps;
}) {
  const insets = useSafeAreaInsets();
  const units = useOnboarding((s) => s.units);
  const { width, height } = useWindowDimensions();
  const fps = analysis.video.fps;
  const count = frameCountOf(analysis, body);
  // the clip's real rate, as the player has it: bar speed is measured at it, so the share shows the player's number
  const [clipS, setClipS] = useState(0);
  const clipFps = clipS > 0 ? count / clipS : undefined;
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
  // 4.0.5 on: the video as a 9:16 story (the number, a slow replay, the path as the end card), on unless switched off
  const storyOk = deps.shareStory ?? shareStorySupported();
  const [story, setStory] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (storyOk) void deps.inviteCode().then((c) => live && setCode(c));
    return () => {
      live = false;
    };
  }, [storyOk, deps]);
  const [apps, setApps] = useState<ShareApp[]>([]);
  useEffect(() => {
    let live = true;
    void deps.installedApps().then((a) => live && setApps(a), () => undefined);
    return () => {
      live = false;
    };
  }, [deps]);
  const { first, last } = liftRange(analysis.lift, count, whole);
  const [frame, setFrameState] = useState(first);
  const [making, setMaking] = useState<{ kind: 'video' | 'image'; progress: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invitePrompt, setInvitePrompt] = useState(false);
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
    const loaded = player.addListener('sourceLoad', (e) => {
      if (e.duration > 0) setClipS(e.duration);
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
  const lockup = watermark && (deps.shareBrand ?? shareBrandSupported());
  const chart = details && graph ? shareChart(analysis, first, last, clipFps) : undefined;
  const options: TrackShareOptions = { ...layers, body: layers.body && body !== null, watermark, speed, whole, ...(details ? { details: { graph, caption: captioned ? caption : null } } : {}), ...(storyOk && story ? { story: { kicker: captioned ? caption : null, title: analysis.loadKg != null ? formatLoad(analysis.loadKg, units) : null, code } } : {}), ...(clipFps ? { clipFps } : {}) };
  // the story as the video will carry it: the preview is the 9:16 canvas with the clip placed as StoryRenderer places it
  const storySpec = options.story ? buildStory(analysis, options.story, first, last, speed, clipFps) : null;
  const canvasW = Math.min(width, Math.round(maxH * STORY_ASPECT));
  const canvas = storySpec ? { width: canvasW, height: Math.round(canvasW / STORY_ASPECT) } : null;
  const ys = (analysis.reps[0]?.path ?? []).map((pt) => pt.y);
  const place = storySpec ? storyPlacement(src, storySpec.focusX, layers.path && ys.length ? Math.min(...ys) : null) : null;
  const boxW = Math.min(width, Math.round((maxH * src.width) / src.height));
  const box = canvas && place ? { width: Math.round(place.width * canvas.width), height: Math.round(place.height * canvas.height) } : { width: boxW, height: Math.round((boxW * src.height) / src.width) };
  const frameBox = canvas ?? box;
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

  // Renders once per set of choices; the same choices share the file already made.
  // Where a made video goes: the iOS share sheet, Photos, or Photos and then straight into an app.
  type Target = 'sheet' | 'save' | ShareApp;
  const send = async (kind: 'video' | 'image', target: Target = 'sheet') => {
    // a ref: two taps in one frame both read the same `making`
    if (busy.current) return;
    busy.current = true;
    try {
      await sendOnce(kind, target);
    } finally {
      busy.current = false;
    }
  };
  const sendOnce = async (kind: 'video' | 'image', target: Target) => {
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
    const after = () => {
      void deps.askRating(barPath).then((asked) => asked === 'asked' && track(EVENTS.RATING_ASK_SHOWN, {})).catch(() => undefined);
      if (onInvite && !useInvite.getState().promptedAfterShare) {
        useInvite.getState().markPrompted();
        setInvitePrompt(true);
      }
    };
    // a video goes with a caption to paste: what it shows, where it came from, the lifter's code
    const copied = kind === 'video' ? await deps.copy(shareCaption(storySpec, code, code ? inviteLink(code) : APP_STORE_URL)).then(() => true, () => false) : false;
    try {
      if (target === 'sheet') {
        const res = await deps.share(uri);
        track(EVENTS.SHARE_COMPLETED, { kind, activity: res.outcome === 'cancelled' ? 'dismissed' : (res.activity ?? 'unknown') });
        if (res.outcome !== 'shared') return;
        if (copied) setNotice(t('share.captionCopied'));
        return after();
      }
      const photosId = await deps.saveVideo(uri);
      if (photosId === null) return void setNotice(t('share.photosDenied'));
      track(EVENTS.SHARE_COMPLETED, { kind, activity: target });
      setNotice(t(copied ? 'share.savedCopied' : 'share.saved'));
      if (target !== 'save') await deps.openApp(target, photosId);
      after();
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
          style={{ width: frameBox.width, height: frameBox.height, overflow: 'hidden', backgroundColor: colors.bg }}
        >
          <View style={canvas && place ? { position: 'absolute', left: place.x * canvas.width, top: place.y * canvas.height, width: box.width, height: box.height } : { width: box.width, height: box.height }}>
            <VideoView player={player} style={{ width: box.width, height: box.height }} contentFit="fill" nativeControls={false} allowsVideoFrameAnalysis={false} />
            <TrackOverlay analysis={analysis} body={body} frame={frame} box={box} show={options} whole={details} />
          </View>
          {canvas && storySpec ? (
            // what StoryRenderer draws on the canvas: the mark under the apps' header, the number in the lower third
            <View pointerEvents="none" testID="share-story" style={{ position: 'absolute', left: 0, top: 0, width: canvas.width, height: canvas.height }}>
              <View style={{ position: 'absolute', left: 0, right: 0, top: canvas.height * 0.5, height: canvas.height * 0.15, backgroundColor: shade(0.3) }} />
              <View style={{ position: 'absolute', left: 0, right: 0, top: canvas.height * 0.65, bottom: 0, backgroundColor: shade(0.6) }} />
              <View style={{ position: 'absolute', left: canvas.width * 0.067, top: canvas.height * 0.15, flexDirection: 'row', alignItems: 'center', gap: canvas.width * 0.014 }}>
                <Mark size={canvas.width * 0.04} />
                {/* i18n-ok: the brand wordmark, as drawn on the video */}
                <Text style={[display(canvas.width * 0.042), { color: colors.text }]}>catchline</Text>
              </View>
              {storySpec.hero ? (
                <View style={{ position: 'absolute', left: canvas.width * 0.067, top: canvas.height * 0.56 }}>
                  {/* design-ok: sizes follow the canvas, as the video draws them */}
                  <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: canvas.width * 0.031, lineHeight: canvas.width * 0.045 }}>{storySpec.hero.kicker}</Text>
                  <Text testID="share-story-number" style={[display(canvas.width * 0.2), { color: colors.text }]}>
                    {storyValue(storySpec.hero, frame, first).toFixed(2)}
                    <Text style={[display(canvas.width * 0.07), { color: colors.flare }]}> {storySpec.hero.unit}</Text>
                  </Text>
                  {/* design-ok: sizes follow the canvas, as the video draws them */}
                  <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: canvas.width * 0.031, lineHeight: canvas.width * 0.045 }}>{storySpec.hero.label}</Text>
                </View>
              ) : null}
            </View>
          ) : lockup || details ? (
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
          {watermark && !lockup && !canvas ? (
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
          {storyOk ? <Chip testID="share-toggle-story" label={t('share.story.chip')} on={story} mono onPress={() => setStory((v) => !v)} /> : null}
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
        {invitePrompt && onInvite ? (
          <Btn
            kind="text"
            onPress={() => {
              track(EVENTS.INVITE_PROMPT_TAPPED, { from: 'share' });
              onInvite();
            }}
            testID="share-invite"
          >
            {t('invite.afterShare')}
          </Btn>
        ) : null}
        <Btn onPress={() => void send('video')} testID="share-video-btn">
          {making?.kind === 'video' ? t('share.making', { pct: Math.round(making.progress * 100) }) : t('share.shareVideo')}
        </Btn>
        <View style={{ flexDirection: 'row', gap: space.s2 }}>
          {apps.map((app) => (
            <Btn key={app} kind="secondary" compact style={{ flex: 1 }} onPress={() => void send('video', app)} testID={`share-to-${app}`}>
              {app === 'instagram' ? 'Instagram' : 'TikTok' /* i18n-ok: the apps' own names */}
            </Btn>
          ))}
          <Btn kind="secondary" compact style={{ flex: 1 }} onPress={() => void send('video', 'save')} testID="share-save-btn">
            {t('share.save')}
          </Btn>
        </View>
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
