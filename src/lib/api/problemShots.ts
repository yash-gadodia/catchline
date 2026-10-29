import { ApiError } from './errors';
import { ensureSession } from './account';
import { tusUpload, type UploadSource } from './tus';
import { supabase } from '../supabase';

export const SHOTS_BUCKET = 'problem-shots';

// The screenshot a problem report was started from, into the lifter's own folder of a
// private bucket nobody but us reads, named by the report it belongs to.
export async function uploadProblemShot(reportId: string, file: UploadSource): Promise<void> {
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
      metadata: { bucketName: SHOTS_BUCKET, objectName: `${userId}/${reportId}.jpg`, contentType: 'image/jpeg', cacheControl: '3600' },
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('upload_failed', e instanceof Error ? e.message : String(e));
  }
}
