import * as SplashScreen from 'expo-splash-screen';
import { markLaunched, startLaunchWatchdog, useLaunch } from './launch';

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(() => Promise.resolve()) }));

beforeEach(() => {
  jest.useFakeTimers();
  useLaunch.setState({ ready: false, stalled: false });
});
afterEach(() => {
  markLaunched();
  jest.useRealTimers();
});

describe('launch watchdog', () => {
  it('flags a stall and drops the splash when no first screen arrives in time', () => {
    startLaunchWatchdog(1000);
    jest.advanceTimersByTime(999);
    expect(useLaunch.getState().stalled).toBe(false);
    jest.advanceTimersByTime(1);
    expect(useLaunch.getState().stalled).toBe(true);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('never stalls once the app has launched', () => {
    startLaunchWatchdog(1000);
    markLaunched();
    jest.advanceTimersByTime(5000);
    expect(useLaunch.getState()).toEqual({ ready: true, stalled: false });
  });

  it('clears a stall when the app launches late', () => {
    startLaunchWatchdog(1000);
    jest.advanceTimersByTime(1000);
    markLaunched();
    expect(useLaunch.getState()).toEqual({ ready: true, stalled: false });
  });
});
