import * as SecureStore from 'expo-secure-store';
import type { SyncLiftInput } from '../lib/api';
import { flushLiftOutbox, queueLiftSync, useLiftOutbox } from './liftOutbox';
import { readFreeUsed, writeFreeUsed } from './freeLifts';

jest.mock('./backend', () => ({ backendEnabled: () => true }));
jest.mock('../lib/api', () => ({ syncLift: jest.fn() }));
jest.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));

const { syncLift } = jest.requireMock('../lib/api') as { syncLift: jest.Mock };
const { supabase } = jest.requireMock('../lib/supabase') as { supabase: { auth: { getSession: jest.Mock } } };

const LIFT: SyncLiftInput = {
  movement: 'snatch',
  loadKg: 70,
  made: true,
  cue: { faultId: 'early_arm_bend', text: 't', why: 'w' },
  noCueCode: null,
  startClass: null,
  yawBucket: null,
  analysisVersion: 'cv-2026.10.20',
  retestCueId: null,
  failureCode: null,
  analysedAt: '2026-10-20T09:00:00.000Z',
};

const online = () => supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });

beforeEach(() => {
  jest.clearAllMocks();
  useLiftOutbox.setState({ items: [], cues: [] });
  syncLift.mockResolvedValue({ status: 'done', cue_id: 'c1' });
});

describe('the lift outbox', () => {
  it('sends a queued lift once there is a session and keeps it, marked synced, for the offline library', async () => {
    online();
    expect(await queueLiftSync({ id: 'l1', lift: LIFT })).toBe(1);
    expect(syncLift).toHaveBeenCalledWith('l1', LIFT);
    expect(useLiftOutbox.getState().items).toEqual([{ id: 'l1', lift: LIFT, synced: true }]);
    expect(await flushLiftOutbox()).toBe(0);
    expect(syncLift).toHaveBeenCalledTimes(1);
  });

  it('waits with no session (no account, or offline at first launch) and sends on the next flush', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    expect(await queueLiftSync({ id: 'l1', lift: LIFT })).toBe(0);
    expect(syncLift).not.toHaveBeenCalled();
    online();
    expect(await flushLiftOutbox()).toBe(1);
    expect(useLiftOutbox.getState().items[0].synced).toBe(true);
  });

  it('stops at a network failure and keeps the order for the retry', async () => {
    online();
    useLiftOutbox.setState({ items: [{ id: 'l1', lift: LIFT }, { id: 'l2', lift: LIFT }] });
    syncLift.mockRejectedValueOnce(new Error('Network request failed'));
    expect(await flushLiftOutbox()).toBe(0);
    expect(syncLift).toHaveBeenCalledTimes(1);
    expect(useLiftOutbox.getState().items.map((i) => i.synced)).toEqual([undefined, undefined]);
    expect(await flushLiftOutbox()).toBe(2);
  });

  it('drops a lift the server will never take (another account owns the id) instead of resending it forever', async () => {
    online();
    useLiftOutbox.setState({ items: [{ id: 'l1', lift: LIFT }, { id: 'l2', lift: LIFT }] });
    syncLift.mockRejectedValueOnce(new Error('lift_conflict'));
    expect(await flushLiftOutbox()).toBe(2);
    expect(syncLift).toHaveBeenCalledTimes(2);
  });

  it('never queues the same lift twice', () => {
    useLiftOutbox.getState().add({ id: 'l1', lift: LIFT });
    useLiftOutbox.getState().add({ id: 'l1', lift: LIFT });
    expect(useLiftOutbox.getState().items).toHaveLength(1);
  });
});

describe('the Keychain free count', () => {
  beforeEach(() => (SecureStore as unknown as { __reset: () => void }).__reset());

  it('is 0 on a fresh phone and keeps what was written under catchline.free_used', async () => {
    expect(await readFreeUsed()).toBe(0);
    await writeFreeUsed(2);
    expect(await SecureStore.getItemAsync('catchline.free_used')).toBe('2');
    expect(await readFreeUsed()).toBe(2);
  });

  it('never goes down', async () => {
    await writeFreeUsed(3);
    await writeFreeUsed(1);
    expect(await readFreeUsed()).toBe(3);
  });

  it('reads junk as 0', async () => {
    await SecureStore.setItemAsync('catchline.free_used', 'abc');
    expect(await readFreeUsed()).toBe(0);
  });
});
