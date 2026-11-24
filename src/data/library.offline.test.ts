import { snatchMock } from '../analysis/fixtures';
import { useLibraryStore } from '../features/library/store';
import type { SyncLiftInput } from '../lib/api';
import { removeLift, syncLibrary } from './library';
import { useLiftOutbox } from './liftOutbox';
import { usePendingLifts } from './pendingLifts';
import { usePipeline, type Job } from './pipeline';
import { liftDetail } from '../features/library/derive';
import type { ClipSubmission } from '../features/capture/submit';

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

const SUB: ClipSubmission & { uri: string } = { uri: 'file:///b.mov', movement: 'snatch', loadKg: null, trim: { start: 0, end: 5 }, rep: 'all', source: 'library', fps: 30, overridden: [] };
const JOB: Job = { id: 'job-a', movement: 'snatch', status: 'analysing', liftId: 'a', prepared: 1, sent: 0, total: 0, uploadUrl: null, error: null, maxS: null, uri: 'file:///a.mov', device: true };

beforeEach(() => {
  jest.clearAllMocks();
  usePendingLifts.setState({ items: [] });
  usePipeline.getState().clear();
  useLiftOutbox.setState({ items: [{ id: 'l1', lift: LIFT }] });
  local.listLocalAnalyses.mockResolvedValue([{ liftId: 'l1', analysis: { ...snatchMock, id: 'l1' } }]);
});

describe('the library in airplane mode (3.1)', () => {
  it('lists the lifts analysed on this phone with no server at all', async () => {
    api.ensureSession.mockRejectedValue(new Error('Network request failed'));
    await syncLibrary(new Date('2026-10-20T10:00:00Z'));
    const { lifts, sessions, cues } = useLibraryStore.getState();
    expect(lifts.map((l) => [l.id, l.status, l.loadKg, l.date])).toEqual([['l1', 'done', 70, '2026-10-20']]);
    expect([sessions, cues]).toEqual([[], []]);
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

  it('drops a synced lift the server no longer lists (deleted on another phone): it does not come back from the outbox (#206)', async () => {
    useLiftOutbox.setState({ items: [{ id: 'l1', lift: LIFT, synced: true }, { id: 'l2', lift: { ...LIFT, analysedAt: '2026-10-20T09:10:00.000Z' } }] });
    local.listLocalAnalyses.mockResolvedValue([
      { liftId: 'l1', analysis: { ...snatchMock, id: 'l1' } },
      { liftId: 'l2', analysis: { ...snatchMock, id: 'l2' } },
    ]);
    api.ensureSession.mockResolvedValue('u1');
    api.listLifts.mockResolvedValue([]);
    await syncLibrary(new Date('2026-10-20T10:00:00Z'));
    // l2 was never synced: it is this phone's and waits to go up
    expect(useLibraryStore.getState().lifts.map((l) => l.id)).toEqual(['l2']);
    expect(useLiftOutbox.getState().items.map((i) => i.id)).toEqual(['l2']);
    await syncLibrary(new Date('2026-10-20T10:00:00Z'));
    expect(useLibraryStore.getState().lifts.map((l) => l.id)).toEqual(['l2']);
  });

  it('keeps a lift that finished syncing while the server list was on its way: the list was asked before it', async () => {
    useLiftOutbox.setState({ items: [{ id: 'l1', lift: LIFT }] });
    local.listLocalAnalyses.mockResolvedValue([{ liftId: 'l1', analysis: { ...snatchMock, id: 'l1' } }]);
    api.ensureSession.mockResolvedValue('u1');
    // the answer does not hold l1; it is marked synced after the list was asked for and before it came back
    api.listLifts.mockImplementation(async () => {
      useLiftOutbox.getState().markSynced('l1');
      return [];
    });
    await syncLibrary(new Date('2026-10-20T10:00:00Z'));
    expect(useLiftOutbox.getState().items.map((i) => i.id)).toEqual(['l1']);
    expect(useLibraryStore.getState().lifts.map((l) => l.id)).toEqual(['l1']);
  });

  it('keeps a synced lift older than a full page of server lifts: the server just did not list that far back', async () => {
    useLiftOutbox.setState({ items: [{ id: 'l1', lift: { ...LIFT, analysedAt: '2026-01-01T09:00:00.000Z' }, synced: true }] });
    api.ensureSession.mockResolvedValue('u1');
    const page = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, user_id: 'u1', movement: 'snatch', load_kg: 70, status: 'done', error: null, created_at: `2026-10-${String(i % 28 + 1).padStart(2, '0')}T09:00:00Z` }));
    api.listLifts.mockResolvedValue(page);
    await syncLibrary(new Date('2026-10-30T10:00:00Z'));
    expect(useLiftOutbox.getState().items.map((i) => i.id)).toEqual(['l1']);
    expect(useLibraryStore.getState().lifts.map((l) => l.id)).toContain('l1');
  });

  it('keeps every lift when the server could not be asked (offline)', async () => {
    useLiftOutbox.setState({ items: [{ id: 'l1', lift: LIFT, synced: true }] });
    api.ensureSession.mockResolvedValue('u1');
    api.listLifts.mockRejectedValue(new Error('Network request failed'));
    await syncLibrary(new Date('2026-10-20T10:00:00Z'));
    expect(useLibraryStore.getState().lifts.map((l) => l.id)).toEqual(['l1']);
    expect(useLiftOutbox.getState().items).toHaveLength(1);
  });

  it('lists a lift waiting behind the one tracking as waiting, and not the one tracking (the in-flight bar has it) (#252)', async () => {
    api.ensureSession.mockRejectedValue(new Error('Network request failed'));
    usePipeline.getState().start({ ...JOB, liftId: 'a' });
    usePendingLifts.setState({ items: [{ liftId: 'a', sub: SUB, at: '2026-10-20T09:30:00.000Z' }, { liftId: 'b', sub: { ...SUB, loadKg: 60 }, at: '2026-10-20T09:31:00.000Z' }] });
    await syncLibrary(new Date('2026-10-20T10:00:00Z'));
    const lifts = useLibraryStore.getState().lifts;
    expect(lifts.map((l) => [l.id, l.status, l.waiting ?? false, l.loadKg, l.at])).toEqual([
      ['b', 'processing', true, 60, '2026-10-20T09:31:00.000Z'],
      ['l1', 'done', false, 70, '2026-10-20T09:00:00.000Z'],
    ]);
    expect(liftDetail(lifts[0])).toBe('waiting · tracks after the lift in progress');
  });

  it('lists a clip saved at the weekly cap as queued, the row that opens the paywall (#247)', async () => {
    api.ensureSession.mockRejectedValue(new Error('Network request failed'));
    usePendingLifts.setState({ items: [{ liftId: 'h', sub: SUB, at: '2026-10-20T09:40:00.000Z', held: true }] });
    await syncLibrary(new Date('2026-10-20T10:00:00Z'));
    const lifts = useLibraryStore.getState().lifts;
    expect(lifts.map((l) => [l.id, l.status, l.waiting ?? false])).toEqual([
      ['h', 'queued', false],
      ['l1', 'done', false],
    ]);
    expect(liftDetail(lifts[0])).toBe('Queued · free videos used');
  });

  it('deletes a waiting lift from the phone only: it never reached the server or Documents', async () => {
    usePendingLifts.setState({ items: [{ liftId: 'b', sub: SUB, at: '2026-10-20T09:31:00.000Z' }] });
    await removeLift('b');
    expect(usePendingLifts.getState().items).toEqual([]);
    expect(api.deleteLift).not.toHaveBeenCalled();
    expect(local.deleteLocalLift).not.toHaveBeenCalled();
  });

  it('deletes a synced lift on the server first, and keeps it whole if that fails', async () => {
    useLiftOutbox.setState({ items: [{ id: 'l1', lift: LIFT, synced: true }] });
    api.deleteLift.mockRejectedValueOnce(new Error('offline'));
    await expect(removeLift('l1')).rejects.toThrow('offline');
    expect(local.deleteLocalLift).not.toHaveBeenCalled();
    expect(useLiftOutbox.getState().items).toHaveLength(1);
  });
});
