import PoseCoreML from '../../../modules/pose-coreml';
import { MIN_R, type PlateMark } from './plateMark';

// Whether this binary can look for the plate on one frame before the clip is tracked (iOS, the build after 47).
export function findPlateSupported(): boolean {
  return PoseCoreML?.supportsFindPlate === true && typeof PoseCoreML.findPlate === 'function';
}

// The lifter's plate on the frame at atSeconds of the clip, for the lifter to confirm or adjust. Null when none is
// found, on a binary without it, and when the native call fails: the lifter then marks the plate by hand.
export async function findPlate(uri: string, atSeconds: number): Promise<PlateMark | null> {
  if (!findPlateSupported() || !PoseCoreML?.findPlate) return null;
  try {
    const found = await PoseCoreML.findPlate(uri, atSeconds);
    if (!found || ![found.x, found.y, found.r].every(Number.isFinite) || found.r < MIN_R) return null;
    const round = (v: number) => Math.round(v * 10000) / 10000;
    return { x: round(found.x), y: round(found.y), r: round(found.r) };
  } catch {
    return null;
  }
}
