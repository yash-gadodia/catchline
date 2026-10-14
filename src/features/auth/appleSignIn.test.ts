import * as AppleAuthentication from 'expo-apple-authentication';
import { appleDisplayName, isAppleCancel, signInWithApple, signOut } from './appleSignIn';
import { NO_USER, syncAuthUser, startAuthUserSync, useAuthUser } from './authUser';
import { usePurchases } from '../purchases/usePurchases';
import { syncLibrary } from '../../data/library';

jest.mock('../../data/library', () => ({ syncLibrary: jest.fn(() => Promise.resolve()) }));

// Chainable thenable: update().eq() resolves, select().eq().maybeSingle() reads the name.
const mockProfileQuery = {
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(() => Promise.resolve({ data: { display_name: 'Alex Tan' }, error: null })),
  then: (resolve: (v: { data: null; error: null }) => unknown) => resolve({ data: null, error: null }),
};

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => mockProfileQuery),
    rpc: jest.fn(),
    auth: {
      getSession: jest.fn(),
      signInWithIdToken: jest.fn(),
      signOut: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
  },
}));

import { supabase } from '../../lib/supabase';

const mockRpc = supabase.rpc as jest.Mock;
const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockSignInWithIdToken = supabase.auth.signInWithIdToken as jest.Mock;
const mockSignOut = supabase.auth.signOut as jest.Mock;
const mockSignInAsync = AppleAuthentication.signInAsync as jest.Mock;
const appleSession = { user: { id: 'apple-1', is_anonymous: false } };

beforeEach(() => {
  jest.clearAllMocks();
  useAuthUser.setState(NO_USER, true);
  usePurchases.setState({ tier: 'free' });
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockSignInWithIdToken.mockResolvedValue({ data: { user: { id: 'apple-1' }, session: appleSession }, error: null });
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockSignOut.mockResolvedValue({ error: null });
  mockSignInAsync.mockResolvedValue({ identityToken: 'apple-id-token', fullName: null, email: null });
});

describe('signInWithApple', () => {
  it('sends Apple the hashed nonce and Supabase the raw one', async () => {
    const result = await signInWithApple();
    const [{ nonce: hashed }] = mockSignInAsync.mock.calls[0];
    const [{ nonce: raw, provider, token }] = mockSignInWithIdToken.mock.calls[0];
    expect(provider).toBe('apple');
    expect(token).toBe('apple-id-token');
    expect(raw).toHaveLength(64);
    expect(hashed).toBe(require('crypto').createHash('sha256').update(raw).digest('hex'));
    expect(result).toEqual({ cancelled: false, userId: 'apple-1', transferred: false });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(useAuthUser.getState()).toEqual({ userId: 'apple-1', anonymous: false, displayName: 'Alex Tan' });
  });

  it('moves an anonymous account: begin before Apple, complete after the new session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'anon-1', is_anonymous: true } } } });
    mockRpc.mockImplementation((fn: string) =>
      Promise.resolve(fn === 'begin_account_transfer' ? { data: 'token-1', error: null } : { data: { lifts: 2 }, error: null })
    );
    const result = await signInWithApple();
    expect(mockRpc.mock.calls).toEqual([['begin_account_transfer'], ['complete_account_transfer', { p_token: 'token-1' }]]);
    expect(mockRpc.mock.invocationCallOrder[0]).toBeLessThan(mockSignInAsync.mock.invocationCallOrder[0]);
    expect(mockRpc.mock.invocationCallOrder[1]).toBeGreaterThan(mockSignInWithIdToken.mock.invocationCallOrder[0]);
    expect(result).toEqual({ cancelled: false, userId: 'apple-1', transferred: true });
    expect(syncLibrary).toHaveBeenCalledTimes(1);
    expect((syncLibrary as jest.Mock).mock.invocationCallOrder[0]).toBeGreaterThan(mockRpc.mock.invocationCallOrder[1]);
  });

  it('still signs in when there is nothing to move (begin fails)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'anon-1', is_anonymous: true } } } });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_anonymous' } });
    const result = await signInWithApple();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ cancelled: false, userId: 'apple-1', transferred: false });
  });

  it('stores the Apple-given name on the profile', async () => {
    mockSignInAsync.mockResolvedValue({
      identityToken: 'apple-id-token',
      fullName: { givenName: 'Alex', familyName: 'Tan', middleName: null, namePrefix: null, nameSuffix: null, nickname: null },
      email: null,
    });
    await signInWithApple();
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(mockProfileQuery.update).toHaveBeenCalledWith({ display_name: 'Alex Tan' });
    expect(mockProfileQuery.eq).toHaveBeenCalledWith('id', 'apple-1');
  });

  it('restores purchases so a paid anonymous plan follows the Apple user', async () => {
    usePurchases.setState({ tier: 'pull' });
    const restore = jest.fn(() => Promise.resolve('pull' as const));
    usePurchases.setState({ restore });
    await signInWithApple();
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('reports a cancel instead of throwing', async () => {
    mockSignInAsync.mockRejectedValue(Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' }));
    expect(await signInWithApple()).toEqual({ cancelled: true });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('throws when Apple returns no identity token or Supabase rejects it', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: null, fullName: null, email: null });
    await expect(signInWithApple()).rejects.toThrow('Apple returned no identity token');
    mockSignInAsync.mockResolvedValue({ identityToken: 'apple-id-token', fullName: null, email: null });
    mockSignInWithIdToken.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'bad nonce' } });
    await expect(signInWithApple()).rejects.toThrow('bad nonce');
  });
});

describe('signOut', () => {
  it('ends the session and returns the local user to anonymous', async () => {
    useAuthUser.setState({ userId: 'apple-1', anonymous: false, displayName: 'Alex Tan' });
    await signOut();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(useAuthUser.getState()).toEqual(NO_USER);
  });

  it('throws when the server refuses', async () => {
    mockSignOut.mockResolvedValue({ error: { message: 'network down' } });
    await expect(signOut()).rejects.toThrow('network down');
  });
});

describe('auth user sync', () => {
  it('keeps an anonymous session anonymous without reading the profile', async () => {
    await syncAuthUser({ user: { id: 'anon-1', is_anonymous: true } } as never);
    expect(useAuthUser.getState()).toEqual({ userId: 'anon-1', anonymous: true, displayName: null });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('follows auth state changes', async () => {
    const unsubscribe = jest.fn();
    let listener: (event: string, session: unknown) => void = () => undefined;
    (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation((cb) => {
      listener = cb;
      return { data: { subscription: { unsubscribe } } };
    });
    const stop = startAuthUserSync();
    listener('SIGNED_IN', appleSession);
    await new Promise((r) => setTimeout(r, 0));
    expect(useAuthUser.getState()).toEqual({ userId: 'apple-1', anonymous: false, displayName: 'Alex Tan' });
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('builds the display name from the Apple parts', () => {
    expect(appleDisplayName({ givenName: 'Alex', familyName: null } as never)).toBe('Alex');
    expect(appleDisplayName({ givenName: null, familyName: null } as never)).toBeNull();
    expect(appleDisplayName(null)).toBeNull();
    expect(isAppleCancel({ code: 'ERR_REQUEST_CANCELED' })).toBe(true);
    expect(isAppleCancel(new Error('x'))).toBe(false);
  });
});
