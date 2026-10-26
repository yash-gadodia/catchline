import { ApiError } from './errors';
import { ensureSession } from './account';
import { tusUpload, type UploadSource } from './tus';
import { supabase } from '../supabase';

export const SHARED_BUCKET = 'shared-clips';

// The failed lift's trimmed clip, sent only when the lifter asks (the failure screen),
// into their own folder of a private bucket nobody but us reads. Resumable like the
// old raw-clip upload.
export async function uploadSharedClip(liftId: string, file: UploadSource, onProgress?: (sent: number, total: number) => void): Promise<void> {
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
      headers: { authorization: `Bearer ${token}`, apikey: anonKey, 'x-upsert': 'true' },
      metadata: { bucketName: SHARED_BUCKET, objectName: `${userId}/${liftId}.mp4`, contentType: 'video/mp4', cacheControl: '3600' },
      onProgress,
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('upload_failed', e instanceof Error ? e.message : String(e));
  }
}
