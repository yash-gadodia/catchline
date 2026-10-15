import { NativeModule, requireOptionalNativeModule } from 'expo';

// [x, y, confidence] in pixels of the upright video, origin top-left.
export type Joint = [number, number, number];
export type Joints = Record<string, Joint>;
export type PoseBox = [number, number, number, number];

export type PoseFrame = {
  t: number;
  joints: Joints;
  box?: PoseBox;
  others?: { box: PoseBox; joints: Joints }[];
};

export type PoseResult = { fps: number; width: number; height: number; frames: PoseFrame[]; bodyAngleDeg?: number };

export type AnalyzePoseOptions = { fps?: number; maxSide?: number };

type Events = { onProgress: (e: { progress: number }) => void };

declare class PoseVisionModule extends NativeModule<Events> {
  analyzePose(uri: string, options: AnalyzePoseOptions): Promise<PoseResult>;
}

// iOS only: null on Android, where the server keeps running pose.
export default requireOptionalNativeModule<PoseVisionModule>('PoseVision');
