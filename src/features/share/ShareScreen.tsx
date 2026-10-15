import { useEffect, useRef, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { Analysis } from '../../analysis/types';
import Btn from '../../components/Btn';
import Segmented from '../../components/Segmented';
import TopBar from '../../components/TopBar';
import { colors, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import ShareCard from './ShareCard';
import { discardRender, renderStill, renderVideo, saveToPhotos, shareFile } from './exporter';
import type { LocalClip } from './localClips';
import { SHARE_ASPECTS, buildOverlaySpec, type ShareAspect } from './overlay';
import { cardSize } from './model';

export type ShareDeps = {
  renderVideo: typeof renderVideo;
  renderStill: typeof renderStill;
  share: typeof shareFile;
  save: typeof saveToPhotos;
  discard: typeof discardRender;
};

const DEFAULT_DEPS: ShareDeps = { renderVideo, renderStill, share: shareFile, save: saveToPhotos, discard: discardRender };

type Mode = 'video' | 'still';
type Render = { status: 'rendering'; progress: number } | { status: 'ready'; uri: string } | { status: 'failed' };

const NO_ORIGINAL = "The original video isn't on this phone any more, so this shares a still of the lift.";

export default function ShareScreen({
  analysis,
  pro,
  clip,
  canRenderVideo = true,
  initialAspect = '9:16',
  onBack,
  deps = DEFAULT_DEPS,
}: {
  analysis: Analysis;
  pro: boolean;
  // The lifter's clip on this phone; null when it is gone.
  clip: LocalClip | null;
  canRenderVideo?: boolean;
  initialAspect?: ShareAspect;
  onBack: () => void;
  deps?: ShareDeps;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const video = !!clip && canRenderVideo;
  const [mode, setMode] = useState<Mode>(video ? 'video' : 'still');
  const [aspect, setAspect] = useState<ShareAspect>(initialAspect);
  const [renders, setRenders] = useState<Partial<Record<ShareAspect, Render>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const cardRef = useRef<View>(null);
  const made = useRef<string[]>([]);

  const render = renders[aspect];

  const start = async (a: ShareAspect) => {
    if (!clip) return;
    const set = (r: Render) => setRenders((prev) => ({ ...prev, [a]: r }));
    set({ status: 'rendering', progress: 0 });
    try {
      const spec = buildOverlaySpec(analysis, { aspect: a, clipStartS: clip.startS, pro });
      const uri = await deps.renderVideo(clip.uri, spec, (progress) => set({ status: 'rendering', progress }));
      made.current.push(uri);
      set({ status: 'ready', uri });
    } catch {
      set({ status: 'failed' });
    }
  };

  useEffect(() => {
    if (mode === 'video' && !renders[aspect]) void start(aspect);
  }, [mode, aspect]);

  useEffect(() => () => made.current.forEach((uri) => deps.discard(uri)), []);

  const box = cardSize(aspect);
  const maxW = width - space.gutter * 2;
  const maxH = Math.max(320, height - insets.top - insets.bottom - 360);
  const scale = Math.min(maxW / box.width, maxH / box.height);
  const shown = { width: Math.round(box.width * scale), height: Math.round(box.height * scale) };

  const fileToSend = async (): Promise<string | null> => {
    if (mode === 'video') return render?.status === 'ready' ? render.uri : null;
    return deps.renderStill(cardRef, aspect);
  };

  const onShare = async () => {
    setNotice(null);
    try {
      const uri = await fileToSend();
      if (uri) await deps.share(uri);
    } catch {
      setNotice("Couldn't open the share sheet. Try again.");
    }
  };

  const onSave = async () => {
    setNotice(null);
    try {
      const uri = await fileToSend();
      if (!uri) return;
      const r = await deps.save(uri);
      setNotice(r === 'saved' ? 'Saved to Photos.' : 'Allow Catchline to add to Photos in Settings to save.');
    } catch {
      setNotice("Couldn't save to Photos. Try again.");
    }
  };

  const rendering = mode === 'video' && render?.status === 'rendering';
  const failed = mode === 'video' && render?.status === 'failed';
  const note = !clip ? NO_ORIGINAL : failed ? "Couldn't make the video. Try again, or share the still." : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="share-screen">
      <TopBar
        back="Back"
        onBack={onBack}
        more={false}
        center={<Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>Share</Text>}
      />
      <View style={{ alignItems: 'center', paddingHorizontal: space.gutter }}>
        <View style={{ width: shown.width, height: shown.height, overflow: 'hidden', borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.bg }} testID="share-preview">
          {mode === 'video' && render?.status === 'ready' ? (
            <LoopingVideo uri={render.uri} width={shown.width} height={shown.height} />
          ) : (
            <View
              style={{
                position: 'absolute',
                left: (shown.width - box.width) / 2,
                top: (shown.height - box.height) / 2,
                width: box.width,
                height: box.height,
                transform: [{ scale }],
                opacity: rendering ? 0.35 : 1,
              }}
            >
              <ShareCard ref={cardRef} analysis={analysis} aspect={aspect} brand={!pro} />
            </View>
          )}
          {rendering ? <Progress value={render.progress} /> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: video ? 'space-between' : 'center', paddingTop: space.s3, paddingHorizontal: space.gutter }}>
        {video ? (
          <Segmented
            options={[
              { value: 'video', label: 'Video' },
              { value: 'still', label: 'Strobe card' },
            ]}
            value={mode}
            onChange={(m) => {
              setNotice(null);
              setMode(m);
            }}
            testID="share-mode"
          />
        ) : null}
        <Segmented options={SHARE_ASPECTS.map((a) => ({ value: a, label: a }))} value={aspect} onChange={setAspect} mono testID="share-aspect" />
      </View>
      <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.s5, gap: space.s3 }}>
        {note ? (
          <Text testID="share-note" style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21, textAlign: 'center' }}>
            {note}
          </Text>
        ) : null}
        {failed ? (
          <View style={{ alignItems: 'center' }}>
            <Btn kind="text" onPress={() => void start(aspect)} testID="share-retry">
              Try again
            </Btn>
          </View>
        ) : null}
        {notice ? (
          <Text testID="share-notice" style={{ color: colors.text, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
            {notice}
          </Text>
        ) : null}
        <Btn onPress={onShare} testID="share-primary">
          {mode === 'still' ? 'Share image' : rendering ? `Making your video ${Math.round((render.progress ?? 0) * 100)}%` : 'Share video'}
        </Btn>
        <Btn kind="secondary" onPress={onSave} testID="share-save">
          Save to Photos
        </Btn>
      </View>
    </View>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, justifyContent: 'center', alignItems: 'center', gap: space.s3 }} testID="share-rendering">
      <Text style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20 }}>Drawing your bar path</Text>
      <View style={{ width: '60%', height: 2, backgroundColor: colors.hairline }}>
        <View testID="render-progress" style={{ height: 2, width: `${Math.round(value * 100)}%`, backgroundColor: colors.flare }} />
      </View>
    </View>
  );
}

function LoopingVideo({ uri, width, height }: { uri: string; width: number; height: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView testID="share-video" player={player} style={{ width, height }} contentFit="contain" nativeControls={false} />;
}
