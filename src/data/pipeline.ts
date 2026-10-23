import { create } from 'zustand';
import type { Analysis, Failure, Movement } from '../analysis/types';
import type { ApiErrorCode } from '../lib/api';
import type { ClipSubmission } from '../features/capture/submit';
import { DEVICE_MOVEMENTS, startDeviceLift } from './devicePipeline';
import { onDeviceAnalysisEnabled } from './onDeviceAnalysis';

export type JobStatus = 'preparing' | 'uploading' | 'analysing' | 'queued' | 'processing' | 'done' | 'failed';
export type JobError = ApiErrorCode | 'clip_too_long' | 'analysis_failed' | 'cancelled' | 'models_unavailable';

export type Job = {
  id: string;
  movement: Movement;
  status: JobStatus;
  liftId: string | null;
  prepared: number;
  sent: number;
  total: number;
  uploadUrl: string | null;
  error: JobError | null;
  maxS: number | null;
  uri: string | null;
  retestCueId?: string;
  // On-device analysis (3.1): the native stage under way, its share of the whole run,
  // and the result once the phone has it (the server holds no analysis to fetch).
  device?: boolean;
  stage?: string | null;
  fraction?: number;
  result?: Analysis;
  failureReason?: Failure['reason'];
  failureDetail?: string;
};

type PipelineState = {
  job: Job | null;
  patch: (fields: Partial<Job>) => void;
  start: (job: Job) => void;
  clear: () => void;
};

// The one lift in flight from Review to the cue. Processing reads it to show
// the phone's progress and, once the phone has it, the result.
export const usePipeline = create<PipelineState>((set) => ({
  job: null,
  patch: (fields) => set((s) => (s.job ? { job: { ...s.job, ...fields } } : {})),
  start: (job) => set({ job }),
  clear: () => set({ job: null }),
}));

// 3.1 analyses only on the phone: the clip is never uploaded and no server analysis is
// started (the 3.0 upload path stays on the server for 3.0 binaries). A movement the
// phone cannot analyse yet (kipping HSPU: no TS replay of the rotated pass) fails as
// unsupported, counting nothing. Never throws: the outcome lands on the job.
export async function startLift(sub: ClipSubmission & { uri: string }): Promise<void> {
  if (onDeviceAnalysisEnabled() && DEVICE_MOVEMENTS.includes(sub.movement)) return startDeviceLift(sub);
  usePipeline.getState().start({
    id: `job-${Date.now()}`,
    movement: sub.movement,
    status: 'failed',
    liftId: null,
    prepared: 0,
    sent: 0,
    total: 0,
    uploadUrl: null,
    error: 'analysis_failed',
    maxS: null,
    uri: sub.uri,
    retestCueId: sub.retestCueId,
    device: true,
    failureReason: 'unsupported_movement',
  });
}
