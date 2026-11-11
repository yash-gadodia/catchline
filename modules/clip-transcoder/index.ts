import { NativeModule, requireNativeModule } from 'expo';
import type { OverlaySpec } from '../../src/features/share/overlay';

// Display size (rotation applied) and nominal frame rate of the clip's video track.
export type SourceInfo = { width: number; height: number; fps: number; durationS: number };

export type TranscodeOptions = {
  uri: string;
  startS: number;
  endS: number;
  width: number;
  height: number;
  fps: number;
  dropToFps: boolean;
  bitrate: number;
};

export type ShareVideoResult = { uri: string; width: number; height: number; durationS: number };

export type TrackVideoResult = { uri: string; width: number; height: number; frames: number; durationS: number };
export type TrackImageResult = { uri: string; width: number; height: number };

export type TranscodeResult = { uri: string; size: number; width: number; height: number; fps: number; frames: number; durationS: number };

type Events = { onProgress: (e: { progress: number }) => void };

declare class ClipTranscoderModule extends NativeModule<Events> {
  probe(uri: string): Promise<SourceInfo>;
  transcode(options: TranscodeOptions): Promise<TranscodeResult>;
  renderShareVideo(uri: string, spec: OverlaySpec): Promise<ShareVideoResult>;
  // 4.0 (binary 4.0.0 on). `spec` is JSON.stringify of a TrackSpec (src/features/share/trackShare.ts).
  // Video: the lift's kept clip with the overlay on every frame, H.264 MP4 at the clip's size and frame rate;
  // spec.speed 0.5 / 0.25 writes each frame 2 / 4 times. Reports onProgress.
  renderTrackVideo(uri: string, spec: string): Promise<TrackVideoResult>;
  // Image: frame spec.frame as a JPEG with the whole path drawn.
  renderTrackImage(uri: string, spec: string): Promise<TrackImageResult>;
}

export default requireNativeModule<ClipTranscoderModule>('ClipTranscoder');
