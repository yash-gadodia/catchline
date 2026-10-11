import type { SourceInfo } from '../../../modules/clip-transcoder';
import type { Trim } from './trim';

// Supabase Free caps one upload at 50 MB; stay well under it.
export const UPLOAD_LIMIT_BYTES = 45 * 1024 * 1024;
export const MAX_EDGE = 1080;
export const MAX_FPS = 120;
// Below this a 1080 px lift clip smears the bar; ask for a shorter trim instead.
export const MIN_BITRATE = 4_000_000;
// MP4 overhead and encoder overshoot.
const HEADROOM = 0.92;

export type EncodePlan =
  | { kind: 'encode'; startS: number; endS: number; width: number; height: number; fps: number; dropToFps: boolean; bitrate: number }
  | { kind: 'too_long'; maxS: number };

// Long edge to MAX_EDGE (never upscaled), both sides even for the encoder.
export function outputSize(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const even = (v: number) => Math.max(2, Math.round((v * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

// 8 Mbps at 30 fps, 10 at 60, 12 at 120: a 10 s clip lands at 10-15 MB.
export function targetBitrate(fps: number): number {
  if (fps <= 31) return 8_000_000;
  if (fps <= 61) return 10_000_000;
  return 12_000_000;
}

// The highest bitrate whose output still fits the upload limit.
export function bitrateBudget(durationS: number, limitBytes = UPLOAD_LIMIT_BYTES): number {
  return Math.floor(((limitBytes * 8) / durationS) * HEADROOM);
}

export function maxDurationS(limitBytes = UPLOAD_LIMIT_BYTES): number {
  return Math.floor(((limitBytes * 8) / MIN_BITRATE) * HEADROOM);
}

export function planEncode(src: SourceInfo, trim: Trim): EncodePlan {
  const startS = Math.max(0, trim.start);
  const endS = Math.min(src.durationS > 0 ? src.durationS : trim.end, trim.end);
  const durationS = Math.max(endS - startS, 0.1);
  const fps = Math.min(src.fps > 0 ? src.fps : 30, MAX_FPS);
  const bitrate = Math.min(targetBitrate(fps), bitrateBudget(durationS));
  if (bitrate < MIN_BITRATE) return { kind: 'too_long', maxS: maxDurationS() };
  return { kind: 'encode', startS, endS, ...outputSize(src.width, src.height), fps, dropToFps: src.fps > MAX_FPS, bitrate };
}

// The encoder overshot the limit: once more at a bitrate scaled to fit, or give up.
export function retryPlan(plan: Extract<EncodePlan, { kind: 'encode' }>, sizeBytes: number): EncodePlan | null {
  if (sizeBytes <= UPLOAD_LIMIT_BYTES) return null;
  const bitrate = Math.floor(plan.bitrate * (UPLOAD_LIMIT_BYTES / sizeBytes) * HEADROOM);
  if (bitrate < MIN_BITRATE) return { kind: 'too_long', maxS: maxDurationS() };
  return { ...plan, bitrate };
}
