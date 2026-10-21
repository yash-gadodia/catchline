import { snatchMock } from '../analysis/fixtures';
import { useLibraryStore } from '../features/library/store';
import type { SyncLiftInput } from '../lib/api';
import { removeLift, syncLibrary } from './library';
import { useLiftOutbox } from './liftOutbox';

jest.mock('../lib/api', () => ({
  ensureSession: jest.fn(),
  listLifts: jest.fn(),
  listCues: jest.fn(),
  deleteLift: jest.fn(),
  syncLift: jest.fn(),
}));
jest.mock('./localLifts', () => ({ listLocalAnalyses: jest.fn(), deleteLocalLift: jest.fn() }));
jest.mock('./liftOutbox', () => {
  const actual = jest.requireActual('./liftOutbox');
  return { ...actual, flushLiftOutbox: jest.fn(async () => 0) };
});

const api = jest.requireMock('../lib/api') as Record<'ensureSession' | 'listLifts' | 'listCues' | 'deleteLift', jest.Mock>;
const local = jest.requireMock('./localLifts') as Record<'listLocalAnalyses' | 'deleteLocalLift', jest.Mock>;

const LIFT: SyncLiftInput = {
  movement: 'snatch',
  loadKg: 70,
  made: true,
  cue: null,
  noCueCode: null,
  startClass: null,
  yawBucket: null,
  analysisVersion: null,
  retestCueId: null,
  failureCode: null,
  analysedAt: '2026-10-20T09:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  useLiftOutbox.setState({ items: [{ id: 'l1', lift: LIFT }], cues: [] });
  local.listLocalAnalyses.mockResolvedValue([{ liftId: 'l1', analysis: { ...snatchMock, id: 'l1' } }]);
});

describe('the library in airplane mode (3.1)', () => {
  it('lists the lifts analysed on this phone with no server at all', async () => {
    api.ensureSession.mockRejectedValue(new Error('Network request failed'));
    await syncLibrary(new Date('2026-10-20T10:00:00Z'));
    const { lifts, sessions } = useLibraryStore.getState();
    expect(lifts.map((l) => [l.id, l.status, l.loadKg, l.date])).toEqual([['l1', 'done', 70, '2026-10-20']]);
    expect(sessions.map((s) => s.liftId)).toEqual(['l1']);
  });

  it('online, lists a synced lift once, from the server row', async () => {
    api.ensureSession.mockResolvedValue('u1');
    api.listLifts.mockResolvedValue([
      { id: 'l1', user_id: 'u1', movement: 'snatch', load_kg: 70, status: 'done', error: null, created_at: '2026-10-20T09:00:00Z', retest_cue_id: null, cue_id: null },
    ]);
    api.listCues.mockResolvedValue([]);
    await syncLibrary(new Date('2026-10-20T10:00:00Z'));
    expect(useLibraryStore.getState().lifts.map((l) => l.id)).toEqual(['l1']);
  });

  it('deletes an unsynced lift on the phone only', async () => {
    await removeLift('l1');
    expect(api.deleteLift).not.toHaveBeenCalled();
    expect(local.deleteLocalLift).toHaveBeenCalledWith('l1');
    expect(useLiftOutbox.getState().items).toEqual([]);
  });

  it('deletes a synced lift on the server first, and keeps it whole if that fails', async () => {
    useLiftOutbox.setState({ items: [{ id: 'l1', lift: LIFT, synced: true }] });
    api.deleteLift.mockRejectedValueOnce(new Error('offline'));
    await expect(removeLift('l1')).rejects.toThrow('offline');
    expect(local.deleteLocalLift).not.toHaveBeenCalled();
    expect(useLiftOutbox.getState().items).toHaveLength(1);
  });
});
