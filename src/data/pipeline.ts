import { create } from 'zustand';
import type { Movement } from '../analysis/types';
import { File } from 'expo-file-system';
import { ApiError, createLift, type ApiErrorCode, type UploadSource } from '../lib/api';
import type { ClipSubmission } from '../features/capture/submit';
import { syncConsent } from './backend';

export type JobStatus = 'uploading' | 'queued' | 'processing' | 'done' | 'failed';

export type Job = {
  id: string;
  movement: Movement;
  status: JobStatus;
  liftId: string | null;
  sent: number;
  total: number;
  uploadUrl: string | null;
  error: ApiErrorCode | null;
};

type PipelineState = {
  job: Job | null;
  patch: (fields: Partial<Job>) => void;
  start: (job: Job) => void;
  clear: () => void;
};

// The one lift in flight from Review to the cue. Processing reads it to show
// upload progress and, once the lift exists, subscribes to its row.
export const usePipeline = create<PipelineState>((set) => ({
  job: null,
  patch: (fields) => set((s) => (s.job ? { job: { ...s.job, ...fields } } : {})),
  start: (job) => set({ job }),
  clear: () => set({ job: null }),
}));

// The clip is read from disk one chunk at a time as the upload asks for it, so a
// 100 MB slo-mo never sits in memory whole.
export async function readClip(uri: string): Promise<UploadSource> {
  const file = new File(uri);
  const size = file.size;
  return {
    size,
    slice(start, end) {
      const handle = file.open();
      try {
        handle.offset = start;
        return handle.readBytes(end - start);
      } finally {
        handle.close();
      }
    },
  };
}

export function contentTypeFor(uri: string): 'video/quicktime' | 'video/mp4' {
  return /\.mp4($|\?)/i.test(uri) ? 'video/mp4' : 'video/quicktime';
}

// Consent, then create_lift (cap checked server-side) + resumable upload +
// enqueue. Never throws: the outcome lands on the job.
export async function startLift(sub: ClipSubmission & { uri: string }, read: (uri: string) => Promise<UploadSource> = readClip): Promise<void> {
  const { start, patch } = usePipeline.getState();
  start({
    id: `job-${Date.now()}`,
    movement: sub.movement,
    status: 'uploading',
    liftId: null,
    sent: 0,
    total: 0,
    uploadUrl: null,
    error: null,
  });
  try {
    await syncConsent();
    const file = await read(sub.uri);
    patch({ total: file.size });
    const lift = await createLift({
      movement: sub.movement,
      loadKg: sub.loadKg ?? undefined,
      file,
      contentType: contentTypeFor(sub.uri),
      onUploadUrl: (uploadUrl) => patch({ uploadUrl }),
      onProgress: (sent, total) => patch({ sent, total }),
    });
    patch({ liftId: lift.id, status: lift.status as JobStatus });
  } catch (e) {
    patch({ status: 'failed', error: e instanceof ApiError ? e.code : 'upload_failed' });
  }
}
