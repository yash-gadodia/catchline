import { startLift, usePipeline } from './pipeline';
import type { ClipSubmission } from '../features/capture/submit';
import { startDeviceLift } from './devicePipeline';
import { onDeviceAnalysisEnabled } from './onDeviceAnalysis';
import { createLift } from '../lib/api';

jest.mock('./devicePipeline', () => ({ ...jest.requireActual('./devicePipeline'), startDeviceLift: jest.fn(async () => undefined) }));
jest.mock('./onDeviceAnalysis', () => ({ onDeviceAnalysisEnabled: jest.fn(() => true) }));
jest.mock('../lib/api', () => ({ createLift: jest.fn() }));

const SUB: ClipSubmission & { uri: string } = {
  uri: 'file:///clip.mov',
  movement: 'snatch',
  loadKg: 70,
  trim: { start: 0, end: 4 },
  rep: 'all',
  source: 'camera',
  fps: 60,
  overridden: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  usePipeline.getState().clear();
});

describe('startLift (3.1: the phone only)', () => {
  it('hands every clip to the device pipeline whatever it shows, never create_lift', async () => {
    for (const movement of ['snatch', 'clean', 'jerk', 'kipping_pull_up', 'bar_muscle_up', 'kipping_hspu'] as const) await startLift({ ...SUB, movement });
    expect((startDeviceLift as jest.Mock).mock.calls.map(([s]) => s.movement)).toEqual(['snatch', 'clean', 'jerk', 'kipping_pull_up', 'bar_muscle_up', 'kipping_hspu']);
    expect(createLift).not.toHaveBeenCalled();
  });

  it('without the native module the lift fails the same way rather than go to a server', async () => {
    (onDeviceAnalysisEnabled as jest.Mock).mockReturnValueOnce(false);
    await startLift(SUB);
    expect(usePipeline.getState().job).toMatchObject({ status: 'failed', failureReason: 'unsupported_movement' });
    expect(startDeviceLift).not.toHaveBeenCalled();
    expect(createLift).not.toHaveBeenCalled();
  });
});
