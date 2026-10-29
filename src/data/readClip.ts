import { File } from 'expo-file-system';
import type { UploadSource } from '../lib/api';

// A file on disk read one chunk at a time as the upload asks for it, so a long clip
// never sits in memory whole.
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
