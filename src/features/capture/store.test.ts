import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCapture, useCaptureHydrated } from './store';

// The next read of the capture store from disk returns `movement`, but only once `release()` is called.
function slowDisk(movement: string): () => void {
  let release!: () => void;
  const disk = new Promise<void>((r) => (release = r));
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(async () => {
    await disk;
    return JSON.stringify({ state: { movement, lastWeight: '', originals: [] }, version: 0 });
  });
  return release;
}

describe('capture store', () => {
  it('persists the movement next to the weight', async () => {
    useCapture.getState().setMovement('clean');
    useCapture.getState().setLastWeight('82.5');
    const state = JSON.parse((await AsyncStorage.getItem('catchline.capture'))!).state;
    expect([state.movement, state.lastWeight]).toEqual(['clean', '82.5']);
  });

  it('reports hydration only once the saved movement is back from disk', async () => {
    useCapture.setState({ movement: 'snatch' });
    const release = slowDisk('jerk');
    const rehydrated = useCapture.persist.rehydrate();
    const { result } = await renderHook(() => useCaptureHydrated());
    expect([result.current, useCapture.getState().movement]).toEqual([false, 'snatch']);
    await act(async () => {
      release();
      await rehydrated;
    });
    await waitFor(() => expect(result.current).toBe(true));
    expect(useCapture.getState().movement).toBe('jerk');
  });
});
