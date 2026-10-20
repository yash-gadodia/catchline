import AsyncStorage from '@react-native-async-storage/async-storage';
import { snatchMock } from '../analysis/fixtures';
import { MOVED_KEY, moveServerAnalysesToDevice } from './migrateToDevice';

jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...p: (string | { uri: string })[]) {
      this.uri = p.map((x) => (typeof x === 'string' ? x : x.uri)).join('/');
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(...p: (string | { uri: string })[]) {
      this.uri = p.map((x) => (typeof x === 'string' ? x : x.uri)).join('/');
    }
    static downloadFileAsync = jest.fn(async (_url: string, dest: File) => dest);
  }
  return { __esModule: true, Directory, File, Paths: { cache: new Directory('file:///cache') } };
});
jest.mock('./onDeviceAnalysis', () => ({ onDeviceAnalysisEnabled: jest.fn(() => true) }));
jest.mock('./localLifts', () => ({ hasLocalLift: jest.fn(() => false), saveLocalLift: jest.fn() }));
jest.mock('../lib/api', () => ({
  ensureSession: jest.fn(async () => undefined),
  listAnalyses: jest.fn(async () => []),
  signedTraceUrl: jest.fn(async () => 'https://x/trace?token=t'),
  deleteServerAnalyses: jest.fn(async () => 2),
}));
jest.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'u1' } } })) } },
}));

import { File } from 'expo-file-system';
import { deleteServerAnalyses, listAnalyses, signedTraceUrl } from '../lib/api';
import { hasLocalLift, saveLocalLift } from './localLifts';
import { onDeviceAnalysisEnabled } from './onDeviceAnalysis';

const download = (File as unknown as { downloadFileAsync: jest.Mock }).downloadFileAsync;

const serverAnalysis = {
  ...snatchMock,
  id: 'lift-1',
  reps: [
    {
      ...snatchMock.reps[0],
      keyFrames: [
        { ...snatchMock.reps[0].keyFrames[0], image: 'https://x/sign/u1/lift-1/r1-1-setup.jpg?token=abc' },
        { ...snatchMock.reps[0].keyFrames[1], image: undefined },
      ],
    },
  ],
};

beforeEach(async () => {
  jest.clearAllMocks();
  (hasLocalLift as jest.Mock).mockImplementation(() => false);
  await AsyncStorage.clear();
});

describe('moveServerAnalysesToDevice', () => {
  it('downloads every still and the trace of each server analysis, saves it locally, then has the server forget them', async () => {
    (listAnalyses as jest.Mock).mockResolvedValueOnce([{ liftId: 'lift-1', analysis: serverAnalysis }]);
    const out = await moveServerAnalysesToDevice();
    expect(out).toEqual({ moved: 1, deleted: 2 });
    expect(download).toHaveBeenCalledTimes(2);
    expect(download.mock.calls[0][0]).toBe('https://x/sign/u1/lift-1/r1-1-setup.jpg?token=abc');
    expect(download.mock.calls[0][1].uri).toBe('file:///cache/server-analyses/lift-1-r1-1-setup.jpg');
    expect(signedTraceUrl).toHaveBeenCalledWith('u1', 'lift-1');
    expect(download.mock.calls[1][0]).toBe('https://x/trace?token=t');
    expect(saveLocalLift).toHaveBeenCalledWith(
      'lift-1',
      expect.objectContaining({ reps: [expect.objectContaining({ keyFrames: [expect.objectContaining({ image: 'r1-1-setup.jpg' }), expect.objectContaining({ image: undefined })] })] }),
      'file:///cache/server-analyses/lift-1.json.gz',
      { 'r1-1-setup.jpg': 'file:///cache/server-analyses/lift-1-r1-1-setup.jpg' }
    );
    expect(deleteServerAnalyses).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(MOVED_KEY)).toBe('1');
  });

  it('skips a lift already on the phone and saves without a trace when the server has none', async () => {
    (listAnalyses as jest.Mock).mockResolvedValueOnce([
      { liftId: 'lift-1', analysis: serverAnalysis },
      { liftId: 'lift-2', analysis: { ...serverAnalysis, id: 'lift-2', reps: [] } },
    ]);
    (hasLocalLift as jest.Mock).mockImplementation((id: string) => id === 'lift-1');
    (signedTraceUrl as jest.Mock).mockResolvedValueOnce(null);
    const out = await moveServerAnalysesToDevice();
    expect(out).toEqual({ moved: 1, deleted: 2 });
    expect(saveLocalLift).toHaveBeenCalledTimes(1);
    expect(saveLocalLift).toHaveBeenCalledWith('lift-2', expect.objectContaining({ id: 'lift-2' }), null, {});
    expect(download).not.toHaveBeenCalled();
  });

  it('runs once: a second launch does nothing', async () => {
    await moveServerAnalysesToDevice();
    expect(await moveServerAnalysesToDevice()).toBeNull();
    expect(deleteServerAnalyses).toHaveBeenCalledTimes(1);
  });

  it('is not marked done when a download fails, so the next launch tries again', async () => {
    (listAnalyses as jest.Mock).mockResolvedValueOnce([{ liftId: 'lift-1', analysis: serverAnalysis }]);
    download.mockRejectedValueOnce(new Error('offline'));
    await expect(moveServerAnalysesToDevice()).rejects.toThrow('offline');
    expect(deleteServerAnalyses).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(MOVED_KEY)).toBeNull();
  });

  it('does nothing with the flag off', async () => {
    (onDeviceAnalysisEnabled as jest.Mock).mockReturnValueOnce(false);
    expect(await moveServerAnalysesToDevice()).toBeNull();
    expect(listAnalyses).not.toHaveBeenCalled();
  });
});
