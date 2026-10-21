import * as SecureStore from 'expo-secure-store';

// 3.1: the phone decides the free lifts. The count lives in the Keychain, which on
// iOS survives deleting the app on the same phone (not a wipe or a new phone).
// Abuse is accepted (design 3.1 section 6.1); the server only mirrors it.
export const FREE_USED_KEY = 'catchline.free_used';

const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export async function readFreeUsed(): Promise<number> {
  try {
    const n = Number(await SecureStore.getItemAsync(FREE_USED_KEY, OPTIONS));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

// Never lowers the count: a stale write from another path cannot hand lifts back.
export async function writeFreeUsed(count: number): Promise<void> {
  if (count <= (await readFreeUsed())) return;
  await SecureStore.setItemAsync(FREE_USED_KEY, String(count), OPTIONS).catch(() => undefined);
}
