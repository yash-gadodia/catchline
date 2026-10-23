import type { ErrorEvent } from '@sentry/react-native';

let Sentry: typeof import('@sentry/react-native');
let init: jest.Mock;

beforeEach(() => {
  jest.resetModules();
  Sentry = require('@sentry/react-native');
  init = Sentry.init as jest.Mock;
});

function load(): typeof import('./sentry') {
  return require('./sentry');
}

describe('sentry', () => {
  it('stays off without a DSN and sends nothing', () => {
    const s = load();
    expect(s.initSentry(undefined)).toBe(false);
    s.reportError(new Error('x'));
    expect(init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('turns on with a DSN, with no PII, screenshots or tracing, and tags the build', () => {
    const s = load();
    expect(s.initSentry('https://k@o1.ingest.sentry.io/1')).toBe(true);
    const opts = init.mock.calls[0][0];
    expect(opts).toMatchObject({
      dsn: 'https://k@o1.ingest.sentry.io/1',
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      enableAppHangTracking: true,
      tracesSampleRate: 0,
    });
    expect(Sentry.setTags).toHaveBeenCalledWith(
      { app_version: 'unknown', update_id: 'mock', runtime_version: 'mock', channel: 'mock' },
    );
  });

  it('drops the user and tags the device model on every event', () => {
    const s = load();
    s.initSentry('https://k@o1.ingest.sentry.io/1');
    const { beforeSend } = init.mock.calls[0][0];
    const event = { user: { id: 'u1' }, contexts: { device: { model: 'iPhone16,1' } }, tags: { a: 'b' } } as unknown as ErrorEvent;
    expect(beforeSend(event)).toEqual({ contexts: { device: { model: 'iPhone16,1' } }, tags: { a: 'b', device_model: 'iPhone16,1' } });
  });
});
