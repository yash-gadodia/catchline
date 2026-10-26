import { File } from 'expo-file-system';
import { uploadSharedClip, type UploadSource } from '../lib/api';
import { localClipUri } from './localLifts';
import { queueProblemReport } from './problemReports';

// The clip is read from disk one chunk at a time as the upload asks for it, so a
// long clip never sits in memory whole.
export function readClip(uri: string): UploadSource {
  const file = new File(uri);
  return {
    size: file.size,
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

// "Send this clip so we can fix it": the kept clip goes up, then a problem report
// names the lift so the clip can be found. Throws when offline or not kept.
export async function shareFailedClip(liftId: string, failureCode: string | null, onProgress: (fraction: number) => void): Promise<void> {
  const uri = localClipUri(liftId);
  if (!uri) throw new Error('no_clip');
  await uploadSharedClip(liftId, readClip(uri), (sent, total) => onProgress(total > 0 ? sent / total : 0));
  await queueProblemReport({ body: 'Shared the clip of a failed lift.', liftId, context: `shared_clip ${failureCode ?? 'unknown'}` });
}
