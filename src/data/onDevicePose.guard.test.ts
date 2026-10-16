import AsyncStorage from '@react-native-async-storage/async-storage';
import PoseCoreML from '../../modules/pose-coreml';
import { analyzeClipPose, POSE_ATTEMPT_KEY, POSE_DISABLED_KEY, shouldRunDevicePose } from './onDevicePose';
import { supabase } from '../lib/supabase';

const analyzePose = PoseCoreML!.analyzePose as jest.Mock;

function flag(enabled: boolean | null) {
  const maybeSingle = jest.fn(async () => ({ data: enabled === null ? null : { enabled }, error: null }));
  jest.spyOn(supabase, 'from').mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) } as unknown as ReturnType<typeof supabase.from>);
}

describe('on-device pose guards', () => {
  const env = process.env.EXPO_PUBLIC_ON_DEVICE_POSE;
  beforeEach(async () => {
    await AsyncStorage.clear();
    process.env.EXPO_PUBLIC_ON_DEVICE_POSE = '1';
    flag(true);
  });
  afterEach(() => {
    process.env.EXPO_PUBLIC_ON_DEVICE_POSE = env;
    jest.restoreAllMocks();
  });

  it('runs on the phone when the build flag and the server switch are both on', async () => {
    expect(await shouldRunDevicePose()).toBe(true);
  });

  it('the server switch turns it off without a new build, and a missing row means off', async () => {
    flag(false);
    expect(await shouldRunDevicePose()).toBe(false);
    flag(null);
    expect(await shouldRunDevicePose()).toBe(false);
  });

  it('a crash during the last attempt turns it off on this phone for good', async () => {
    await AsyncStorage.setItem(POSE_ATTEMPT_KEY, '1');
    expect(await shouldRunDevicePose()).toBe(false);
    expect(await AsyncStorage.getItem(POSE_DISABLED_KEY)).toBe('1');
    expect(await AsyncStorage.getItem(POSE_ATTEMPT_KEY)).toBeNull();
    expect(await shouldRunDevicePose()).toBe(false);
  });

  it('marks the attempt while the model runs and clears it when it returns or throws', async () => {
    let during: string | null = 'unset';
    analyzePose.mockImplementationOnce(async () => {
      during = await AsyncStorage.getItem(POSE_ATTEMPT_KEY);
      return { fps: 30, width: 720, height: 1280, frames: [] };
    });
    expect(await analyzeClipPose('file:///clip.mp4', () => undefined)).toContain('"source":"rtmpose-coreml"');
    expect(during).toBe('1');
    expect(await AsyncStorage.getItem(POSE_ATTEMPT_KEY)).toBeNull();

    analyzePose.mockRejectedValueOnce(new Error('model'));
    expect(await analyzeClipPose('file:///clip.mp4', () => undefined)).toBeNull();
    expect(await AsyncStorage.getItem(POSE_ATTEMPT_KEY)).toBeNull();
  });
});
