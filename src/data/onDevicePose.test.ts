import PoseVision from '../../modules/pose-vision';
import { analyzeClipPose, compactPose, onDevicePoseEnabled } from './onDevicePose';

const analyzePose = PoseVision!.analyzePose as jest.Mock;

const COMPACT =
  '{"source":"apple-vision","fps":30,"width":1080,"height":1920,"frames":[' +
  '{"t":0,"joints":{"left_hand_joint":[500,901,0.81]},"box":[400,301,700,1850]},' +
  '{"t":0.0333,"joints":{}}]}';

describe('onDevicePose', () => {
  const env = process.env.EXPO_PUBLIC_ON_DEVICE_POSE;
  afterEach(() => {
    process.env.EXPO_PUBLIC_ON_DEVICE_POSE = env;
    jest.clearAllMocks();
  });

  it('is off unless EXPO_PUBLIC_ON_DEVICE_POSE is exactly 1', () => {
    delete process.env.EXPO_PUBLIC_ON_DEVICE_POSE;
    expect(onDevicePoseEnabled()).toBe(false);
    process.env.EXPO_PUBLIC_ON_DEVICE_POSE = 'true';
    expect(onDevicePoseEnabled()).toBe(false);
    process.env.EXPO_PUBLIC_ON_DEVICE_POSE = '1';
    expect(onDevicePoseEnabled()).toBe(true);
  });

  it('compacts to whole pixels, two-decimal confidence, and drops joints under 0.1', () => {
    expect(
      compactPose({
        fps: 30,
        width: 1080,
        height: 1920,
        frames: [
          {
            t: 0,
            joints: { left_hand_joint: [500.4, 900.6, 0.812], left_foot_joint: [480, 1800, 0.05] },
            box: [400.2, 300.7, 700, 1850],
          },
          { t: 0.033333, joints: {} },
        ],
      })
    ).toBe(COMPACT);
  });

  it('keeps bystanders and the body angle when Vision gives them', () => {
    const json = compactPose({
      fps: 60,
      width: 1080,
      height: 1920,
      bodyAngleDeg: 84.6,
      frames: [{ t: 0, joints: {}, others: [{ box: [1, 2, 3.6, 4], joints: { root: [10.5, 20.4, 0.333] } }] }],
    });
    expect(JSON.parse(json)).toEqual({
      source: 'apple-vision',
      fps: 60,
      width: 1080,
      height: 1920,
      bodyAngleDeg: 85,
      frames: [{ t: 0, joints: {}, others: [{ box: [1, 2, 4, 4], joints: { root: [11, 20, 0.33] } }] }],
    });
  });

  it('flag off: never calls Vision and returns null', async () => {
    delete process.env.EXPO_PUBLIC_ON_DEVICE_POSE;
    const progress = jest.fn();
    await expect(analyzeClipPose('file:///prepared.mp4', progress)).resolves.toBeNull();
    expect(analyzePose).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
  });

  it('flag on: reads the prepared clip, reports progress, returns the compact JSON', async () => {
    process.env.EXPO_PUBLIC_ON_DEVICE_POSE = '1';
    const progress = jest.fn();
    await expect(analyzeClipPose('file:///prepared.mp4', progress)).resolves.toBe(COMPACT);
    expect(analyzePose.mock.calls).toEqual([['file:///prepared.mp4', {}]]);
    expect(progress.mock.calls).toEqual([[0.5], [1]]);
  });

  it('a Vision failure falls back to null (the server runs pose)', async () => {
    process.env.EXPO_PUBLIC_ON_DEVICE_POSE = '1';
    analyzePose.mockRejectedValueOnce(new Error('Could not read body pose'));
    await expect(analyzeClipPose('file:///prepared.mp4', jest.fn())).resolves.toBeNull();
  });
});
