import { purchasePlan } from './hooks';
import { usePurchases } from '../purchases/usePurchases';
import type { Plan } from './products';

jest.mock('../../data/backend', () => ({ backendEnabled: () => true }));
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
jest.mock('../auth/appleSignIn', () => ({ signInWithApple: jest.fn() }));

const { supabase } = jest.requireMock('../../lib/supabase') as { supabase: { auth: { getSession: jest.Mock } } };
const { signInWithApple } = jest.requireMock('../auth/appleSignIn') as { signInWithApple: jest.Mock };

const PLAN: Plan = { kind: 'sub', tier: 'pull', period: 'annual' };
const session = (anonymous: boolean | null) =>
  supabase.auth.getSession.mockResolvedValue({ data: { session: anonymous === null ? null : { user: { id: 'u1', is_anonymous: anonymous } } } });

let purchase: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  purchase = jest.fn(async () => 'success');
  usePurchases.setState({ purchase });
});

describe('sign in with Apple before any purchase (3.1)', () => {
  it('asks a lifter with no account to sign in first, then buys', async () => {
    session(null);
    signInWithApple.mockResolvedValue({ cancelled: false, userId: 'u2', transferred: false });
    expect(await purchasePlan(PLAN)).toBe('success');
    expect(signInWithApple).toHaveBeenCalledTimes(1);
    expect(purchase).toHaveBeenCalledWith(PLAN);
    expect(signInWithApple.mock.invocationCallOrder[0]).toBeLessThan(purchase.mock.invocationCallOrder[0]);
  });

  it('asks an anonymous account too, so the plan always belongs to an Apple account', async () => {
    session(true);
    signInWithApple.mockResolvedValue({ cancelled: false, userId: 'u1', transferred: true });
    expect(await purchasePlan(PLAN)).toBe('success');
    expect(signInWithApple).toHaveBeenCalledTimes(1);
  });

  it('never opens the store when the lifter cancels the sign-in', async () => {
    session(null);
    signInWithApple.mockResolvedValue({ cancelled: true });
    expect(await purchasePlan(PLAN)).toBe('cancelled');
    expect(purchase).not.toHaveBeenCalled();
  });

  it('reports a failed sign-in (offline) as a failed purchase, store untouched', async () => {
    session(null);
    signInWithApple.mockRejectedValue(new Error('network'));
    expect(await purchasePlan(PLAN)).toBe('failed');
    expect(purchase).not.toHaveBeenCalled();
  });

  it('goes straight to the store for a lifter already signed in with Apple', async () => {
    session(false);
    expect(await purchasePlan(PLAN)).toBe('success');
    expect(signInWithApple).not.toHaveBeenCalled();
  });
});
