import { ApiError, toApiError } from './errors';
import { ensureSession } from './account';
import { TusError, tusUpload, type UploadSource } from './tus';
import { supabase } from '../supabase';

export const PLATE_FRAMES_BUCKET = 'plate-frames';

// One crop around the plate with where the plate is in it (record_plate_frame, 0024). The server reads the owner,
// the consent and the object itself; nothing here is trusted.
export type PlateFrameRecord = {
  kind: 'mark' | 'correction' | 'track';
  lift_id: string;
  frame: number;
  x: number;
  y: number;
  r: number | null;
  confidence: number | null;
  crop_px: number;
  crop_left: number;
  crop_top: number;
  crop_side: number;
  clip_fps: number;
  clip_width: number;
  clip_height: number;
  mark_skipped: boolean;
  app_version: string;
  update_id: string;
  model_version: string;
};

// The crop goes into the lifter's own folder of a private bucket nobody but us reads; the server refuses it
// unless their 'plate_frames' consent is granted. A crop already there counts as sent.
export async function uploadPlateFrame(id: string, file: UploadSource): Promise<void> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const userId = await ensureSession();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('not_authenticated');
  try {
    await tusUpload({
      endpoint: `${url}/storage/v1/upload/resumable`,
      file,
      headers: { authorization: `Bearer ${token}`, apikey: anonKey, 'x-upsert': 'false' },
      metadata: { bucketName: PLATE_FRAMES_BUCKET, objectName: `${userId}/${id}.jpg`, contentType: 'image/jpeg', cacheControl: '3600' },
    });
  } catch (e) {
    if (e instanceof TusError && e.status === 409) return;
    if (e instanceof TusError && (e.status === 403 || e.status === 400)) throw new ApiError('consent_required', e.message);
    if (e instanceof ApiError) throw e;
    throw new ApiError('upload_failed', e instanceof Error ? e.message : String(e));
  }
}

export async function recordPlateFrame(id: string, frame: PlateFrameRecord): Promise<void> {
  const { error } = await supabase.rpc('record_plate_frame', { p_id: id, p_frame: frame });
  if (error) throw toApiError(error);
}

// "Delete what I sent": every crop and its record, on the server. Returns how many went.
export async function deleteMyPlateFrames(): Promise<number> {
  await ensureSession();
  const { data, error } = await supabase.rpc('delete_my_plate_frames');
  if (error) throw toApiError(error);
  return typeof data === 'number' ? data : 0;
}
