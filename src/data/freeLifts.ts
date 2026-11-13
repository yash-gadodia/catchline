import * as SecureStore from 'expo-secure-store';

// The phone decides the free videos. The counts live in the Keychain, which on iOS
// survives deleting the app on the same phone (not a wipe or a new phone).
// Abuse is accepted (design 3.1 section 6.1).
export const FREE_USED_KEY = 'catchline.free_used';
export const FREE_WEEK_KEY = 'catchline.free_week';

const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export type FreeWeek = { week: string; used: number };

// The free videos used in the week starting `week` (a Monday, YYYY-MM-DD), stored as `week:used`.
export async function readFreeWeek(): Promise<FreeWeek | null> {
  try {
    const [week, n] = ((await SecureStore.getItemAsync(FREE_WEEK_KEY, OPTIONS)) ?? '').split(':');
    const used = Number(n);
    return /^\d{4}-\d{2}-\d{2}$/.test(week) && Number.isInteger(used) && used > 0 ? { week, used } : null;
  } catch {
    return null;
  }
}

// Never lowers a week's count: a stale write cannot hand videos back.
export async function writeFreeWeek(next: FreeWeek): Promise<void> {
  const held = await readFreeWeek();
  if (held && (held.week > next.week || (held.week === next.week && held.used >= next.used))) return;
  await SecureStore.setItemAsync(FREE_WEEK_KEY, `${next.week}:${next.used}`, OPTIONS).catch(() => undefined);
}

// The lifetime count devicePipeline still mirrors. Nothing reads it back for the limit.
export async function readFreeUsed(): Promise<number> {
  try {
    const n = Number(await SecureStore.getItemAsync(FREE_USED_KEY, OPTIONS));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export async function writeFreeUsed(count: number): Promise<void> {
  if (count <= (await readFreeUsed())) return;
  await SecureStore.setItemAsync(FREE_USED_KEY, String(count), OPTIONS).catch(() => undefined);
}
