import { act, fireEvent, render } from '@testing-library/react-native';
import { supabase } from '../../lib/supabase';
import { ANALYSES } from '../../analysis/fixtures';
import { liveAnalysis, putLiveAnalysis } from '../../analysis/live';
import { newClip, useCapture } from '../capture/store';
import { useLibraryStore } from '../library/store';
import { useOnboarding } from '../onboarding/store';
import { useUsage } from '../paywall/usageStore';
import { usePurchases } from '../purchases/usePurchases';
import { createAccountRepository, useAccountStore } from './account';
import DeleteAccountSheet from './DeleteAccountSheet';

jest.mock('../../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    functions: { invoke: jest.fn(async () => ({ data: { success: true }, error: null })) },
    auth: { signOut: jest.fn(async () => ({ error: null })) },
  },
}));

const mocked = supabase as unknown as { functions: { invoke: jest.Mock }; auth: { signOut: jest.Mock } };

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

async function confirmDelete(onDeleted: jest.Mock) {
  const screen = await render(<DeleteAccountSheet onKeep={jest.fn()} onDeleted={onDeleted} repo={createAccountRepository()} />);
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('delete-confirm-input'), 'DELETE');
  });
  await press(screen.getByTestId('delete-everything'));
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  useAccountStore.setState({ account: { name: 'Alex', signIn: 'apple', synced: true, plan: { tier: 'free', videosUsed: 1 } } });
  useOnboarding.getState().acceptConsent(new Date('2026-10-01T00:00:00.000Z'));
  useOnboarding.getState().complete();
  useUsage.getState().reset();
  useUsage.getState().record('free', new Date('2026-10-02T00:00:00.000Z'));
  useCapture.getState().setDraft(newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 60, source: 'camera', movement: 'snatch' }));
  useCapture.getState().setLastWeight('80');
  usePurchases.setState({ appUserId: 'u1', tier: 'pull', period: 'annual' });
  putLiveAnalysis(ANALYSES['snatch-mock']);
});

describe('DeleteAccountSheet against the backend', () => {
  it('deletes on the server, forgets everything local, signs out, then leaves', async () => {
    const onDeleted = jest.fn();
    await confirmDelete(onDeleted);

    expect(mocked.functions.invoke).toHaveBeenCalledTimes(1);
    expect(mocked.functions.invoke).toHaveBeenCalledWith('delete-account');
    expect(mocked.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(onDeleted).toHaveBeenCalledTimes(1);

    expect(useAccountStore.getState().account).toBeNull();
    expect(useOnboarding.getState().consent).toBeNull();
    expect(useOnboarding.getState().completed).toBe(false);
    expect(useUsage.getState().usage.lifetime).toBe(0);
    expect(useCapture.getState().draft).toBeNull();
    expect(useCapture.getState().lastWeight).toBe('');
    expect(usePurchases.getState()).toMatchObject({ appUserId: null, tier: 'free', period: null, expiresAt: null, customerInfo: null });
    expect(liveAnalysis('snatch-mock')).toBeUndefined();
    expect(useLibraryStore.getState().lifts).toEqual([]);
    expect(useLibraryStore.getState().sessions).toEqual([]);
    expect(useLibraryStore.getState().cues).toEqual([]);
    expect(useLibraryStore.getState().freeVideosUsed).toBe(0);
  });

  it('shows the failure in the sheet and keeps everything when the server says no', async () => {
    mocked.functions.invoke.mockResolvedValueOnce({ data: null, error: new Error('data_delete_failed') });
    const onDeleted = jest.fn();
    const screen = await confirmDelete(onDeleted);

    expect(screen.getByTestId('delete-error')).toHaveTextContent(
      "Couldn't delete your account. Check your connection and try again."
    );
    expect(screen.getByTestId('delete-everything')).toBeEnabled();
    expect(screen.getByText('Delete everything')).toBeOnTheScreen();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(mocked.auth.signOut).not.toHaveBeenCalled();
    expect(useAccountStore.getState().account?.name).toBe('Alex');
    expect(useOnboarding.getState().completed).toBe(true);
    expect(useUsage.getState().usage.lifetime).toBe(1);
    expect(liveAnalysis('snatch-mock')).toBe(ANALYSES['snatch-mock']);
  });
});

describe('DeleteAccountSheet and the keyboard', () => {
  it('rides above the keyboard while DELETE is typed, and settles back when it closes', async () => {
    const { Keyboard } = require('react-native');
    const handlers: Record<string, (e?: unknown) => void> = {};
    const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation((name: unknown, fn: unknown) => {
      handlers[name as string] = fn as (e?: unknown) => void;
      return { remove: jest.fn() } as never;
    });
    const screen = await render(<DeleteAccountSheet onKeep={jest.fn()} onDeleted={jest.fn()} />);
    const sheetBottom = () => {
      let node = screen.getByTestId('delete-everything');
      while (node && !(node.props.style && JSON.stringify(node.props.style).includes('"position":"absolute"'))) node = node.parent as never;
      return (Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style.flat()) : node.props.style).bottom;
    };
    expect(sheetBottom()).toBe(0);
    await act(async () => handlers.keyboardWillShow({ endCoordinates: { height: 336 } }));
    expect(sheetBottom()).toBe(336);
    await act(async () => handlers.keyboardWillHide());
    expect(sheetBottom()).toBe(0);
    spy.mockRestore();
  });
});
