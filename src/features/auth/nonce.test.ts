import { hashNonce, rawNonce } from './nonce';

describe('Apple sign-in nonce', () => {
  it('hex-encodes the random bytes, two chars per byte', () => {
    expect(rawNonce(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
    expect(rawNonce()).toHaveLength(64);
    expect(rawNonce()).not.toBe(rawNonce());
  });

  it('hashes the raw nonce with SHA-256 as hex', async () => {
    expect(await hashNonce('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
