import * as SecureStore from 'expo-secure-store';
import { FREE_WEEK_KEY, readFreeWeek, writeFreeWeek } from './freeLifts';

beforeEach(() => (SecureStore as unknown as { __reset: () => void }).__reset());

describe('the weekly free count in the Keychain', () => {
  it('is empty on a fresh phone and for anything unreadable', async () => {
    expect(await readFreeWeek()).toBeNull();
    await SecureStore.setItemAsync(FREE_WEEK_KEY, 'garbage');
    expect(await readFreeWeek()).toBeNull();
    await SecureStore.setItemAsync(FREE_WEEK_KEY, '2026-11-09:x');
    expect(await readFreeWeek()).toBeNull();
  });

  it('stores the week with its count', async () => {
    await writeFreeWeek({ week: '2026-11-09', used: 2 });
    expect(await SecureStore.getItemAsync(FREE_WEEK_KEY)).toBe('2026-11-09:2');
    expect(await readFreeWeek()).toEqual({ week: '2026-11-09', used: 2 });
  });

  it('never lowers a week’s count or goes back a week, and moves on to a new week', async () => {
    await writeFreeWeek({ week: '2026-11-09', used: 3 });
    await writeFreeWeek({ week: '2026-11-09', used: 1 });
    await writeFreeWeek({ week: '2026-11-02', used: 3 });
    expect(await readFreeWeek()).toEqual({ week: '2026-11-09', used: 3 });
    await writeFreeWeek({ week: '2026-11-16', used: 1 });
    expect(await readFreeWeek()).toEqual({ week: '2026-11-16', used: 1 });
  });
});
