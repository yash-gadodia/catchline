// Minimal TUS 1.0 client for Supabase Storage resumable uploads
// (https://supabase.com/docs/guides/storage/uploads/resumable-uploads).
// No imports on purpose: the app uses it with RN's fetch/Blob, and
// scripts/catchline-e2e runs this same file under Node.

export const TUS_CHUNK_BYTES = 6 * 1024 * 1024; // Supabase requires exactly 6 MB chunks

// A Blob, or anything that can hand out byte ranges (React Native's Blob cannot be
// built from bytes, so the app reads chunks from disk instead).
export type UploadSource = { size: number; slice(start: number, end: number): Blob | Uint8Array<ArrayBuffer> };

export type TusOptions = {
  endpoint: string;
  file: UploadSource;
  headers: Record<string, string>;
  metadata: Record<string, string>;
  uploadUrl?: string;
  chunkSize?: number;
  retryDelaysMs?: number[];
  onUploadUrl?: (url: string) => void;
  onProgress?: (sent: number, total: number) => void;
  fetchImpl?: typeof fetch;
  // Chunks go over XMLHttpRequest when one exists (React Native), because fetch
  // only reports a chunk once it is fully sent: a 12 MB clip would sit at 0% for
  // the whole first 6 MB. Node (the e2e script) has no XHR and uses fetch.
  xhrImpl?: new () => XMLHttpRequest;
  sleep?: (ms: number) => Promise<void>;
};

type Reply = { status: number; header: (k: string) => string | null; text: () => Promise<string> };

export class TusError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'TusError';
    this.status = status;
  }
}

function encodeMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([k, v]) => `${k} ${btoa(v)}`)
    .join(',');
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function patchXhr(
  Xhr: new () => XMLHttpRequest,
  url: string,
  headers: Record<string, string>,
  body: Blob | Uint8Array<ArrayBuffer>,
  onSent: (bytes: number) => void
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const xhr = new Xhr();
    xhr.open('PATCH', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onSent(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, header: (k) => xhr.getResponseHeader(k), text: async () => xhr.responseText });
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(body);
  });
}

export async function tusUpload(o: TusOptions): Promise<string> {
  const doFetch = o.fetchImpl ?? fetch;
  const sleep = o.sleep ?? wait;
  const chunk = o.chunkSize ?? TUS_CHUNK_BYTES;
  const delays = o.retryDelaysMs ?? [1000, 3000, 5000];
  const total = o.file.size;
  const base = { ...o.headers, 'Tus-Resumable': '1.0.0' };

  let url = o.uploadUrl;
  let offset = 0;

  if (url) {
    const head = await doFetch(url, { method: 'HEAD', headers: base });
    if (head.ok) {
      offset = Number(head.headers.get('Upload-Offset') ?? 0);
    } else if (head.status === 404 || head.status === 410) {
      url = undefined;
    } else {
      throw new TusError(`resume failed: ${head.status}`, head.status);
    }
  }

  if (!url) {
    const created = await doFetch(o.endpoint, {
      method: 'POST',
      headers: {
        ...base,
        'Upload-Length': String(total),
        'Upload-Metadata': encodeMetadata(o.metadata),
      },
    });
    const location = created.headers.get('Location');
    if (created.status !== 201 || !location) {
      throw new TusError(`create failed: ${created.status} ${await created.text()}`, created.status);
    }
    url = new URL(location, o.endpoint).toString();
    o.onUploadUrl?.(url);
  }

  const Xhr = o.xhrImpl ?? (o.fetchImpl || typeof XMLHttpRequest === 'undefined' ? undefined : XMLHttpRequest);
  let reported = -1;
  const report = (sent: number) => {
    if (sent <= reported) return;
    reported = sent;
    o.onProgress?.(sent, total);
  };

  let failures = 0;
  while (offset < total) {
    const end = Math.min(offset + chunk, total);
    const body = o.file.slice(offset, end);
    const headers = { ...base, 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' };
    const from = offset;
    let res: Reply | null = null;
    try {
      if (Xhr) {
        res = await patchXhr(Xhr, url, headers, body, (sent) => report(Math.min(from + sent, end)));
      } else {
        const r = await doFetch(url, { method: 'PATCH', headers, body });
        res = { status: r.status, header: (k) => r.headers.get(k), text: () => r.text() };
      }
    } catch {
      res = null;
    }
    if (res && res.status === 204) {
      offset = Number(res.header('Upload-Offset'));
      failures = 0;
      report(offset);
      continue;
    }
    const status = res?.status ?? 0;
    if (res && status >= 400 && status < 500 && status !== 409 && status !== 423) {
      throw new TusError(`upload failed: ${status} ${await res.text()}`, status);
    }
    if (failures >= delays.length) {
      throw new TusError(`upload failed after ${failures} retries (last status ${status})`, status);
    }
    await sleep(delays[failures]);
    failures += 1;
    const head = await doFetch(url, { method: 'HEAD', headers: base });
    if (head.ok) offset = Number(head.headers.get('Upload-Offset') ?? offset);
  }
  return url;
}
