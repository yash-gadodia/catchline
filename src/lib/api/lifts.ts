import { supabase } from '../supabase';
import { parseAnalysis } from '../../analysis/parse';
import type { Analysis, Movement } from '../../analysis/types';
import type { Lift } from '../../types/db';
import { ApiError, toApiError } from './errors';
import { tusUpload } from './tus';

export const RAW_BUCKET = 'raw-clips';
export const KEYFRAME_BUCKET = 'keyframes';
const SIGNED_URL_SECONDS = 60 * 60;

export type UploadOptions = {
  contentType?: 'video/quicktime' | 'video/mp4';
  uploadUrl?: string;
  onUploadUrl?: (url: string) => void;
  onProgress?: (sent: number, total: number) => void;
};

export type CreateLiftInput = UploadOptions & {
  movement: Movement;
  loadKg?: number;
  file: Blob;
};

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('not_authenticated');
  return token;
}

/** Resumable upload of a lift's raw clip to its reserved path. Pass the saved `uploadUrl` to resume. */
export async function uploadLiftClip(lift: Pick<Lift, 'clip_path'>, file: Blob, opts: UploadOptions = {}): Promise<string> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  try {
    return await tusUpload({
      endpoint: `${url}/storage/v1/upload/resumable`,
      file,
      headers: { authorization: `Bearer ${await accessToken()}`, apikey: anonKey, 'x-upsert': 'false' },
      metadata: {
        bucketName: RAW_BUCKET,
        objectName: lift.clip_path,
        contentType: opts.contentType ?? 'video/quicktime',
        cacheControl: '3600',
      },
      uploadUrl: opts.uploadUrl,
      onUploadUrl: opts.onUploadUrl,
      onProgress: opts.onProgress,
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('upload_failed', e instanceof Error ? e.message : String(e));
  }
}

export async function enqueueLift(liftId: string): Promise<Lift> {
  const { data, error } = await supabase.rpc('enqueue_lift', { p_lift_id: liftId });
  if (error) throw toApiError(error);
  return data as Lift;
}

/** Reserve a lift (consent + cap checked server-side), upload the clip, queue it for analysis. */
export async function createLift(input: CreateLiftInput): Promise<Lift> {
  const { data, error } = await supabase.rpc('create_lift', {
    p_movement: input.movement,
    p_load_kg: input.loadKg,
  });
  if (error) throw toApiError(error);
  const lift = data as Lift;
  await uploadLiftClip(lift, input.file, input);
  return enqueueLift(lift.id);
}

export async function getLift(liftId: string): Promise<Lift | null> {
  const { data, error } = await supabase.from('lifts').select('*').eq('id', liftId).maybeSingle();
  if (error) throw toApiError(error);
  return data;
}

export async function listLifts(opts: { limit?: number; before?: string } = {}): Promise<Lift[]> {
  let q = supabase.from('lifts').select('*').order('created_at', { ascending: false }).limit(opts.limit ?? 50);
  if (opts.before) q = q.lt('created_at', opts.before);
  const { data, error } = await q;
  if (error) throw toApiError(error);
  return data ?? [];
}

/**
 * The lift's Analysis, with each keyframe's storage path swapped for a signed URL
 * the app can load. Null until the worker has written one.
 */
export async function getAnalysis(liftId: string): Promise<Analysis | null> {
  const { data, error } = await supabase.from('analyses').select('analysis').eq('lift_id', liftId).maybeSingle();
  if (error) throw toApiError(error);
  if (!data) return null;
  const analysis = parseAnalysis(data.analysis);
  const paths = analysis.reps.flatMap((r) => r.keyFrames.map((k) => k.image)).filter((p): p is string => !!p);
  if (paths.length === 0) return analysis;
  const signed = await supabase.storage.from(KEYFRAME_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (signed.error) throw toApiError(signed.error);
  const byPath = new Map<string, string>();
  for (const s of signed.data) if (s.path && s.signedUrl) byPath.set(s.path, s.signedUrl);
  return {
    ...analysis,
    reps: analysis.reps.map((r) => ({
      ...r,
      keyFrames: r.keyFrames.map((k) => ({ ...k, image: (k.image && byPath.get(k.image)) || k.image })),
    })),
  };
}

export type LiftListener = {
  onLift?: (lift: Lift) => void;
  onAnalysis?: (analysis: Analysis | null, lift: Lift) => void;
  onError?: (error: Error) => void;
};

/**
 * Realtime status for one lift. Emits the current row once subscribed (so a result
 * that landed before the subscription is not missed), then every update; when the
 * lift finishes it fetches the analysis. Returns the unsubscribe function.
 */
export function subscribeToLift(liftId: string, listener: LiftListener): () => void {
  let finished = false;
  const handle = (lift: Lift) => {
    listener.onLift?.(lift);
    if (finished || (lift.status !== 'done' && lift.status !== 'failed')) return;
    finished = true;
    getAnalysis(liftId)
      .then((a) => listener.onAnalysis?.(a, lift))
      .catch((e: Error) => listener.onError?.(e));
  };
  const channel = supabase
    .channel(`lift:${liftId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'lifts', filter: `id=eq.${liftId}` },
      (payload) => handle(payload.new as Lift)
    )
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      getLift(liftId)
        .then((lift) => lift && handle(lift))
        .catch((e: Error) => listener.onError?.(e));
    });
  return () => {
    supabase.removeChannel(channel);
  };
}
