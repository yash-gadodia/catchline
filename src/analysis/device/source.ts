// What the on-device measurement needs from the clip besides the lifter's keypoints. On the server these come from the
// video (track.py: KLT stabilisation, the colour-threshold plate finder and tracker); a lift trace records exactly
// these values, so the same interface replays a trace (traceSource.ts). On the phone the camera motion and the plate
// detector fill it.
import { Affine, Pt } from './num';

// One plate seen on one frame, inference px (frames scaled to 1280 tall, as pose runs). axes = [vertical, horizontal]
// full lengths. A plate whose outline was fitted (refine_plate held: the ellipse explains its own edge) carries
// fitInliers, the share of outline points on the fitted ellipse; a plate only the coarse disc search found has none,
// and its axes ratio is a search-grid step, never read as a camera angle.
export type PlateObservation = {
  centre: Pt;
  axes: [number, number];
  score: number;
  // 'a' / 'b': beyond the first / second wrist on the wrist line (both plates visible); 'near': side-on, the one big
  // disc around the hands
  side: 'a' | 'b' | 'near';
  fitInliers?: number;
};

export type PlateTrack = {
  // per window frame, the near plate's centre (inference px, the frame's own pixels, not stabilised); NaN before the
  // seed frame and from the frame the plate is lost
  centres: Pt[];
  scores: number[];
};

export type PlateFollow = {
  centres: Pt[];
  src: number[];
  fit: [number, number, number, number][];
};

export interface FrameSource {
  // Frames [start, start + count) of the clip (fewer when the clip ends sooner): per frame the 2x3 affine mapping its
  // inference px to the window's first frame (background motion, people masked), and the RANSAC inlier count of each
  // frame-to-frame step. Ms.length is the number of frames the window holds.
  window(start: number, count: number): { Ms: Affine[]; inliers: number[] };
  // The plates on this clip frame, sorted near (largest) first, each refined where its outline holds. The wrists
  // (inference px, raw, not stabilised) and the lifter's box heights say where and how big to look: a plate sits on
  // the wrist line beyond either hand, or side-on around both hands; bodyH is the lifter's median box height over the
  // rep window, setupH over the second before lift-off.
  plates(frame: number, wristA: Pt, wristB: Pt, bodyH: number, setupH: number): PlateObservation[];
  // Whether this clip frame was really searched for plates (absent: always). A replay that has not asked the phone yet
  // answers plates() from the nearest frame it has, so an empty answer there does not mean there is no plate.
  platesSearched?(frame: number): boolean;
  // Follow the near plate through a window from its seed frame (window index) to stop (window index, exclusive; null =
  // the window's end). Returns one entry per window frame.
  trackPlate(windowStart: number, windowLength: number, seed: number, plate: PlateObservation, stop: number | null): PlateTrack;
  followPlate?(windowStart: number, windowLength: number, seed: number, wrists: Pt[], hands: [Pt, Pt], bodyH: number, setupH: number): PlateFollow;
}

export type Lifter = {
  // per clip frame, 26 Halpe keypoints (inference px; head points NaN), their scores, and the lifter's box [x1 y1 x2 y2]
  k: Pt[][];
  scores: number[][];
  boxes: number[][];
};

export type DeviceInput = {
  meta: { width: number; height: number; fps: number; frameCount: number | null };
  // inference frame size [H, W] (1280 tall)
  shape: [number, number];
  lifter: Lifter;
  // whole-clip camera motion: per frame the affine mapping inference px to frame 0
  cameraPath: Affine[];
  source: FrameSource;
};
