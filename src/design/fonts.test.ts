import { act, renderHook } from '@testing-library/react-native';
import { FONT_WAIT_MS, useAppFonts } from './fonts';

jest.mock('expo-font', () => ({ useFonts: jest.fn() }));
const mockUseFonts = jest.requireMock('expo-font').useFonts as jest.Mock;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('ready once the fonts load', async () => {
  mockUseFonts.mockReturnValue([true, null]);
  const { result } = await renderHook(() => useAppFonts());
  expect(result.current).toBe(true);
});

test('a font that fails to load does not hold the app on the splash', async () => {
  mockUseFonts.mockReturnValue([false, new Error('font failed')]);
  const { result } = await renderHook(() => useAppFonts());
  expect(result.current).toBe(true);
});

test('fonts that never settle give way after the wait', async () => {
  mockUseFonts.mockReturnValue([false, null]);
  const { result } = await renderHook(() => useAppFonts());
  expect(result.current).toBe(false);

  await act(async () => {
    jest.advanceTimersByTime(FONT_WAIT_MS);
  });
  expect(result.current).toBe(true);
});
