import { tusUpload, TusError } from './tus';

type Call = { url: string; method: string; headers: Record<string, string>; size?: number };

type Reply = { status: number; headers?: Record<string, string> };

function fakeServer(script: (call: Call, n: number) => Reply) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      size: init.body instanceof Blob ? init.body.size : undefined,
    };
    calls.push(call);
    const r = script(call, calls.length);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (k: string) => r.headers?.[k] ?? null },
      text: async () => 'body',
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const file = new Blob([new Uint8Array(25)]);
const base = {
  endpoint: 'http://localhost:55421/storage/v1/upload/resumable',
  file,
  headers: { authorization: 'Bearer user-jwt' },
  metadata: { bucketName: 'raw-clips', objectName: 'u1/l1' },
  chunkSize: 10,
  sleep: async () => {},
};

describe('tusUpload', () => {
  it('creates the upload then PATCHes 10+10+5 byte chunks, reporting progress', async () => {
    let offset = 0;
    const { calls, fetchImpl } = fakeServer((c): Reply => {
      if (c.method === 'POST') return { status: 201, headers: { Location: '/storage/v1/upload/resumable/abc' } };
      offset += c.size ?? 0;
      return { status: 204, headers: { 'Upload-Offset': String(offset) } };
    });
    const progress: number[] = [];
    const urls: string[] = [];
    const url = await tusUpload({
      ...base,
      fetchImpl,
      onProgress: (s) => progress.push(s),
      onUploadUrl: (u) => urls.push(u),
    });

    expect(url).toBe('http://localhost:55421/storage/v1/upload/resumable/abc');
    expect(urls).toEqual([url]);
    expect(progress).toEqual([10, 20, 25]);
    expect(calls.map((c) => `${c.method}:${c.size ?? '-'}`)).toEqual(['POST:-', 'PATCH:10', 'PATCH:10', 'PATCH:5']);
    expect(calls[0].headers['Upload-Length']).toBe('25');
    expect(calls[0].headers['Upload-Metadata']).toBe(`bucketName ${btoa('raw-clips')},objectName ${btoa('u1/l1')}`);
    expect(calls[0].headers['Tus-Resumable']).toBe('1.0.0');
    expect(calls[0].headers.authorization).toBe('Bearer user-jwt');
    expect(calls[2].headers['Upload-Offset']).toBe('10');
  });

  it('resumes from the server offset when given a saved upload URL', async () => {
    const { calls, fetchImpl } = fakeServer((c): Reply => {
      if (c.method === 'HEAD') return { status: 200, headers: { 'Upload-Offset': '20' } };
      return { status: 204, headers: { 'Upload-Offset': '25' } };
    });
    await tusUpload({ ...base, fetchImpl, uploadUrl: 'http://x/up/abc' });
    expect(calls.map((c) => `${c.method}:${c.size ?? '-'}`)).toEqual(['HEAD:-', 'PATCH:5']);
    expect(calls[1].headers['Upload-Offset']).toBe('20');
  });

  it('retries a failed chunk after asking the server for its offset', async () => {
    let offset = 0;
    let failed = false;
    const { calls, fetchImpl } = fakeServer((c): Reply => {
      if (c.method === 'POST') return { status: 201, headers: { Location: 'http://x/up/1' } };
      if (c.method === 'HEAD') return { status: 200, headers: { 'Upload-Offset': String(offset) } };
      if (offset === 10 && !failed) {
        failed = true;
        return { status: 503 };
      }
      offset += c.size ?? 0;
      return { status: 204, headers: { 'Upload-Offset': String(offset) } };
    });
    await tusUpload({ ...base, fetchImpl });
    expect(calls.map((c) => c.method)).toEqual(['POST', 'PATCH', 'PATCH', 'HEAD', 'PATCH', 'PATCH']);
  });

  it('gives up on a 4xx such as an RLS rejection', async () => {
    const { fetchImpl } = fakeServer(() => ({ status: 403 }));
    await expect(tusUpload({ ...base, fetchImpl })).rejects.toEqual(new TusError('create failed: 403 body', 403));
  });
});
