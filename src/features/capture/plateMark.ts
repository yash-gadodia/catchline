import PoseCoreML from '../../../modules/pose-coreml';

// The lifter's own mark on the plate nearest the camera, made on the first frame of the trimmed clip: the centre as
// shares of the frame's width and height, the radius as a share of its height.
export type PlateMark = { x: number; y: number; r: number };

export type Rect = { x: number; y: number; width: number; height: number };

// Where a frame of this size sits when fitted whole inside a box (letterboxed, centred).
export function containRect(frame: { width: number; height: number }, box: { width: number; height: number }): Rect {
  const scale = Math.min(box.width / frame.width, box.height / frame.height);
  const width = frame.width * scale;
  const height = frame.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

// A press on the centre dragged to the edge, in box points, as a mark on the frame. Null when the press is off the
// picture or the circle is too small to be a plate.
export const MIN_R = 0.02;
export function markFrom(centre: { x: number; y: number }, edge: { x: number; y: number }, rect: Rect): PlateMark | null {
  const x = (centre.x - rect.x) / rect.width;
  const y = (centre.y - rect.y) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  const r = Math.hypot(edge.x - centre.x, edge.y - centre.y) / rect.height;
  if (r < MIN_R) return null;
  const round = (v: number) => Math.round(v * 10000) / 10000;
  return { x: round(x), y: round(y), r: round(Math.min(r, 1)) };
}

// The mark is only asked for where the tracker can start from it: a binary whose native module says so (the build
// after 41), and dev builds, where the step is worked on.
export function plateMarkSupported(): boolean {
  return __DEV__ || (PoseCoreML as { supportsPlateMark?: boolean } | null)?.supportsPlateMark === true;
}
