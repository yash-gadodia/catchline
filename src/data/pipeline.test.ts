import { startLift, uploadStep, usePipeline, type Job } from './pipeline';
import type { ClipSubmission } from '../features/capture/submit';

jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('./backend', () => ({ syncConsent: jest.fn(async () => undefined) }));
jest.mock('./prepare', () => ({
  ClipTooLongError: class ClipTooLongError extends Error {},
  prepareClip: jest.fn(async (uri: string) => ({ uri: `${uri}.mp4` })),
  discardPrepared: jest.fn(),
}));
jest.mock('../lib/api', () => ({
  ...jest.requireActual('../lib/api/errors'),
  createLift: jest.fn(),
  syncPlan: jest.fn(),
}));
const mockTier = { tier: 'free' };
jest.mock('../features/purchases/usePurchases', () => ({
  usePurchases: { getState: () => mockTier },
}));

import { ApiError, createLift, syncPlan } from '../lib/api';

const mockCreateLift = createLift as jest.Mock;
const mockSyncPlan = syncPlan as jest.Mock;

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
const LIFT = { id: 'l1', status: 'queued' };
const read = async () => ({ size: 4, slice: () => new Uint8Array(0) });
const capReached = () => new ApiError('cap_reached');

beforeEach(() => {
  jest.clearAllMocks();
  usePipeline.getState().clear();
  mockTier.tier = 'free';
});

describe('startLift when create_lift says cap_reached', () => {
  it('a free lifter goes straight to the cap paywall, no sync', async () => {
    mockCreateLift.mockRejectedValueOnce(capReached());
    await startLift(SUB, read);
    expect(mockSyncPlan).not.toHaveBeenCalled();
    expect(mockCreateLift).toHaveBeenCalledTimes(1);
    expect(usePipeline.getState().job).toMatchObject({ status: 'failed', error: 'cap_reached' });
  });

  it('a paid lifter syncs the plan from RevenueCat and retries once', async () => {
    mockTier.tier = 'pull';
    mockCreateLift.mockRejectedValueOnce(capReached()).mockResolvedValueOnce(LIFT);
    mockSyncPlan.mockResolvedValueOnce({ plan: 'pull', founding: false, result: 'applied' });
    await startLift(SUB, read);
    expect(mockSyncPlan).toHaveBeenCalledTimes(1);
    expect(mockCreateLift).toHaveBeenCalledTimes(2);
    expect(mockCreateLift.mock.calls[1][0]).toMatchObject({ movement: 'snatch', loadKg: 70 });
    expect(usePipeline.getState().job).toMatchObject({ status: 'queued', liftId: 'l1', error: null });
  });

  it('still capped after the sync: the cap paywall, after exactly one retry', async () => {
    mockTier.tier = 'pull';
    mockCreateLift.mockRejectedValue(capReached());
    mockSyncPlan.mockRejectedValueOnce(new ApiError('unknown'));
    await startLift(SUB, read);
    expect(mockSyncPlan).toHaveBeenCalledTimes(1);
    expect(mockCreateLift).toHaveBeenCalledTimes(2);
    expect(usePipeline.getState().job).toMatchObject({ status: 'failed', error: 'cap_reached' });
  });

  it('other errors never sync', async () => {
    mockTier.tier = 'pull';
    mockCreateLift.mockRejectedValueOnce(new ApiError('consent_required'));
    await startLift(SUB, read);
    expect(mockSyncPlan).not.toHaveBeenCalled();
    expect(usePipeline.getState().job).toMatchObject({ status: 'failed', error: 'consent_required' });
  });
});

describe('uploadStep (the first processing line)', () => {
  const job = (over: Partial<Job>): Job => ({
    id: 'job-1',
    movement: 'snatch',
    status: 'uploading',
    liftId: null,
    prepared: 1,
    sent: 0,
    total: 0,
    uploadUrl: null,
    error: null,
    maxS: null,
    ...over,
  });

  it('maps the prepare fraction and the bytes sent to whole percentages', () => {
    expect(uploadStep(job({ status: 'preparing', prepared: 0.42 }))).toEqual({ label: 'Preparing your clip', meta: 'preparing 42%' });
    expect(uploadStep(job({ status: 'preparing', prepared: 0.995 }))).toEqual({ label: 'Preparing your clip', meta: 'preparing 100%' });
    expect(uploadStep(job({ sent: 0, total: 12_582_912 }))).toEqual({ label: 'Uploading your clip', meta: 'uploading 0%' });
    expect(uploadStep(job({ sent: 3_145_728, total: 12_582_912 }))).toEqual({ label: 'Uploading your clip', meta: 'uploading 25%' });
    expect(uploadStep(job({ sent: 6_291_456 + 1_048_576, total: 12_582_912 }))).toEqual({ label: 'Uploading your clip', meta: 'uploading 58%' });
    expect(uploadStep(job({ sent: 12_582_912, total: 12_582_912 }))).toEqual({ label: 'Uploading your clip', meta: 'uploading 100%' });
  });

  it('has no percentage before the file size is known, or once the lift is queued', () => {
    expect(uploadStep(job({ total: 0 }))).toEqual({ label: 'Uploading your clip', meta: null });
    expect(uploadStep(job({ status: 'queued', sent: 12_582_912, total: 12_582_912 }))).toEqual({ label: 'Uploading your clip', meta: null });
    expect(uploadStep(null)).toEqual({ label: 'Uploading your clip', meta: null });
  });
});
