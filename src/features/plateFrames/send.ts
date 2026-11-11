import { randomUUID } from 'expo-crypto';
import ClipTranscoder from '../../../modules/clip-transcoder';
import { localClipUri, readLocalAnalysis } from '../../data/localLifts';
import { reportDetails } from '../../data/problemReports';
import type { Analysis } from '../../analysis/types';
import type { PlateFrameRecord } from '../../lib/api';
import type { PlateMark } from '../capture/plateMark';
import { plateFramesGranted } from './consent';
import { correctionFrame, liftFrames, type PlateFrame } from './crops';
import { readLocalPlate } from './local';
import { queuePlateFrames, type QueuedFrame } from './outbox';

export function toRecord(f: PlateFrame, analysis: Pick<Analysis, 'video' | 'analysisVersion'>, markSkipped: boolean): PlateFrameRecord {
  const { appVersion, updateId } = reportDetails();
  return {
    kind: f.kind,
    lift_id: f.liftId,
    frame: f.frame,
    x: f.label.x,
    y: f.label.y,
    r: f.label.r,
    confidence: f.confidence,
    crop_px: f.crop.px,
    crop_left: f.crop.left,
    crop_top: f.crop.top,
    crop_side: f.crop.side,
    clip_fps: analysis.video.fps,
    clip_width: analysis.video.width,
    clip_height: analysis.video.height,
    mark_skipped: markSkipped,
    app_version: appVersion,
    update_id: updateId,
    model_version: analysis.analysisVersion ?? 'unknown',
  };
}

// Cuts the crops out of the lift's kept clip on the phone and queues them. A frame the native side could not cut
// (past the clip's end) is left out; nothing but the crops ever leaves the clip.
async function cutAndQueue(liftId: string, frames: PlateFrame[], analysis: Analysis, markSkipped: boolean): Promise<number> {
  const clip = localClipUri(liftId);
  if (!clip || frames.length === 0 || !ClipTranscoder.cropFrames) return 0;
  const cut = await ClipTranscoder.cropFrames(
    clip,
    JSON.stringify(frames.map((f) => ({ id: f.id, frame: f.frame, left: f.crop.left, top: f.crop.top, side: f.crop.side, px: f.crop.px })))
  );
  const queued: QueuedFrame[] = [];
  for (const f of frames) {
    const file = cut.find((c) => c.id === f.id);
    if (file) queued.push({ id: f.id, file: file.uri, record: toRecord(f, analysis, markSkipped) });
  }
  await queuePlateFrames(queued);
  return queued.length;
}

// After a lift is tracked (and when the lifter says yes on their first result): the marked frame and up to four
// tracked ones. Does nothing, and cuts nothing, without the consent. Never throws: a lift is never held up by this.
export async function sendLiftFrames(liftId: string): Promise<number> {
  try {
    if (!plateFramesGranted()) return 0;
    const analysis = await readLocalAnalysis(liftId);
    if (!analysis) return 0;
    const mark = (await readLocalPlate(liftId))?.mark ?? null;
    return await cutAndQueue(liftId, liftFrames({ liftId, mark, analysis, newId: randomUUID }), analysis, mark === null);
  } catch {
    return 0;
  }
}

// A correction the lifter drew on a result: kept on the phone either way (local.ts), sent as a strong label only with the consent.
export async function sendCorrection(liftId: string, frame: number, mark: PlateMark): Promise<number> {
  try {
    if (!plateFramesGranted()) return 0;
    const analysis = await readLocalAnalysis(liftId);
    if (!analysis) return 0;
    const skipped = ((await readLocalPlate(liftId))?.mark ?? null) === null;
    const size = { width: analysis.video.width, height: analysis.video.height };
    return await cutAndQueue(liftId, [correctionFrame({ liftId, frame, mark, size, newId: randomUUID })], analysis, skipped);
  } catch {
    return 0;
  }
}
