import { File } from 'expo-file-system';
import Transcoder, { type TranscodeResult } from '../../modules/clip-transcoder';
import { maxDurationS, planEncode, retryPlan } from '../features/capture/compress';
import type { Trim } from '../features/capture/trim';

export class ClipTooLongError extends Error {
  maxS: number;
  constructor(maxS: number) {
    super('clip_too_long');
    this.name = 'ClipTooLongError';
    this.maxS = maxS;
  }
}

export function discardPrepared(uri: string): void {
  const f = new File(uri);
  if (f.exists) f.delete();
}

// The trimmed H.264 copy (1080 px long edge) that goes up. The original is never touched.
export async function prepareClip(uri: string, trim: Trim, onProgress: (p: number) => void): Promise<TranscodeResult> {
  const src = await Transcoder.probe(uri);
  let plan = planEncode(src, trim);
  const sub = Transcoder.addListener('onProgress', (e) => onProgress(e.progress));
  try {
    for (let attempt = 0; ; attempt++) {
      if (plan.kind === 'too_long') throw new ClipTooLongError(plan.maxS);
      const { startS, endS, width, height, fps, dropToFps, bitrate } = plan;
      const out = await Transcoder.transcode({ uri, startS, endS, width, height, fps, dropToFps, bitrate });
      const retry = retryPlan(plan, out.size);
      if (!retry) return out;
      discardPrepared(out.uri);
      plan = attempt === 0 ? retry : { kind: 'too_long', maxS: maxDurationS() };
    }
  } finally {
    sub.remove();
  }
}
