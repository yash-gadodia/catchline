import { flushContactEmail, leaveContactEmail, useContact, validEmail } from './contact';

jest.mock('./backend', () => ({ backendEnabled: () => true }));
jest.mock('../lib/api', () => ({ ensureSession: jest.fn().mockResolvedValue('u1'), setContactEmail: jest.fn() }));
jest.mock('../lib/analytics', () => ({ ...jest.requireActual('../lib/analytics'), track: jest.fn() }));
const api = jest.requireMock('../lib/api') as { setContactEmail: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  useContact.setState({ email: '', synced: false });
});

describe('the email a lifter leaves for a reply', () => {
  it('takes an address and nothing else', () => {
    expect(validEmail(' lifter@example.com ')).toBe(true);
    expect(validEmail('lifter@example')).toBe(false);
    expect(validEmail('not an email')).toBe(false);
    expect(validEmail('')).toBe(false);
  });

  it('is saved lower-cased, sent, and counted without the address itself', async () => {
    api.setContactEmail.mockResolvedValue(undefined);
    expect(await leaveContactEmail(' Lifter@Example.com ')).toBe(true);
    expect(api.setContactEmail).toHaveBeenCalledWith('lifter@example.com');
    expect(useContact.getState()).toEqual({ email: 'lifter@example.com', synced: true });
    const { track } = jest.requireMock('../lib/analytics') as { track: jest.Mock };
    expect(track).toHaveBeenCalledWith('contact_email_left', {});
  });

  it('keeps an address that did not reach the server and sends it again later, once', async () => {
    api.setContactEmail.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    expect(await leaveContactEmail('a@b.co')).toBe(false);
    expect(useContact.getState().synced).toBe(false);
    expect(await flushContactEmail()).toBe(true);
    expect(await flushContactEmail()).toBe(true);
    expect(api.setContactEmail).toHaveBeenCalledTimes(2);
  });

  it('ignores a bad address', async () => {
    expect(await leaveContactEmail('nope')).toBe(false);
    expect(api.setContactEmail).not.toHaveBeenCalled();
  });
});
