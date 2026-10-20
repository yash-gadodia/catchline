import PoseCoreML from '../../modules/pose-coreml';
import { analyzeClipPose, onDevicePoseEnabled, poseJson, prefetchPoseModels } from './onDevicePose';

const analyzePose = PoseCoreML!.analyzePose as jest.Mock;

const KP = [null, null, null, null, null, [310.5, 402.1, 0.912], ...Array(20).fill([300, 500, 0.5])];
const JSON_OUT =
  '{"source":"rtmpose-coreml","fps":30,"width":720,"height":1280,"frames":[' +
  `{"t":0,"people":[{"box":[250.2,180,470.8,1210.4],"kp":${JSON.stringify(KP)}}],"lifter":0},` +
  '{"t":0.0333,"people":[]}]}';

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

  it('tags the native result with its source, nothing else changed', () => {
    expect(poseJson({ fps: 60, width: 720, height: 1280, frames: [{ t: 0, people: [] }] })).toBe(
      '{"source":"rtmpose-coreml","fps":60,"width":720,"height":1280,"frames":[{"t":0,"people":[]}]}'
    );
  });

  it('flag off: never calls the models and returns null', async () => {
    delete process.env.EXPO_PUBLIC_ON_DEVICE_POSE;
    const progress = jest.fn();
    await expect(analyzeClipPose('file:///prepared.mp4', progress)).resolves.toBeNull();
    expect(analyzePose).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
  });

  it('flag on: reads the prepared clip, reports progress, returns the upload JSON', async () => {
    process.env.EXPO_PUBLIC_ON_DEVICE_POSE = '1';
    const progress = jest.fn();
    await expect(analyzeClipPose('file:///prepared.mp4', progress)).resolves.toBe(JSON_OUT);
    expect(analyzePose.mock.calls).toEqual([['file:///prepared.mp4']]);
    expect(progress.mock.calls).toEqual([[0.5], [1]]);
  });

  it('a model failure falls back to null (the server runs pose)', async () => {
    process.env.EXPO_PUBLIC_ON_DEVICE_POSE = '1';
    analyzePose.mockRejectedValueOnce(new Error('Could not read body pose'));
    await expect(analyzeClipPose('file:///prepared.mp4', jest.fn())).resolves.toBeNull();
  });

  it('prefetch starts the model download whatever the build flag, and swallows a failure', async () => {
    delete process.env.EXPO_PUBLIC_ON_DEVICE_POSE;
    const ensureModels = PoseCoreML!.ensureModels as jest.Mock;
    ensureModels.mockRejectedValueOnce(new Error('offline'));
    prefetchPoseModels();
    await Promise.resolve();
    expect(ensureModels).toHaveBeenCalledTimes(1);
  });
});
