import { flushProblemReports, queueProblemReport, reportDetails, useProblemReports } from './problemReports';

jest.mock('./backend', () => ({ backendEnabled: () => true }));
jest.mock('../lib/api', () => ({ ensureSession: jest.fn(), sendProblemReport: jest.fn() }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `report-${++n}` };
});
jest.mock('expo-device', () => ({ modelId: 'iPhone16,1', modelName: 'iPhone 15 Pro', osName: 'iOS', osVersion: '26.1' }));
jest.mock('expo-updates', () => ({ updateId: 'ota-42' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '3.1' } } }));

const api = jest.requireMock('../lib/api') as { ensureSession: jest.Mock; sendProblemReport: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  useProblemReports.setState({ items: [] });
  api.ensureSession.mockResolvedValue('u1');
});

describe('problem reports', () => {
  it('attaches the app version, OTA id and device', () => {
    expect(reportDetails()).toEqual({ appVersion: '3.1', updateId: 'ota-42', device: 'iPhone16,1 iOS 26.1' });
  });

  it('sends a report straight away when online, with the lift it was filed from', async () => {
    api.sendProblemReport.mockResolvedValue(undefined);
    expect(await queueProblemReport({ body: '  Stuck on processing  ', liftId: 'lift-9', context: 'Snatch' })).toBe(1);
    expect(api.sendProblemReport).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Stuck on processing', liftId: 'lift-9', context: 'Snatch', appVersion: '3.1', updateId: 'ota-42' })
    );
    expect(useProblemReports.getState().items).toEqual([]);
  });

  it('keeps a report queued offline and sends it on the next flush', async () => {
    api.ensureSession.mockRejectedValueOnce(new Error('Network request failed'));
    expect(await queueProblemReport({ body: 'Crash on trim' })).toBe(0);
    expect(useProblemReports.getState().items.map((i) => [i.body, i.liftId])).toEqual([['Crash on trim', null]]);

    api.sendProblemReport.mockResolvedValue(undefined);
    expect(await flushProblemReports()).toBe(1);
    expect(useProblemReports.getState().items).toEqual([]);
  });

  it('stops at the first failed send and keeps the rest in order', async () => {
    useProblemReports.setState({
      items: ['a', 'b', 'c'].map((id) => ({ id, body: id, appVersion: '3.1', updateId: 'x', device: 'd', liftId: null, context: null, reportedAt: '2026-10-23T00:00:00.000Z' })),
    });
    api.sendProblemReport.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));
    expect(await flushProblemReports()).toBe(1);
    expect(useProblemReports.getState().items.map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('does not open a session when nothing is waiting', async () => {
    expect(await flushProblemReports()).toBe(0);
    expect(api.ensureSession).not.toHaveBeenCalled();
  });
});
