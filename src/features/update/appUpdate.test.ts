import { checkForUpdate, compareVersions, dismissRecommended, showsRecommended, updateNeed, useAppUpdate } from './appUpdate';
import { getVersionFlags as realGetVersionFlags } from '../../lib/api/appVersion';
import { track } from '../../lib/analytics';
import { supabase } from '../../lib/supabase';

jest.mock('expo-application', () => ({ nativeApplicationVersion: '4.0.7' }));
let mockBackend = true;
jest.mock('../../data/backend', () => ({ backendEnabled: () => mockBackend }));
jest.mock('../../lib/analytics', () => ({ ...jest.requireActual('../../lib/analytics'), track: jest.fn() }));
jest.mock('../../lib/api', () => ({ ensureSession: jest.fn(async () => 'u1'), getVersionFlags: jest.fn() }));
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
const api = jest.requireMock('../../lib/api') as { ensureSession: jest.Mock; getVersionFlags: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  mockBackend = true;
  useAppUpdate.setState({ need: 'none', dismissedOn: null });
});

describe('compareVersions', () => {
  it.each([
    ['4.0.10', '4.0.9', 1],
    ['4.0.9', '4.0.10', -1],
    ['4.0.7', '4.0.7', 0],
    ['4.1', '4.1.0', 0],
    ['4.1', '4.0.99', 1],
    ['10.0.0', '9.9.9', 1],
    ['3.1.1', '4.0.0', -1],
    [' 4.0.8 ', '4.0.8', 0],
  ] as const)('%s vs %s is %d', (a, b, want) => {
    expect(compareVersions(a, b)).toBe(want);
  });

  it.each([['4.0.x', '4.0.7'], ['', '4.0.7'], ['4.0.7', 'v4.0.8'], ['4..0', '4.0'], ['4.0.7-beta', '4.0.7']])('%s vs %s is unknown', (a, b) => {
    expect(compareVersions(a, b)).toBeNull();
  });
});

describe('updateNeed', () => {
  it('requires an update below the minimum, even when a recommended version is set', () => {
    expect(updateNeed('4.0.7', { min: '4.0.8', recommended: '4.1.0' })).toBe('required');
  });

  it('recommends between the minimum and the recommended version', () => {
    expect(updateNeed('4.0.9', { min: '4.0.8', recommended: '4.0.10' })).toBe('recommended');
  });

  it('asks nothing at or above both', () => {
    expect(updateNeed('4.0.10', { min: '4.0.9', recommended: '4.0.10' })).toBe('none');
  });

  it('never blocks on what it cannot read: no version installed, no rows, or a bad value', () => {
    expect(updateNeed(null, { min: '9.0.0', recommended: null })).toBe('none');
    expect(updateNeed('4.0.7', { min: null, recommended: null })).toBe('none');
    expect(updateNeed('4.0.7', { min: 'soon', recommended: null })).toBe('none');
  });
});

describe('checkForUpdate', () => {
  it('reads the flags with a session and blocks a binary below the minimum', async () => {
    api.getVersionFlags.mockResolvedValue({ min: '4.0.8', recommended: null });
    expect(await checkForUpdate()).toBe('required');
    expect(api.ensureSession).toHaveBeenCalledTimes(1);
    expect(useAppUpdate.getState().need).toBe('required');
    expect(track).toHaveBeenCalledWith('update_needed', { need: 'required', installed: '4.0.7' });
  });

  it('fails open: offline at launch leaves the app unblocked', async () => {
    api.getVersionFlags.mockRejectedValue(new Error('offline'));
    expect(await checkForUpdate()).toBe('none');
    expect(useAppUpdate.getState().need).toBe('none');
  });

  it('a failed session never blocks either', async () => {
    api.ensureSession.mockRejectedValueOnce(new Error('no network'));
    expect(await checkForUpdate()).toBe('none');
    expect(api.getVersionFlags).not.toHaveBeenCalled();
  });

  it('lifts the block on the next foreground once the minimum is lowered', async () => {
    useAppUpdate.setState({ need: 'required' });
    api.getVersionFlags.mockResolvedValue({ min: null, recommended: null });
    expect(await checkForUpdate()).toBe('none');
  });

  it('does nothing without a backend (dev mode)', async () => {
    mockBackend = false;
    expect(await checkForUpdate()).toBe('none');
    expect(api.getVersionFlags).not.toHaveBeenCalled();
  });
});

describe('the recommended sheet', () => {
  const day = new Date('2026-11-22T09:00:00Z');
  const later = new Date('2026-11-22T23:00:00Z');
  const tomorrow = new Date('2026-11-23T09:00:00Z');

  it('shows once a day: closed today, back tomorrow', () => {
    useAppUpdate.setState({ need: 'recommended' });
    expect(showsRecommended(useAppUpdate.getState(), day)).toBe(true);
    dismissRecommended(day);
    expect(track).toHaveBeenCalledWith('update_prompt_later', {});
    expect(showsRecommended(useAppUpdate.getState(), later)).toBe(false);
    expect(showsRecommended(useAppUpdate.getState(), tomorrow)).toBe(true);
  });

  it('never shows when nothing is recommended', () => {
    expect(showsRecommended({ need: 'none', dismissedOn: null }, day)).toBe(false);
  });
});

describe('getVersionFlags', () => {
  const from = supabase.from as jest.Mock;
  const rows = (data: unknown, error: unknown = null) => {
    const q: { select: jest.Mock; in: jest.Mock } = { select: jest.fn(() => q), in: jest.fn(async () => ({ data, error })) };
    from.mockReturnValue(q);
    return q;
  };

  it('reads both rows from feature_flags, the version in the note', async () => {
    const q = rows([
      { key: 'min_app_version', enabled: true, note: ' 4.0.8 ' },
      { key: 'recommended_app_version', enabled: true, note: '4.1.0' },
    ]);
    expect(await realGetVersionFlags()).toEqual({ min: '4.0.8', recommended: '4.1.0' });
    expect(from).toHaveBeenCalledWith('feature_flags');
    expect(q.in).toHaveBeenCalledWith('key', ['min_app_version', 'recommended_app_version']);
  });

  it('a disabled row, an empty note or a missing row counts as unset', async () => {
    rows([
      { key: 'min_app_version', enabled: false, note: '4.0.8' },
      { key: 'recommended_app_version', enabled: true, note: '' },
    ]);
    expect(await realGetVersionFlags()).toEqual({ min: null, recommended: null });
    rows([]);
    expect(await realGetVersionFlags()).toEqual({ min: null, recommended: null });
  });

  it('throws on an error, which the check turns into no block', async () => {
    rows(null, { message: 'permission denied', code: '42501' });
    await expect(realGetVersionFlags()).rejects.toThrow();
  });
});
