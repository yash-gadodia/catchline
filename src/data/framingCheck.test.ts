import AsyncStorage from '@react-native-async-storage/async-storage';
import Transcoder from '../../modules/clip-transcoder';
import PoseCoreML from '../../modules/pose-coreml';
import { supabase } from '../lib/supabase';
import { FRAMING_ATTEMPT_KEY, FRAMING_DISABLED_KEY, framingPose } from './framingCheck';

const deleted: string[] = [];
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ exists: true, delete: () => deleted.push(uri) })),
}));

const analyzePose = PoseCoreML!.analyzePose as jest.Mock;
const transcode = Transcoder.transcode as jest.Mock;
const POSE = { fps: 10, width: 720, height: 1280, frames: [] };

function flag(enabled: boolean | null) {
  const maybeSingle = jest.fn(async () => ({ data: enabled === null ? null : { enabled }, error: null }));
  jest.spyOn(supabase, 'from').mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) } as unknown as ReturnType<typeof supabase.from>);
}

describe('framing check', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    deleted.length = 0;
    flag(null);
    analyzePose.mockClear();
    transcode.mockClear();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('runs pose on a small 10 fps copy of the first 1.5 s from the trim start, then deletes the copy', async () => {
    analyzePose.mockResolvedValueOnce(POSE);
    expect(await framingPose('file:///clip.mov', 2, 9)).toEqual(POSE);
    expect(transcode.mock.calls).toEqual([
      [{ uri: 'file:///clip.mov', startS: 2, endS: 3.5, width: 720, height: 406, fps: 10, dropToFps: true, bitrate: 2_000_000 }],
    ]);
    expect(analyzePose.mock.calls).toEqual([['file:///cache/clip-transcoder/out.mp4']]);
    expect(deleted).toEqual(['file:///cache/clip-transcoder/out.mp4']);
    expect(await AsyncStorage.getItem(FRAMING_ATTEMPT_KEY)).toBeNull();
  });

  it('stops at the trim end on a short clip', async () => {
    analyzePose.mockResolvedValueOnce(POSE);
    await framingPose('file:///clip.mov', 0, 1);
    expect(transcode.mock.calls[0][0]).toMatchObject({ startS: 0, endS: 1 });
  });

  it('runs whatever the on_device_pose switch says; its own switch set false turns it off', async () => {
    flag(false);
    expect(await framingPose('file:///clip.mov', 0, 9)).toBeNull();
    expect(transcode).not.toHaveBeenCalled();
    flag(true);
    analyzePose.mockResolvedValueOnce(POSE);
    expect(await framingPose('file:///clip.mov', 0, 9)).toEqual(POSE);
  });

  it('marks the attempt while the native work runs', async () => {
    let during: string | null = 'unset';
    analyzePose.mockImplementationOnce(async () => {
      during = await AsyncStorage.getItem(FRAMING_ATTEMPT_KEY);
      return POSE;
    });
    await framingPose('file:///clip.mov', 0, 9);
    expect(during).toBe('1');
  });

  it('a crash during the last check turns it off on this phone for good', async () => {
    await AsyncStorage.setItem(FRAMING_ATTEMPT_KEY, '1');
    expect(await framingPose('file:///clip.mov', 0, 9)).toBeNull();
    expect(await AsyncStorage.getItem(FRAMING_DISABLED_KEY)).toBe('1');
    expect(await framingPose('file:///clip.mov', 0, 9)).toBeNull();
    expect(transcode).not.toHaveBeenCalled();
  });

  it('a model or transcoder error skips the check and clears the marker', async () => {
    analyzePose.mockRejectedValueOnce(new Error('Could not read body pose'));
    expect(await framingPose('file:///clip.mov', 0, 9)).toBeNull();
    expect(deleted).toEqual(['file:///cache/clip-transcoder/out.mp4']);
    transcode.mockRejectedValueOnce(new Error('no frames'));
    expect(await framingPose('file:///clip.mov', 0, 9)).toBeNull();
    expect(await AsyncStorage.getItem(FRAMING_ATTEMPT_KEY)).toBeNull();
  });

  it('gives up after 8 s; the native work still clears its marker when it ends', async () => {
    jest.useFakeTimers();
    let release: () => void = () => undefined;
    analyzePose.mockImplementationOnce(() => new Promise((r) => (release = () => r(POSE))));
    const run = framingPose('file:///clip.mov', 0, 9);
    await jest.advanceTimersByTimeAsync(7999);
    expect(await AsyncStorage.getItem(FRAMING_ATTEMPT_KEY)).toBe('1');
    await jest.advanceTimersByTimeAsync(1);
    expect(await run).toBeNull();
    release();
    await jest.advanceTimersByTimeAsync(0);
    expect(await AsyncStorage.getItem(FRAMING_ATTEMPT_KEY)).toBeNull();
    expect(deleted).toEqual(['file:///cache/clip-transcoder/out.mp4']);
  });
});
