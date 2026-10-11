// Uploads a clip with the app's own TUS client (src/lib/api/tus.ts; Node >= 23.6
// strips the types). Usage: node catchline-e2e-upload.mjs <file> <objectName>
// env: API_URL, ANON_KEY, USER_JWT
import { openAsBlob } from 'node:fs';
import { tusUpload } from '../src/lib/api/tus.ts';

const [file, objectName] = process.argv.slice(2);
const blob = await openAsBlob(file);
let last = 0;
const t = Date.now();
const url = await tusUpload({
  endpoint: `${process.env.API_URL}/storage/v1/upload/resumable`,
  file: blob,
  headers: { authorization: `Bearer ${process.env.USER_JWT}`, apikey: process.env.ANON_KEY, 'x-upsert': 'false' },
  metadata: { bucketName: 'raw-clips', objectName, contentType: 'video/quicktime', cacheControl: '3600' },
  onProgress: (sent, total) => {
    const pct = Math.floor((sent / total) * 100);
    if (pct >= last + 25 || sent === total) {
      last = pct;
      console.log(`upload ${pct}% (${sent}/${total} bytes)`);
    }
  },
});
console.log(`upload done in ${((Date.now() - t) / 1000).toFixed(1)}s -> ${url}`);
