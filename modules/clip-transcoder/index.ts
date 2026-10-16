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

export type TranscodeResult = { uri: string; size: number; width: number; height: number; fps: number; frames: number; durationS: number };

type Events = { onProgress: (e: { progress: number }) => void };

declare class ClipTranscoderModule extends NativeModule<Events> {
  probe(uri: string): Promise<SourceInfo>;
  transcode(options: TranscodeOptions): Promise<TranscodeResult>;
  renderShareVideo(uri: string, spec: OverlaySpec): Promise<ShareVideoResult>;
}

export default requireNativeModule<ClipTranscoderModule>('ClipTranscoder');
