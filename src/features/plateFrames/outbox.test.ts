import { ApiError } from '../../lib/api/errors';
import { setPlateFramesChoice, shouldAskPlateFrames, usePlateFramesConsent, plateFramesGranted } from './consent';
import { clearPlateFrameOutbox, flushPlateFrames, MAX_QUEUED, queuePlateFrames, usePlateFrameOutbox, type QueuedFrame } from './outbox';

const mockDeleted: string[] = [];
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return true;
    }
    delete() {
      mockDeleted.push(this.uri);
    }
  },
}));
jest.mock('../../data/backend', () => ({ backendEnabled: () => true }));
jest.mock('../../data/readClip', () => ({ readClip: (uri: string) => ({ size: 3, uri }) }));
jest.mock('../../../modules/clip-transcoder', () => ({ __esModule: true, default: { cropFrames: jest.fn() } }));
jest.mock('../../lib/api', () => ({
  ApiError: jest.requireActual('../../lib/api/errors').ApiError,
  ensureSession: jest.fn(async () => 'u1'),
  recordConsent: jest.fn(async () => undefined),
  uploadPlateFrame: jest.fn(async () => undefined),
  recordPlateFrame: jest.fn(async () => undefined),
}));

const api = jest.requireMock('../../lib/api') as { recordConsent: jest.Mock; uploadPlateFrame: jest.Mock; recordPlateFrame: jest.Mock };

const frame = (n: number): QueuedFrame => ({
  id: `f${n}`,
  file: `file:///tmp/plate-frames/f${n}.jpg`,
  record: { kind: 'track', lift_id: 'lift-1', frame: n, x: 0.5, y: 0.5, r: null, confidence: null, crop_px: 512, crop_left: 0.2, crop_top: 0.3, crop_side: 0.3, clip_fps: 60, clip_width: 1080, clip_height: 1920, mark_skipped: false, app_version: '4.0.1', update_id: 'embedded', model_version: 'cv-1' },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleted.length = 0;
  usePlateFrameOutbox.setState({ items: [] });
  usePlateFramesConsent.setState({ choice: null, asked: false });
});

describe('the consent', () => {
  it('is off until the lifter says yes, and is asked once', async () => {
    expect(plateFramesGranted()).toBe(false);
    expect(shouldAskPlateFrames()).toBe(true);
    await setPlateFramesChoice(false, new Date('2026-11-11T10:00:00Z'));
    expect(shouldAskPlateFrames()).toBe(false);
    expect(plateFramesGranted()).toBe(false);
    expect(api.recordConsent).toHaveBeenCalledWith('plate_frames', '1', false);
  });

  it('is written to the server log, and kept for the next flush when that fails', async () => {
    api.recordConsent.mockRejectedValueOnce(new Error('offline'));
    expect(await setPlateFramesChoice(true, new Date('2026-11-11T10:00:00Z'))).toBe(false);
    expect(usePlateFramesConsent.getState().choice).toEqual({ granted: true, version: 1, at: '2026-11-11T10:00:00.000Z', synced: false });
    await flushPlateFrames();
    expect(api.recordConsent).toHaveBeenLastCalledWith('plate_frames', '1', true);
    expect(usePlateFramesConsent.getState().choice?.synced).toBe(true);
  });
});

describe('the outbox', () => {
  it('queues nothing without the consent, and deletes the crops it was handed', async () => {
    expect(await queuePlateFrames([frame(1), frame(2)])).toBe(0);
    expect(usePlateFrameOutbox.getState().items).toEqual([]);
    expect(api.uploadPlateFrame).not.toHaveBeenCalled();
    expect(mockDeleted).toEqual(['file:///tmp/plate-frames/f1.jpg', 'file:///tmp/plate-frames/f2.jpg']);
  });

  it('uploads each crop, then its record, then deletes the file', async () => {
    await setPlateFramesChoice(true);
    const order: string[] = [];
    api.uploadPlateFrame.mockImplementation(async (id: string, file: { uri: string }) => void order.push(`crop ${id} ${file.uri}`));
    api.recordPlateFrame.mockImplementation(async (id: string, r: { frame: number }) => void order.push(`row ${id} ${r.frame}`));
    expect(await queuePlateFrames([frame(1), frame(2)])).toBe(2);
    expect(order).toEqual(['crop f1 file:///tmp/plate-frames/f1.jpg', 'row f1 1', 'crop f2 file:///tmp/plate-frames/f2.jpg', 'row f2 2']);
    expect(usePlateFrameOutbox.getState().items).toEqual([]);
    expect(mockDeleted).toEqual(['file:///tmp/plate-frames/f1.jpg', 'file:///tmp/plate-frames/f2.jpg']);
  });

  it('keeps everything for later when the network fails', async () => {
    await setPlateFramesChoice(true);
    api.uploadPlateFrame.mockRejectedValueOnce(new ApiError('upload_failed'));
    expect(await queuePlateFrames([frame(1), frame(2)])).toBe(0);
    expect(usePlateFrameOutbox.getState().items.map((i) => i.id)).toEqual(['f1', 'f2']);
    expect(mockDeleted).toEqual([]);
    expect(await flushPlateFrames()).toBe(2);
    expect(usePlateFrameOutbox.getState().items).toEqual([]);
  });

  it('drops a crop the server will never take and carries on', async () => {
    await setPlateFramesChoice(true);
    api.recordPlateFrame.mockRejectedValueOnce(new ApiError('bad_frame'));
    expect(await queuePlateFrames([frame(1), frame(2)])).toBe(1);
    expect(usePlateFrameOutbox.getState().items).toEqual([]);
    expect(mockDeleted).toEqual(['file:///tmp/plate-frames/f1.jpg', 'file:///tmp/plate-frames/f2.jpg']);
  });

  it('empties itself when the server says the consent is not there', async () => {
    await setPlateFramesChoice(true);
    api.uploadPlateFrame.mockRejectedValueOnce(new ApiError('consent_required'));
    expect(await queuePlateFrames([frame(1), frame(2), frame(3)])).toBe(0);
    expect(usePlateFrameOutbox.getState().items).toEqual([]);
    expect(api.uploadPlateFrame).toHaveBeenCalledTimes(1);
    expect(mockDeleted).toHaveLength(3);
  });

  it('sends nothing more once the lifter turns it off, and empties what was waiting', async () => {
    await setPlateFramesChoice(true);
    api.uploadPlateFrame.mockRejectedValueOnce(new ApiError('upload_failed'));
    await queuePlateFrames([frame(1), frame(2)]);
    await setPlateFramesChoice(false);
    api.uploadPlateFrame.mockClear();
    expect(await flushPlateFrames()).toBe(0);
    expect(api.uploadPlateFrame).not.toHaveBeenCalled();
    expect(usePlateFrameOutbox.getState().items).toEqual([]);
    expect(mockDeleted).toEqual(['file:///tmp/plate-frames/f1.jpg', 'file:///tmp/plate-frames/f2.jpg']);
  });

  it('is capped: the oldest crops go first when a phone stays offline', async () => {
    await setPlateFramesChoice(true);
    api.uploadPlateFrame.mockRejectedValue(new ApiError('upload_failed'));
    await queuePlateFrames(Array.from({ length: MAX_QUEUED }, (_, i) => frame(i)));
    await queuePlateFrames([frame(100), frame(101)]);
    const ids = usePlateFrameOutbox.getState().items.map((i) => i.id);
    expect(ids).toHaveLength(MAX_QUEUED);
    expect(ids.slice(0, 2)).toEqual(['f2', 'f3']);
    expect(ids.slice(-2)).toEqual(['f100', 'f101']);
    expect(mockDeleted).toEqual(['file:///tmp/plate-frames/f0.jpg', 'file:///tmp/plate-frames/f1.jpg']);
  });

  it('clearPlateFrameOutbox removes every waiting crop and its file', async () => {
    usePlateFrameOutbox.setState({ items: [frame(1)] });
    clearPlateFrameOutbox();
    expect(usePlateFrameOutbox.getState().items).toEqual([]);
    expect(mockDeleted).toEqual(['file:///tmp/plate-frames/f1.jpg']);
  });
});
