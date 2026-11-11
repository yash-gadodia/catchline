import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { newClip, useCapture, useCaptureHydrated } from './store';

// The next read of the capture store from disk returns `saved`, but only once `release()` is called.
function slowDisk(saved: Record<string, unknown>): () => void {
  let release!: () => void;
  const disk = new Promise<void>((r) => (release = r));
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(async () => {
    await disk;
    return JSON.stringify({ state: saved, version: 0 });
  });
  return release;
}

describe('capture store', () => {
  it('persists the last weight and the kept originals, and nothing about a movement', async () => {
    useCapture.getState().setLastWeight('82.5');
    useCapture.getState().addOriginal('file:///a.mov');
    const state = JSON.parse((await AsyncStorage.getItem('catchline.capture'))!).state;
    expect(state).toEqual({ lastWeight: '82.5', originals: ['file:///a.mov'] });
  });

  it('reports hydration only once the saved weight is back from disk, ignoring a movement saved by 3.x', async () => {
    useCapture.setState({ lastWeight: '' });
    const release = slowDisk({ movement: 'clean', lastWeight: '70', originals: [] });
    const rehydrated = useCapture.persist.rehydrate();
    const { result } = await renderHook(() => useCaptureHydrated());
    expect([result.current, useCapture.getState().lastWeight]).toEqual([false, '']);
    await act(async () => {
      release();
      await rehydrated;
    });
    await waitFor(() => expect(result.current).toBe(true));
    expect(useCapture.getState().lastWeight).toBe('70');
  });

  it('a new clip is the whole video with no movement on it', () => {
    expect(newClip({ uri: 'file:///a.mov', durationS: 8, fps: 30, source: 'library' })).toEqual({
      uri: 'file:///a.mov',
      durationS: 8,
      fps: 30,
      source: 'library',
      trim: { start: 0, end: 8 },
      overridden: [],
    });
  });
});
