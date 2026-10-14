import { create } from 'zustand';
import type { Movement } from '../analysis/types';
import { File } from 'expo-file-system';
import { ApiError, createLift, syncPlan, type ApiErrorCode, type CreateLiftInput, type UploadSource } from '../lib/api';
import type { Lift } from '../types/db';
import type { ClipSubmission } from '../features/capture/submit';
import { usePurchases } from '../features/purchases/usePurchases';
import { syncConsent } from './backend';
import { ClipTooLongError, discardPrepared, prepareClip } from './prepare';

export type JobStatus = 'preparing' | 'uploading' | 'queued' | 'processing' | 'done' | 'failed';
export type JobError = ApiErrorCode | 'clip_too_long';

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

// The first processing step: "Preparing your clip" while it is trimmed and
// re-encoded on the phone, then "Uploading your clip" with the bytes sent.
export function uploadStep(job: Job | null): { label: string; meta: string | null } {
  if (job?.status === 'preparing') return { label: 'Preparing your clip', meta: `preparing ${Math.round(job.prepared * 100)}%` };
  const meta = job?.status === 'uploading' && job.total > 0 ? `uploading ${Math.round((job.sent / job.total) * 100)}%` : null;
  return { label: 'Uploading your clip', meta };
}

// A paid lifter the server still thinks is free (a missed webhook) is capped
// by create_lift: pull the plan from RevenueCat and try once more before the
// cap paywall. The cap check runs before the upload, so the retry is cheap.
async function createLiftSynced(input: CreateLiftInput): Promise<Lift> {
  try {
    return await createLift(input);
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== 'cap_reached' || usePurchases.getState().tier === 'free') throw e;
    await syncPlan().catch(() => undefined);
    return createLift(input);
  }
}

// Consent, then the trimmed H.264 copy (1080 px long edge) (Supabase Free caps uploads at
// 50 MB), then create_lift (cap checked server-side) + resumable upload +
// enqueue. Never throws: the outcome lands on the job. The trim is baked into the
// uploaded clip; the chosen rep is not sent (create_lift takes movement + load only).
export async function startLift(sub: ClipSubmission & { uri: string }, read: (uri: string) => Promise<UploadSource> = readClip): Promise<void> {
  const { start, patch } = usePipeline.getState();
  start({
    id: `job-${Date.now()}`,
    movement: sub.movement,
    status: 'preparing',
    liftId: null,
    prepared: 0,
    sent: 0,
    total: 0,
    uploadUrl: null,
    error: null,
    maxS: null,
  });
  let prepared: string | null = null;
  try {
    await syncConsent();
    const clip = await prepareClip(sub.uri, sub.trim, (p) => patch({ prepared: p }));
    prepared = clip.uri;
    const file = await read(clip.uri);
    patch({ status: 'uploading', prepared: 1, total: file.size });
    const lift = await createLiftSynced({
      movement: sub.movement,
      loadKg: sub.loadKg ?? undefined,
      file,
      contentType: 'video/mp4',
      onUploadUrl: (uploadUrl) => patch({ uploadUrl }),
      onProgress: (sent, total) => patch({ sent, total }),
    });
    patch({ liftId: lift.id, status: lift.status as JobStatus });
  } catch (e) {
    if (e instanceof ClipTooLongError) patch({ status: 'failed', error: 'clip_too_long', maxS: e.maxS });
    else patch({ status: 'failed', error: e instanceof ApiError ? e.code : 'upload_failed' });
  } finally {
    if (prepared) discardPrepared(prepared);
  }
}
