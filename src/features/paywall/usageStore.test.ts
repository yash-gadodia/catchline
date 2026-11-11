import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { FREE_WEEK_KEY } from '../../data/freeLifts';
import { nextClipGate, syncKeychainUsage } from './hooks';
import { usePurchases } from '../purchases/usePurchases';
import { useUsage } from './usageStore';

const WED = new Date(2026, 10, 11, 9, 0);
const NEXT_MON = new Date(2026, 10, 16, 0, 0);
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  (SecureStore as unknown as { __reset: () => void }).__reset();
  useUsage.getState().reset();
  usePurchases.setState({ tier: 'free', period: null });
});

test('the third video of the week goes through, the fourth is capped, Monday resets', () => {
  useUsage.getState().record('free', WED);
  useUsage.getState().record('free', WED);
  expect(nextClipGate(WED)).toBe('ok');
  useUsage.getState().record('free', WED);
  expect(useUsage.getState().usage).toEqual({ lifetime: 3, week: '2026-11-09', thisWeek: 3 });
  expect(nextClipGate(WED)).toBe('cap');
  expect(nextClipGate(NEXT_MON)).toBe('ok');
});

test.each(['hook', 'pull', 'platform', 'founding'] as const)('an owner of %s is never capped', (tier) => {
  useUsage.setState({ usage: { lifetime: 3, week: '2026-11-09', thisWeek: 3 } });
  usePurchases.setState({ tier });
  expect(nextClipGate(WED)).toBe('ok');
});

test('a free video is mirrored to the Keychain with its week; a Pro video is not', async () => {
  useUsage.getState().record('free', WED);
  useUsage.getState().record('free', WED);
  await flush();
  expect(await SecureStore.getItemAsync(FREE_WEEK_KEY)).toBe('2026-11-09:2');

  useUsage.getState().record('pull', WED);
  await flush();
  expect(await SecureStore.getItemAsync(FREE_WEEK_KEY)).toBe('2026-11-09:2');
  expect(useUsage.getState().usage).toEqual({ lifetime: 3, week: '2026-11-09', thisWeek: 2 });
});

test('a reinstall reads this week’s count back from the Keychain, so the free videos are not handed back', async () => {
  await SecureStore.setItemAsync(FREE_WEEK_KEY, '2026-11-09:3');
  await syncKeychainUsage();
  expect(useUsage.getState().usage).toEqual({ lifetime: 0, week: '2026-11-09', thisWeek: 3 });
  expect(nextClipGate(WED)).toBe('cap');
  expect(nextClipGate(NEXT_MON)).toBe('ok');
});

test('the Keychain never lowers the phone’s count, and an older week is ignored', async () => {
  useUsage.setState({ usage: { lifetime: 3, week: '2026-11-09', thisWeek: 3 } });
  await SecureStore.setItemAsync(FREE_WEEK_KEY, '2026-11-09:1');
  await syncKeychainUsage();
  expect(useUsage.getState().usage.thisWeek).toBe(3);

  await SecureStore.setItemAsync(FREE_WEEK_KEY, '2026-11-02:3');
  await syncKeychainUsage();
  expect(useUsage.getState().usage).toEqual({ lifetime: 3, week: '2026-11-09', thisWeek: 3 });
});

test('usage saved by the old version (3 for life) keeps its lifetime count and starts the week fresh', async () => {
  await AsyncStorage.setItem(
    'catchline-usage',
    JSON.stringify({ state: { usage: { lifetime: 3, month: '2026-10', thisMonth: 0 }, variant: 'organic', queue: [], warnedAt: 2 }, version: 0 })
  );
  await useUsage.persist.rehydrate();
  expect(useUsage.getState().usage).toEqual({ lifetime: 3, week: '', thisWeek: 0 });
  expect(nextClipGate(WED)).toBe('ok');
});
