import type { Analysis, TracePoint } from '../../analysis/types';
import { setPlateFramesChoice, usePlateFramesConsent } from './consent';
import { sendCorrection, sendLiftFrames } from './send';

jest.mock('../../data/backend', () => ({ backendEnabled: () => true }));
jest.mock('../../lib/api', () => ({ ensureSession: jest.fn(async () => 'u1'), recordConsent: jest.fn(async () => undefined) }));
jest.mock('../../data/problemReports', () => ({ reportDetails: () => ({ appVersion: '4.0.1', updateId: 'ota-7', device: 'iPhone16,1 iOS 26.1' }) }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});
const mockCrop = jest.fn(async (_uri: string, crops: string) =>
  (JSON.parse(crops) as { id: string; frame: number; px: number }[]).filter((c) => c.frame < 100).map((c) => ({ id: c.id, uri: `file:///tmp/plate-frames/${c.id}.jpg`, px: c.px, frame: c.frame }))
);
jest.mock('../../../modules/clip-transcoder', () => ({ __esModule: true, default: { cropFrames: (uri: string, crops: string) => mockCrop(uri, crops) } }));
const mockQueue = jest.fn(async (_frames: unknown[]) => 0);
jest.mock('./outbox', () => ({ queuePlateFrames: (frames: unknown[]) => mockQueue(frames) }));
const mockPlate = jest.fn();
jest.mock('./local', () => ({ readLocalPlate: () => mockPlate() }));
const mockAnalysis = jest.fn();
jest.mock('../../data/localLifts', () => ({ localClipUri: (id: string) => `file:///docs/lifts/${id}/clip.mp4`, readLocalAnalysis: () => mockAnalysis() }));

const path: TracePoint[] = [
  { frame: 0, x: 0.5, y: 0.8, src: 'plate' },
  { frame: 20, x: 0.5, y: 0.7, src: 'plate' },
  { frame: 21, x: 0.5, y: 0.62, src: 'plate' },
  { frame: 30, x: 0.5, y: 0.5, src: 'plate' },
  { frame: 40, x: 0.52, y: 0.3, src: 'plate' },
];
const analysis = { reps: [{ path }], traceKind: 'bar', video: { uri: '', width: 1080, height: 1920, fps: 60, frameCount: 120 }, failure: null, analysisVersion: 'cv-4.0' } as unknown as Analysis;

beforeEach(() => {
  jest.clearAllMocks();
  usePlateFramesConsent.setState({ choice: null, asked: false });
  mockAnalysis.mockResolvedValue(analysis);
  mockPlate.mockResolvedValue({ mark: { x: 0.5, y: 0.8, r: 0.05 }, corrections: [] });
});

describe('sendLiftFrames', () => {
  it('cuts nothing and queues nothing without the consent', async () => {
    expect(await sendLiftFrames('lift-1')).toBe(0);
    await setPlateFramesChoice(false);
    expect(await sendLiftFrames('lift-1')).toBe(0);
    expect(mockAnalysis).not.toHaveBeenCalled();
    expect(mockCrop).not.toHaveBeenCalled();
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it('with the consent: crops of the kept clip only, the mark as the one strong label', async () => {
    await setPlateFramesChoice(true);
    expect(await sendLiftFrames('lift-1')).toBe(4);
    expect(mockCrop).toHaveBeenCalledTimes(1);
    expect(mockCrop.mock.calls[0][0]).toBe('file:///docs/lifts/lift-1/clip.mp4');
    const asked = JSON.parse(mockCrop.mock.calls[0][1]) as { frame: number; px: number; side: number }[];
    expect(asked.map((c) => c.frame)).toEqual([0, 30, 40, 21]);
    expect(asked.every((c) => c.px <= 512 && c.side * 1920 <= 864)).toBe(true);
    const queued = mockQueue.mock.calls[0][0] as { id: string; file: string; record: Record<string, unknown> }[];
    expect(queued.map((q) => [q.record.kind, q.record.frame, q.record.r])).toEqual([
      ['mark', 0, 0.1667],
      ['track', 30, null],
      ['track', 40, null],
      ['track', 21, null],
    ]);
    expect(queued[0]).toEqual({
      id: 'id-1',
      file: 'file:///tmp/plate-frames/id-1.jpg',
      record: {
        kind: 'mark',
        lift_id: 'lift-1',
        frame: 0,
        x: 0.5001,
        y: 0.5,
        r: 0.1667,
        confidence: null,
        crop_px: 512,
        crop_left: 0.2333,
        crop_top: 0.65,
        crop_side: 0.3,
        clip_fps: 60,
        clip_width: 1080,
        clip_height: 1920,
        mark_skipped: false,
        app_version: '4.0.1',
        update_id: 'ota-7',
        model_version: 'cv-4.0',
      },
    });
    // nothing that names the person or the phone goes with a crop
    expect(Object.keys(queued[0].record).sort()).toEqual(
      ['app_version', 'clip_fps', 'clip_height', 'clip_width', 'confidence', 'crop_left', 'crop_px', 'crop_side', 'crop_top', 'frame', 'kind', 'lift_id', 'mark_skipped', 'model_version', 'r', 'update_id', 'x', 'y']
    );
  });

  it('a skipped mark sends no strong label, and says it was skipped', async () => {
    await setPlateFramesChoice(true);
    mockPlate.mockResolvedValue({ mark: null, corrections: [] });
    expect(await sendLiftFrames('lift-1')).toBe(4);
    const queued = mockQueue.mock.calls[0][0] as { record: { kind: string; mark_skipped: boolean } }[];
    expect(queued.map((q) => q.record.kind)).toEqual(['track', 'track', 'track', 'track']);
    expect(queued.every((q) => q.record.mark_skipped)).toBe(true);
  });

  it('never throws into the lift when the crop fails', async () => {
    await setPlateFramesChoice(true);
    mockCrop.mockRejectedValueOnce(new Error('no frames'));
    expect(await sendLiftFrames('lift-1')).toBe(0);
    expect(mockQueue).not.toHaveBeenCalled();
  });
});

describe('sendCorrection', () => {
  it('is kept off the wire without the consent', async () => {
    expect(await sendCorrection('lift-1', 37, { x: 0.4, y: 0.4, r: 0.05 })).toBe(0);
    expect(mockCrop).not.toHaveBeenCalled();
  });

  it('goes as a strong label on the frame it was drawn on', async () => {
    await setPlateFramesChoice(true);
    expect(await sendCorrection('lift-1', 37, { x: 0.5, y: 0.5, r: 0.05 })).toBe(1);
    const queued = mockQueue.mock.calls[0][0] as { record: Record<string, unknown> }[];
    expect([queued[0].record.kind, queued[0].record.frame, queued[0].record.r, queued[0].record.crop_px]).toEqual(['correction', 37, 0.1667, 512]);
  });

  it('leaves out a frame the clip does not have', async () => {
    await setPlateFramesChoice(true);
    expect(await sendCorrection('lift-1', 500, { x: 0.5, y: 0.5, r: 0.05 })).toBe(0);
    expect(mockQueue.mock.calls[0][0]).toEqual([]);
  });
});
