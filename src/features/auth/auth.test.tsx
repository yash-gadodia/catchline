import { Session } from '@supabase/supabase-js';
import { render, act } from '@testing-library/react-native';
import React from 'react';
import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  signInWithGoogle,
  verifyEmailOtp,
  resendConfirmationEmail,
  requestPasswordReset,
  updatePassword,
  isValidEmail,
  humanAuthError,
} from './authActions';
import { useSession } from './useSession';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      signInWithIdToken: jest.fn(),
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      verifyOtp: jest.fn(),
      setSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      resend: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
    },
  },
}));

import { supabase } from '../../lib/supabase';

const mockSupabase = supabase as any;

describe('Auth Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('signInWithEmail', () => {
    it('calls signInWithPassword with correct arguments', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      } as any);

      await signInWithEmail('test@example.com', 'password123');

      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('throws error when signInWithPassword fails', async () => {
      const mockError = new Error('Invalid credentials');
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: null,
        error: mockError,
      } as any);

      await expect(signInWithEmail('test@example.com', 'wrong')).rejects.toThrow(
        'Invalid credentials'
      );
    });
  });

  describe('signUpWithEmail', () => {
    it('calls signUp with email, password, and display_name in options.data', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      } as any);

      await signUpWithEmail('new@example.com', 'password123', 'John Doe');

      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'password123',
        options: {
          data: {
            display_name: 'John Doe',
          },
          emailRedirectTo: 'catchline://auth-callback',
        },
      });
    });

    it('throws error when signUp fails', async () => {
      const mockError = new Error('Email already exists');
      mockSupabase.auth.signUp.mockResolvedValue({
        data: null,
        error: mockError,
      } as any);

      await expect(
        signUpWithEmail('existing@example.com', 'password123', 'Jane Doe')
      ).rejects.toThrow('Email already exists');
    });
  });

  describe('verifyEmailOtp', () => {
    it('verifies the confirmation token_hash as a signup OTP', async () => {
      mockSupabase.auth.verifyOtp.mockResolvedValue({ error: null } as any);

      await verifyEmailOtp('abc123hash');

      expect(mockSupabase.auth.verifyOtp).toHaveBeenCalledWith({
        token_hash: 'abc123hash',
        type: 'signup',
      });
    });

    it('throws when the token is invalid or expired', async () => {
      mockSupabase.auth.verifyOtp.mockResolvedValue({
        error: new Error('Token has expired or is invalid'),
      } as any);

      await expect(verifyEmailOtp('stale')).rejects.toThrow(
        'Token has expired or is invalid'
      );
    });
  });

  describe('verifyEmailOtp (recovery)', () => {
    it('verifies a recovery token_hash as a recovery OTP', async () => {
      mockSupabase.auth.verifyOtp.mockResolvedValue({ error: null } as any);

      await verifyEmailOtp('recoveryhash', 'recovery');

      expect(mockSupabase.auth.verifyOtp).toHaveBeenCalledWith({
        token_hash: 'recoveryhash',
        type: 'recovery',
      });
    });
  });

  describe('resendConfirmationEmail', () => {
    it('calls resend with the signup type, email, and the auth-callback redirect', async () => {
      mockSupabase.auth.resend.mockResolvedValue({ error: null } as any);

      await resendConfirmationEmail('yash@example.com');

      expect(mockSupabase.auth.resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'yash@example.com',
        options: { emailRedirectTo: 'catchline://auth-callback' },
      });
    });

    it('throws when resend fails', async () => {
      mockSupabase.auth.resend.mockResolvedValue({
        error: new Error('rate limited'),
      } as any);

      await expect(resendConfirmationEmail('yash@example.com')).rejects.toThrow(
        'rate limited'
      );
    });
  });

  describe('requestPasswordReset', () => {
    it('calls resetPasswordForEmail with the email and the auth-callback redirect', async () => {
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null } as any);

      await requestPasswordReset('yash@example.com');

      expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'yash@example.com',
        { redirectTo: 'catchline://auth-callback' }
      );
    });

    it('throws when the reset request fails', async () => {
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
        error: new Error('user not found'),
      } as any);

      await expect(requestPasswordReset('nobody@example.com')).rejects.toThrow(
        'user not found'
      );
    });
  });

  describe('updatePassword', () => {
    it('calls updateUser with the new password', async () => {
      mockSupabase.auth.updateUser.mockResolvedValue({ error: null } as any);

      await updatePassword('newpass123');

      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        password: 'newpass123',
      });
    });

    it('throws when updateUser fails', async () => {
      mockSupabase.auth.updateUser.mockResolvedValue({
        error: new Error('session missing'),
      } as any);

      await expect(updatePassword('newpass123')).rejects.toThrow('session missing');
    });
  });

  describe('isValidEmail', () => {
    it('accepts a standard address', () => {
      expect(isValidEmail('yash@example.com')).toBe(true);
    });

    it('accepts an address with surrounding whitespace', () => {
      expect(isValidEmail('  yash@example.com  ')).toBe(true);
    });

    it('rejects an empty string', () => {
      expect(isValidEmail('')).toBe(false);
    });

    it('rejects an address without an @', () => {
      expect(isValidEmail('yash.example.com')).toBe(false);
    });

    it('rejects an address without a domain dot', () => {
      expect(isValidEmail('yash@example')).toBe(false);
    });

    it('rejects an address with spaces inside', () => {
      expect(isValidEmail('ya sh@example.com')).toBe(false);
    });
  });

  describe('signOut', () => {
    it('calls supabase.auth.signOut', async () => {
      mockSupabase.auth.signOut.mockResolvedValue({ error: null } as any);

      await signOut();

      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    });

    it('throws error when signOut fails', async () => {
      const mockError = new Error('Sign out failed');
      mockSupabase.auth.signOut.mockResolvedValue({
        error: mockError,
      } as any);

      await expect(signOut()).rejects.toThrow('Sign out failed');
    });
  });

  describe('signInWithGoogle', () => {
    it('starts OAuth and exchanges the returned code for a session', async () => {
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: { url: 'https://accounts.google.com/o/oauth2/auth?...' },
        error: null,
      } as any);
      mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({ error: null } as any);

      await signInWithGoogle();

      expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' })
      );
      expect(mockSupabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('test-code');
    });
  });
});

describe('useSession Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads initially as true, resolves to false after getSession', async () => {
    const mockSession: Session = {
      user: { id: 'user-1', email: 'test@example.com' } as any,
      access_token: 'token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Date.now() + 3600000,
      refresh_token: 'refresh',
    };

    mockSupabase.auth.getSession.mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(() => resolve({ data: { session: mockSession }, error: null }), 50)
        )
    );

    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    } as any);

    let capturedState: any = null;

    function TestComponent() {
      const state = useSession();
      capturedState = state;
      return null;
    }

    await act(async () => {
      render(<TestComponent />);
    });

    expect(capturedState.loading).toBe(true);
    expect(capturedState.session).toBe(null);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(capturedState.loading).toBe(false);
    expect(capturedState.session).toEqual(mockSession);
  });

  it('updates session when onAuthStateChange fires', async () => {
    const initialSession: Session = {
      user: { id: 'user-1', email: 'test@example.com' } as any,
      access_token: 'token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Date.now() + 3600000,
      refresh_token: 'refresh',
    };

    const newSession: Session = {
      user: { id: 'user-2', email: 'new@example.com' } as any,
      access_token: 'new-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Date.now() + 3600000,
      refresh_token: 'new-refresh',
    };

    let authCallback: ((event: string, session: Session | null) => void) | null = null;

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: initialSession },
      error: null,
    } as any);

    mockSupabase.auth.onAuthStateChange.mockImplementation(
      (callback: (event: string, session: Session | null) => void) => {
        authCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: jest.fn(),
            },
          },
        };
      }
    );

    let capturedState: any = null;

    function TestComponent() {
      const state = useSession();
      capturedState = state;
      return null;
    }

    await act(async () => {
      render(<TestComponent />);
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(capturedState.session).toEqual(initialSession);

    await act(async () => {
      authCallback?.('SIGNED_IN', newSession);
    });

    expect(capturedState.session).toEqual(newSession);
  });

  it('unsubscribes from auth state changes on unmount', async () => {
    const mockUnsubscribe = jest.fn();

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    } as any);

    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: mockUnsubscribe,
        },
      },
    } as any);

    function TestComponent() {
      useSession();
      return null;
    }

    const result = await act(async () => {
      return render(<TestComponent />);
    });

    await act(async () => {
      (result as any).unmount?.();
    });

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});

describe('humanAuthError', () => {
  it('translates "Invalid login credentials" into the warm mismatch message', () => {
    expect(humanAuthError(new Error('Invalid login credentials'), 'fallback')).toBe(
      "that email and password don't match — double-check, or reset it below"
    );
  });

  it('translates "Email not confirmed" into the confirmation nudge', () => {
    expect(humanAuthError(new Error('Email not confirmed'), 'fallback')).toBe(
      'almost in — tap the confirmation link we emailed you first'
    );
  });

  it('translates "User already registered" into the log-in-instead message', () => {
    expect(humanAuthError(new Error('User already registered'), 'fallback')).toBe(
      'that email already has an account, log in instead'
    );
  });

  it('translates rate-limit errors into the give-it-a-minute message', () => {
    expect(
      humanAuthError(new Error('Email rate limit exceeded'), 'fallback')
    ).toBe('a few too many tries — give it a minute, then go again');
  });

  it('translates network failures into the check-your-connection message', () => {
    expect(humanAuthError(new Error('Network request failed'), 'fallback')).toBe(
      "couldn't reach us — check your connection and try again"
    );
  });

  it('translates the same-password error into the pick-a-fresh-one message', () => {
    expect(
      humanAuthError(
        new Error('New password should be different from the old password.'),
        'fallback'
      )
    ).toBe("that's the same password as before — pick a fresh one");
  });

  it('returns the screen fallback for unknown errors and non-Error values', () => {
    expect(humanAuthError(new Error('weird 500 from upstream'), 'warm fallback')).toBe(
      'warm fallback'
    );
    expect(humanAuthError('string error', 'warm fallback')).toBe('warm fallback');
    expect(humanAuthError(undefined, 'warm fallback')).toBe('warm fallback');
  });
});
