import { NativeModule, requireOptionalNativeModule } from 'expo';

// One person in one frame, in pixels of the upright frame scaled to 1280 px tall
// (what cv/catchline_cv/pose.py sees). kp: 26 halpe26 keypoints [x, y, score];
// head points (0-4, 17) are always null, dropped on the phone.
export type PosePerson = { box: number[]; kp: ([number, number, number] | null)[] };

export type PoseFrame = { t: number; people: PosePerson[]; lifter?: number };

export type PoseResult = { fps: number; width: number; height: number; frames: PoseFrame[] };

// 3.1 bundles the models, so this is 'ready' (bundled: true) from the first launch. A build made
// without them falls back to the one-time download (PoseModelStore.swift, one release only): until
// 'ready', analyzePose and analyseOnDevice wait, and error is the last failed download.
export type ModelsStatus = { status: 'absent' | 'downloading' | 'ready' | 'failed'; error?: string; fraction: number; bundled?: boolean };

// What the TS pipeline still needs from the clip (src/analysis/device: planFromMisses), in the
// 1280 px inference frame. Each entry becomes one trace.py call record (AnalyseOnDevice.swift).
export type AnalysePlan = {
  windows?: { s0: number; count: number }[];
  plates?: { frame: number; wristA: [number, number] | null; wristB: [number, number] | null; bodyH: number; setupH: number | null }[];
  tracks?: { s0: number; n: number; start: number; plate: { centre: [number, number]; axes: [number, number]; score: number } }[];
  follows?: { s0: number; n: number; seed: number; wrists: ([number, number] | null)[]; wristA: [number, number] | null; wristB: [number, number] | null; bodyH: number; setupH: number }[];
  keyframes?: { name: string; frame: number }[];
};

// 'models' only in a build without bundled models (the download fallback).
export type AnalyseStage = 'models' | 'pose' | 'pixels';

export type AnalyseResult = { tracePath: string; stills: Record<string, string> };

type Events = {
  onProgress: (e: { progress: number }) => void;
  onAnalyseProgress: (e: { stage: AnalyseStage; fraction: number }) => void;
};

declare class PoseCoreMLModule extends NativeModule<Events> {
  analyzePose(uri: string): Promise<PoseResult>;
  ensureModels(): Promise<ModelsStatus>;
  modelsStatus(): Promise<ModelsStatus>;
  // tracePath: a gzipped trace.py TRACE_VERSION 1 trace (pose runs once per uri; a later call with
  // a plan adds the pixel stages to the same trace). stills: keyframe name -> local JPEG path.
  analyseOnDevice(uri: string, movement: string, plan?: AnalysePlan): Promise<AnalyseResult>;
}

// iOS only: null on Android, where the server keeps running pose.
export default requireOptionalNativeModule<PoseCoreMLModule>('PoseCoreML');
