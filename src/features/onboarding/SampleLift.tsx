import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { Size } from '../../analysis/geometry';
import TrackOverlay from '../analysis/TrackOverlay';
import { frameAt, timeOf } from '../analysis/tracker';
import { coverBox, focusY, SAMPLE_ANALYSIS, SAMPLE_BODY, SAMPLE_CLIP } from './sample';

const SHOW = { path: true, lines: false, body: true };

// A real tracked lift, playing on a loop at half speed with what the tracker draws on it: the bar path as it goes
// and the body lines. With Reduce Motion it is one still, on the frame where the path is whole.
export default function SampleLift({ box, reduce }: { box: Size; reduce: boolean }) {
  const analysis = SAMPLE_ANALYSIS;
  const { fps, frameCount } = analysis.video;
  const path = analysis.reps[0]?.path ?? [];
  const still = path.length ? path[path.length - 1].frame : 0;
  const [frame, setFrame] = useState(reduce ? still : 0);
  const player = useVideoPlayer(SAMPLE_CLIP, (p) => {
    p.muted = true;
    p.loop = !reduce;
    p.playbackRate = 0.5;
    p.timeUpdateEventInterval = 1 / 60;
    if (reduce) p.currentTime = timeOf(still, fps);
    else p.play();
  });
  useEffect(() => {
    if (reduce) return;
    const sub = player.addListener('timeUpdate', ({ currentTime }) => setFrame(frameAt(currentTime, fps, frameCount)));
    return () => sub.remove();
  }, [player, reduce, fps, frameCount]);
  const video = coverBox(analysis.video, box, focusY(analysis, SAMPLE_BODY));
  return (
    <View testID="sample-lift" pointerEvents="none" style={{ width: box.width, height: box.height, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: video.left, top: video.top, width: video.width, height: video.height }}>
        <VideoView player={player} style={{ width: video.width, height: video.height }} contentFit="fill" nativeControls={false} allowsVideoFrameAnalysis={false} />
        <TrackOverlay analysis={analysis} body={SAMPLE_BODY} frame={frame} box={{ width: video.width, height: video.height }} show={SHOW} />
      </View>
    </View>
  );
}
