import { uploadProblemShot } from './problemShots';
import { uploadSharedClip } from './sharedClips';
import { tusUpload, TusError } from './tus';

jest.mock('./tus', () => ({ ...jest.requireActual('./tus'), tusUpload: jest.fn(async () => 'http://up/1') }));
jest.mock('./account', () => ({ ensureSession: jest.fn(async () => 'u1') }));
jest.mock('../supabase', () => ({
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'jwt' } } })) } },
}));

const upload = tusUpload as jest.Mock;

beforeEach(() => upload.mockClear());

describe.each([
  ['shared clip', () => uploadSharedClip('l1', new Blob()), 'shared-clips', 'u1/l1.mp4'],
  ['problem shot', () => uploadProblemShot('r1', new Blob()), 'problem-shots', 'u1/r1.jpg'],
])('%s upload', (_name, send, bucket, objectName) => {
  it('inserts without upsert, since the bucket grants the owner INSERT only', async () => {
    await send();
    expect(upload.mock.calls[0][0].headers['x-upsert']).toBe('false');
    expect(upload.mock.calls[0][0].metadata).toMatchObject({ bucketName: bucket, objectName });
  });

  it('treats an already uploaded object (409) as sent', async () => {
    upload.mockRejectedValueOnce(new TusError('create failed: 409 The resource already exists', 409));
    await expect(send()).resolves.toBeUndefined();
  });

  it('still fails on a refused upload', async () => {
    upload.mockRejectedValueOnce(new TusError('create failed: 403 new row violates row-level security policy', 403));
    await expect(send()).rejects.toMatchObject({ code: 'upload_failed' });
  });
});
