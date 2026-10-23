import { useEffect, useState, type ReactNode } from 'react';
import { View, type ImageSourcePropType } from 'react-native';
import { useVideoPlayer, VideoView, type VideoThumbnail } from 'expo-video';
import { snatchMock } from '../../analysis/fixtures';
import { frameSource } from '../../analysis/frames';
import { repByIndex } from '../../analysis/timeline';
import { colors, space } from '../../design/tokens';
import Stage from '../analysis/Stage';
import { reportError, reportMessage } from '../../lib/sentry';
import { loopTime, thumbTimes, type Trim } from './trim';

type Props = {
  uri: string | null;
  trim: Trim;
  durationS: number;
  width: number;
  height: number;
  // Hold one moment instead of looping (the trimmer's preview).
  seekTo?: number;
  onTime?: (t: number) => void;
  progress?: boolean;
  children?: ReactNode;
};

// Loops the trimmed range of a clip. uri null plays the bundled sample lift's
// key frames, so the flow runs without a camera.
export default function ClipPlayer(props: Props) {
  return props.uri ? <VideoClip {...props} uri={props.uri} /> : <SampleClip {...props} />;
}

function VideoClip({ uri, trim, width, height, seekTo, onTime, progress = true, children }: Props & { uri: string }) {
  const [t, setT] = useState(trim.start);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.05;
    p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
    p.currentTime = trim.start;
    p.play();
  });
  useEffect(() => {
    if (seekTo != null) {
      player.pause();
      player.currentTime = seekTo;
      return;
    }
    player.play();
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      const next = loopTime(currentTime, trim);
      if (next !== currentTime) player.currentTime = next;
      setT(next);
      onTime?.(next);
    });
    return () => sub.remove();
  }, [player, trim.start, trim.end, seekTo, onTime]);
  return (
    <View testID="clip-video" style={{ width, height, backgroundColor: colors.surface, overflow: 'hidden' }}>
      <VideoView player={player} style={{ width, height }} contentFit="cover" nativeControls={false} />
      {progress && seekTo == null ? <ProgressLine at={(t - trim.start) / Math.max(trim.end - trim.start, 0.001)} /> : null}
      {children}
    </View>
  );
}

const SAMPLE_REP = repByIndex(snatchMock, snatchMock.bestRepIndex);
const FRAME_MS = 280;

export type Thumb = ImageSourcePropType | VideoThumbnail | null;

// Filmstrip cells. A real clip's frames come from AVAssetImageGenerator through
// expo-video, which returns [] without an error until the player's item has loaded,
// so they are asked for only once the player is ready.
export function useClipThumbs(uri: string | null, durationS: number, count = 6): Thumb[] {
  const player = useVideoPlayer(uri);
  const [made, setMade] = useState<VideoThumbnail[]>([]);
  useEffect(() => {
    if (!uri) return;
    let live = true;
    let asked = false;
    const make = () => {
      if (asked) return;
      asked = true;
      player.generateThumbnailsAsync(thumbTimes(durationS, count), { maxWidth: 240 }).then(
        (thumbs) => {
          if (thumbs.length === 0) reportMessage('trim thumbnails empty', { durationS: String(durationS) });
          if (live) setMade(thumbs);
        },
        (e: unknown) => reportError(e, { where: 'trim-thumbnails' })
      );
    };
    if (player.status === 'readyToPlay') make();
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') make();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [player, uri, durationS, count]);
  if (uri) return Array.from({ length: count }, (_, i) => made[i] ?? null);
  const frames = SAMPLE_REP.keyFrames;
  return Array.from({ length: count }, (_, i) => frameSource(frames[Math.min(frames.length - 1, Math.round((i * (frames.length - 1)) / (count - 1)))].image));
}

function SampleClip({ durationS, width, height, seekTo, progress = true, children }: Props) {
  const frames = SAMPLE_REP.keyFrames;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (seekTo != null) return;
    const id = setInterval(() => setI((n) => (n + 1) % frames.length), FRAME_MS);
    return () => clearInterval(id);
  }, [seekTo, frames.length]);
  const shown = seekTo != null ? Math.min(frames.length - 1, Math.floor((seekTo / Math.max(durationS, 0.001)) * frames.length)) : i;
  return (
    <View testID="clip-sample" style={{ width, height, overflow: 'hidden' }}>
      <Stage
        src={{ width: snatchMock.video.width, height: snatchMock.video.height }}
        box={{ width, height }}
        focus={{ x: 0.5, y: 0.45 }}
        layers={[{ image: frames[shown].image, key: 'clip' }]}
      />
      {progress && seekTo == null ? <ProgressLine at={(i + 1) / frames.length} /> : null}
      {children}
    </View>
  );
}

function ProgressLine({ at }: { at: number }) {
  return (
    <View
      testID="clip-progress"
      style={{ position: 'absolute', left: space.gutter, right: space.gutter, bottom: space.s4, height: 2, backgroundColor: colors.hairline }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.round(Math.min(Math.max(at, 0), 1) * 100)}%`, backgroundColor: colors.text }} />
    </View>
  );
}
