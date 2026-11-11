import { File } from 'expo-file-system';
import { liftDir } from '../../data/localLifts';
import type { PlateMark } from '../capture/plateMark';

// Kept with the lift on the phone (Documents/lifts/<id>/plate.json), whether or not anything is ever sent: the
// lifter's mark before tracking (null when skipped) and every correction they drew on the result.
export type Correction = { frame: number; mark: PlateMark; at: string };
export type LocalPlate = { mark: PlateMark | null; corrections: Correction[] };

const PLATE_FILE = 'plate.json';

function file(liftId: string): File {
  return new File(liftDir(liftId), PLATE_FILE);
}

export async function readLocalPlate(liftId: string): Promise<LocalPlate | null> {
  const f = file(liftId);
  if (!f.exists) return null;
  const v = JSON.parse(await f.text()) as Partial<LocalPlate>;
  return { mark: v.mark ?? null, corrections: Array.isArray(v.corrections) ? v.corrections : [] };
}

function write(liftId: string, plate: LocalPlate): void {
  liftDir(liftId).create({ intermediates: true, idempotent: true });
  const f = file(liftId);
  f.create({ overwrite: true });
  f.write(JSON.stringify(plate));
}

export function saveLocalMark(liftId: string, mark: PlateMark | null): void {
  write(liftId, { mark, corrections: [] });
}

// One correction per frame: drawing again on the same frame replaces the earlier one.
export async function addLocalCorrection(liftId: string, frame: number, mark: PlateMark, now = new Date()): Promise<LocalPlate> {
  const plate = (await readLocalPlate(liftId)) ?? { mark: null, corrections: [] };
  const next = { ...plate, corrections: [...plate.corrections.filter((c) => c.frame !== frame), { frame, mark, at: now.toISOString() }] };
  write(liftId, next);
  return next;
}
