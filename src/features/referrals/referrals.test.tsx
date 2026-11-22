import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { useAuthUser } from '../auth/authUser';
import { AppleSheetError } from '../auth/appleSignIn';
import { claimErrorOf, inviteLink, monthsOf, normalizeCode, type MyReferral } from './api';
import InviteScreen, { inviteMessage, type InviteApi } from './InviteScreen';
import { useInvite } from './store';
import { setLanguage } from '../../i18n';

const MINE: MyReferral = {
  code: 'YASH42',
  kind: 'friend',
  joined: 2,
  qualified: 1,
  daysEarned: 30,
  proUntil: null,
  badge: false,
  nextMilestone: 3,
  friends: [
    { name: 'Huilong', status: 'qualified', at: '2026-11-15T10:00:00Z' },
    { name: null, status: 'claimed', at: '2026-11-14T10:00:00Z' },
  ],
};

function fakeApi(overrides: Partial<InviteApi> = {}): InviteApi {
  return {
    fetchMyReferral: jest.fn(async () => MINE),
    claimCode: jest.fn(async () => ({ ok: true as const, status: 'claimed' as const, inviter: 'Yash' })),
    collectRewards: jest.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  useAuthUser.setState({ userId: 'u1', anonymous: false, displayName: 'Yash' });
  useInvite.setState({ pendingCode: null, promptedAfterShare: false });
});

describe('referral helpers', () => {
  it('normalises a typed code to capitals and digits', () => {
    expect(normalizeCode(' yash-42 ')).toBe('YASH42');
    expect(normalizeCode('abcdefghijklmnop')).toBe('ABCDEFGHIJKL');
  });

  it('links to the invite page with the code', () => {
    expect(inviteLink('YASH42')).toBe('https://yash-gadodia.github.io/catchline/i/?c=YASH42');
  });

  it('maps server errors and rounds days to months', () => {
    expect(claimErrorOf('ERROR: too_late')).toBe('too_late');
    expect(claimErrorOf('network down')).toBe('generic');
    expect(claimErrorOf(undefined)).toBe('generic');
    expect(monthsOf(30)).toBe(1);
    expect(monthsOf(120)).toBe(4);
  });

  it('writes the friend and gym messages with the code and link', () => {
    expect(inviteMessage('friend', 'YASH42')).toBe(
      'I track my lifts with Catchline. It draws the bar path and joint angles on your own video, on your iPhone. Use my code YASH42 and we both get a month of Pro free: https://yash-gadodia.github.io/catchline/i/?c=YASH42',
    );
    expect(inviteMessage('gym', 'YASH42')).toMatch(/^Anyone filming their lifts\? .* Code YASH42 gets you a month of Pro free: https:\/\/yash-gadodia\.github\.io\/catchline\/i\/\?c=YASH42$/);
  });
});

describe('InviteScreen', () => {
  it('asks an anonymous lifter to sign in and never loads a code', async () => {
    useAuthUser.setState({ userId: 'anon', anonymous: true, displayName: null });
    const api = fakeApi();
    const signIn = jest.fn(async () => ({ cancelled: true as const }));
    const view = await render(<InviteScreen onBack={jest.fn()} api={api} signIn={signIn} />);
    expect(view.getByText('Sign in with Apple to get your code')).toBeOnTheScreen();
    expect(view.getByTestId('invite-claim-sign-in')).toBeOnTheScreen();
    expect(api.fetchMyReferral).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(view.getByTestId('invite-sign-in'));
    });
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("says what to check when Apple's sheet fails, and says nothing on a cancel (22-11)", async () => {
    useAuthUser.setState({ userId: 'anon', anonymous: true, displayName: null });
    const signIn = jest.fn<Promise<{ cancelled: true }>, []>(async () => ({ cancelled: true }));
    const view = await render(<InviteScreen onBack={jest.fn()} api={fakeApi()} signIn={signIn} />);
    await act(async () => {
      fireEvent.press(view.getByTestId('invite-sign-in'));
    });
    expect(view.queryByTestId('invite-claim-note')).toBeNull();
    signIn.mockRejectedValueOnce(new AppleSheetError('The authorization attempt failed for an unknown reason'));
    await act(async () => {
      fireEvent.press(view.getByTestId('invite-sign-in'));
    });
    expect(view.getByTestId('invite-claim-note')).toHaveTextContent("Apple sign-in didn't go through. Check you're signed in to your Apple Account in Settings, then try again.");
  });

  it.each(['de', 'fr'] as const)('in %s, the title keeps clear of the back label and the Apple buttons wrap their labels centred', async (lang) => {
    useAuthUser.setState({ userId: 'anon', anonymous: true, displayName: null });
    setLanguage(lang);
    try {
      const view = await render(<InviteScreen onBack={jest.fn()} api={fakeApi()} />);
      expect(view.getByTestId('topbar-center')).toHaveStyle({ flex: 1, marginHorizontal: 12 });
      expect(view.getByTestId('invite-title')).toHaveProp('numberOfLines', 2);
      expect(view.getByTestId('invite-title')).toHaveStyle({ textAlign: 'center' });
      for (const [id, min] of [['invite-sign-in', 56], ['invite-claim-sign-in', 48]] as const) {
        expect(view.getByTestId(id)).toHaveStyle({ minHeight: min, paddingHorizontal: 16 });
        expect(view.getByTestId(id)).not.toHaveStyle({ height: min });
        expect(within(view.getByTestId(id)).getByText(/Apple/)).toHaveStyle({ textAlign: 'center' });
      }
    } finally {
      setLanguage('en');
    }
  });

  it('shows the code, progress and friends, and shares the friend message', async () => {
    const share = jest.fn(async () => undefined);
    const api = fakeApi();
    const view = await render(<InviteScreen onBack={jest.fn()} api={api} share={share} />);
    await waitFor(() => expect(view.getByTestId('invite-code')).toHaveTextContent('YASH42'));
    expect(view.getByTestId('invite-progress')).toHaveTextContent('2 friends joined · 1 month earned');
    expect(view.getByText('2 more friends to the next reward')).toBeOnTheScreen();
    expect(view.getByText('Huilong')).toBeOnTheScreen();
    expect(view.getByText('Tracked a lift')).toBeOnTheScreen();
    expect(view.getByText('A friend')).toBeOnTheScreen();
    expect(view.getByText('Joined, no lift yet')).toBeOnTheScreen();
    expect(api.collectRewards).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.press(view.getByTestId('invite-share-friend'));
    });
    expect(share).toHaveBeenCalledWith(inviteMessage('friend', 'YASH42'));
  });

  it('prefills a code from an invite link and claims it', async () => {
    useInvite.setState({ pendingCode: 'HUI07' });
    const api = fakeApi();
    const view = await render(<InviteScreen onBack={jest.fn()} api={api} />);
    expect(view.getByTestId('invite-claim-input').props.value).toBe('HUI07');
    await act(async () => {
      fireEvent.press(view.getByTestId('invite-claim'));
    });
    expect(api.claimCode).toHaveBeenCalledWith('HUI07');
    expect(view.getByTestId('invite-claim-note')).toHaveTextContent('Code added. Track your first lift and you both get a month of Pro.');
    expect(useInvite.getState().pendingCode).toBeNull();
  });

  it('says why a claim was refused', async () => {
    const api = fakeApi({ claimCode: jest.fn(async () => ({ ok: false as const, error: 'own_code' as const })) });
    const view = await render(<InviteScreen onBack={jest.fn()} api={api} />);
    await act(async () => {
      fireEvent.changeText(view.getByTestId('invite-claim-input'), 'yash42');
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('invite-claim'));
    });
    expect(api.claimCode).toHaveBeenCalledWith('YASH42');
    expect(view.getByTestId('invite-claim-note')).toHaveTextContent("That's your own code. Send it to a friend instead.");
  });

  it('offers a retry when the code cannot load', async () => {
    const api = fakeApi({ fetchMyReferral: jest.fn(async () => Promise.reject(new Error('offline'))) });
    const view = await render(<InviteScreen onBack={jest.fn()} api={api} />);
    await waitFor(() => expect(view.getByTestId('invite-load-failed')).toBeOnTheScreen());
  });
});
