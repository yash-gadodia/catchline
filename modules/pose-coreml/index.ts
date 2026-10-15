import { NativeModule, requireOptionalNativeModule } from 'expo';

// One person in one frame, in pixels of the upright frame scaled to 1280 px tall
// (what cv/catchline_cv/pose.py sees). kp: 26 halpe26 keypoints [x, y, score];
// head points (0-4, 17) are always null, dropped on the phone.
export type PosePerson = { box: number[]; kp: ([number, number, number] | null)[] };

export type PoseFrame = { t: number; people: PosePerson[]; lifter?: number };

export type PoseResult = { fps: number; width: number; height: number; frames: PoseFrame[] };

type Events = { onProgress: (e: { progress: number }) => void };

declare class PoseCoreMLModule extends NativeModule<Events> {
  analyzePose(uri: string): Promise<PoseResult>;
}

// iOS only: null on Android, where the server keeps running pose.
export default requireOptionalNativeModule<PoseCoreMLModule>('PoseCoreML');
