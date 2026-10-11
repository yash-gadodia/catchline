import { init, identify, reset, track, captureError, EVENTS } from './analytics';

// Restore module state between tests by re-importing fresh each time
// Since jest caches modules, we reset the module between tests that need
// a clean slate via jest.resetModules() + re-require.

const mockSetItem = jest.fn((_key: string, _value: string) => Promise.resolve());
const mockGetItem = jest.fn((_key: string): Promise<string | null> => Promise.resolve(null));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: (key: string, value: string) => mockSetItem(key, value),
  getItem: (key: string) => mockGetItem(key),
}));

beforeEach(() => {
  jest.resetModules();
  mockSetItem.mockClear();
  mockGetItem.mockClear();
  // Reset env so each test starts clean
  delete process.env.EXPO_PUBLIC_ANALYTICS_KEY;
  delete process.env.EXPO_PUBLIC_ANALYTICS_HOST;
  global.fetch = jest.fn(() => Promise.resolve(new Response(null, { status: 200 })));
});

describe('analytics — disabled mode (no key)', () => {
  it('init without a key leaves analytics disabled', () => {
    const { init: initFn, track: trackFn } = require('./analytics');
    initFn();
    trackFn(EVENTS.APP_OPEN);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('track does not throw and does not fetch when disabled', () => {
    const { init: initFn, track: trackFn } = require('./analytics');
    initFn();
    expect(() => trackFn(EVENTS.PAYWALL_VIEWED, { offline: true })).not.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('identify does not throw and does not fetch when disabled', () => {
    const { init: initFn, identify: identifyFn } = require('./analytics');
    initFn();
    expect(() => identifyFn('user-123')).not.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('captureError does not throw and does not fetch when disabled', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { init: initFn, captureError: captureErrorFn } = require('./analytics');
    initFn();
    expect(() => captureErrorFn(new Error('boom'), { screen: 'test' })).not.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('reset does not throw when disabled', () => {
    const { init: initFn, reset: resetFn } = require('./analytics');
    initFn();
    expect(() => resetFn()).not.toThrow();
  });
});

describe('analytics — enabled mode (key set)', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_ANALYTICS_KEY = 'test-api-key';
    // Simulate a stored anon_id so AsyncStorage.getItem returns one
    mockGetItem.mockResolvedValue('stored-anon-id');
  });

  it('track POSTs to the default PostHog endpoint with correct shape', async () => {
    const { init: initFn, track: trackFn } = require('./analytics');
    initFn();
    trackFn(EVENTS.APP_OPEN);

    // track is fire-and-forget via getOrCreateAnonId (async); flush microtasks
    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://us.i.posthog.com/capture');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.api_key).toBe('test-api-key');
    expect(body.event).toBe(EVENTS.APP_OPEN);
    expect(body.properties).toBeDefined();
  });

  it('track uses a custom host when EXPO_PUBLIC_ANALYTICS_HOST is set', async () => {
    process.env.EXPO_PUBLIC_ANALYTICS_HOST = 'https://my.posthog.io';
    const { init: initFn, track: trackFn } = require('./analytics');
    initFn();
    trackFn(EVENTS.SIGNUP_STARTED);

    await Promise.resolve();
    await Promise.resolve();

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://my.posthog.io/capture');
  });

  it('track includes extra props in the body', async () => {
    const { init: initFn, track: trackFn } = require('./analytics');
    initFn();
    trackFn(EVENTS.PAYWALL_VIEWED, { offline: true });

    await Promise.resolve();
    await Promise.resolve();

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.properties.offline).toBe(true);
  });

  it('captureError POSTs an $exception event', async () => {
    const { init: initFn, captureError: captureErrorFn } = require('./analytics');
    initFn();
    captureErrorFn(new Error('kaboom'), { screen: 'reveal' });

    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.event).toBe('$exception');
    expect(body.properties.$exception_message).toBe('kaboom');
    expect(body.properties.screen).toBe('reveal');
  });

  it('identify POSTs an $identify event', async () => {
    const { init: initFn, identify: identifyFn } = require('./analytics');
    initFn();
    identifyFn('uid-abc');

    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.event).toBe('$identify');
    expect(body.properties.$set.user_id).toBe('uid-abc');
  });

  it('fetch errors are swallowed and do not throw', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network error'));
    const { init: initFn, track: trackFn } = require('./analytics');
    initFn();
    expect(() => trackFn(EVENTS.PAYWALL_VIEWED)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    // No unhandled rejection — test passes cleanly
  });
});

describe('EVENTS constant', () => {
  it('exports all required event names', () => {
    expect(EVENTS.APP_OPEN).toBe('app_open');
    expect(EVENTS.SIGNUP_STARTED).toBe('signup_started');
    expect(EVENTS.SIGNUP_COMPLETED).toBe('signup_completed');
    expect(EVENTS.PAYWALL_VIEWED).toBe('paywall_viewed');
    expect(EVENTS.PURCHASE_COMPLETED).toBe('purchase_completed');
    expect(EVENTS.ACCOUNT_DELETED).toBe('account_deleted');
  });
});
