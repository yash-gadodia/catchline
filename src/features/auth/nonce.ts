import * as Crypto from 'expo-crypto';

// Sign in with Apple replay protection: Apple signs the SHA-256 of the nonce
// into the identity token; Supabase checks it against the raw nonce we keep.
export function rawNonce(bytes: Uint8Array = Crypto.getRandomBytes(32)): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hashNonce(raw: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
}
