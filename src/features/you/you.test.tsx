import { loadLibrary } from '../library/repository';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { isHapticsEnabled } from '../../lib/haptics';
import YouScreen, { exportMyData } from './YouScreen';
import WhatIsStoredScreen from './WhatIsStoredScreen';
import DeleteAccountSheet, { confirmed } from './DeleteAccountSheet';
import { LowStorageSheet, OfflineBanner, PermissionDenied, UpdateRequired, formatBytes } from './GlobalStates';
import { NOTIFICATION_COPY, NOTIFICATION_TITLE } from './notificationCopy';
import { DEFAULT_SETTINGS, reminderLabel, settingLabels, useSettings } from './settings';
import { accountLine, createLocalAccountRepository, livePlanLabel, planLabel, useAccountStore } from './account';
import { backendEnabled } from '../../data/backend';
import { recordConsent } from '../../lib/api';
import { useOnboarding } from '../onboarding/store';
import { useUsage } from '../paywall/usageStore';
import { usePurchases } from '../purchases/usePurchases';
import { NO_USER, useAuthUser } from '../auth/authUser';

jest.mock('../../data/backend', () => ({ backendEnabled: jest.fn(() => false) }));
jest.mock('../../lib/api', () => ({
  recordConsent: jest.fn(() => Promise.resolve()),
  ensureSession: jest.fn(),
  getAllowance: jest.fn(),
  updateCue: jest.fn(),
}));

const mockBackendEnabled = backendEnabled as jest.Mock;
const mockRecordConsent = recordConsent as jest.Mock;

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

const initialAccount = useAccountStore.getState();
const nav = { onWhatIsStored: jest.fn(), onDeleteAccount: jest.fn(), onPlan: jest.fn(), onHelp: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  loadLibrary('seeded');
  mockBackendEnabled.mockReturnValue(false);
  useAccountStore.setState(initialAccount, true);
  useSettings.getState().reset();
  useOnboarding.getState().reset();
  useUsage.getState().reset();
  usePurchases.getState().setDemoPlan('free');
  useAuthUser.setState(NO_USER, true);
});

describe('plan and settings labels', () => {
  it('shows founding as Pull for life with no renewal date', () => {
    expect(planLabel({ tier: 'pull', founding: true })).toBe('Pull · Founding member · for life');
    expect(planLabel({ tier: 'pull', founding: false, billing: 'annual', renewsOn: '2027-10-02T00:00:00.000Z' })).toBe(
      'Pull · $59.99/yr · renews 2 Oct'
    );
    expect(planLabel({ tier: 'hook', founding: false, billing: 'monthly', renewsOn: '2026-11-11T00:00:00.000Z' })).toBe(
      'Hook · $4.99/mo · renews 11 Nov'
    );
    expect(planLabel({ tier: 'free', videosUsed: 1 })).toBe('Free · 2 of 3 videos left');
    expect(planLabel({ tier: 'free', videosUsed: 4 })).toBe('Free · 0 of 3 videos left');
  });

  it('labels the defaults like the design', () => {
    expect(settingLabels(DEFAULT_SETTINGS)).toEqual({
      units: 'kg',
      defaultMovement: 'Snatch',
      frameRate: '60 fps, 240 for snatch',
      cueReminder: 'Tue, Thu · 17:30',
      autoDelete: '24 h',
    });
    expect(reminderLabel({ days: [], time: '17:30' })).toBe('Off');
    expect(reminderLabel({ days: [5, 1], time: '06:30' })).toBe('Mon, Fri · 06:30');
    expect(reminderLabel({ days: [0, 1, 2, 3, 4, 5, 6], time: '07:30' })).toBe('Every day · 07:30');
    expect(accountLine(initialAccount.account!)).toBe('Signed in with Apple · synced');
  });

  it('keeps the notification copy to three lines', () => {
    expect(NOTIFICATION_TITLE).toBe('Catchline');
    expect(Object.keys(NOTIFICATION_COPY)).toEqual(['cueReminder', 'analysed', 'queuedAnalysed']);
    expect(NOTIFICATION_COPY.cueReminder('Stay over the bar longer')).toBe('Next session: stay over the bar longer');
    expect(NOTIFICATION_COPY.analysed).toBe('Your lift is analysed');
    expect(NOTIFICATION_COPY.queuedAnalysed).toBe('Your queued lifts are analysed');
  });

  it('formats storage sizes', () => {
    expect(formatBytes(4.1e9)).toBe('4.1 GB');
    expect(formatBytes(512e6)).toBe('512 MB');
    expect(formatBytes(900)).toBe('1 KB');
  });
});

describe('YouScreen', () => {
  it('lists the profile, founding plan and every setting', async () => {
    const screen = await render(<YouScreen nav={nav} version="1.0.3" />);
    expect(within(screen.getByTestId('row-profile')).getByText('Alex')).toBeOnTheScreen();
    expect(screen.getByText('Signed in with Apple · synced')).toBeOnTheScreen();
    expect(screen.getByText('Pull · Founding member · for life')).toBeOnTheScreen();
    expect(screen.getByTestId('founding-badge')).toBeOnTheScreen();
    expect(screen.queryByText(/renews/)).toBeNull();
    expect(within(screen.getByTestId('row-frame-rate')).getByText('60 fps, 240 for snatch')).toBeOnTheScreen();
    expect(within(screen.getByTestId('row-reminder')).getByText('Tue, Thu · 17:30')).toBeOnTheScreen();
    expect(within(screen.getByTestId('row-auto-delete')).getByText('24 h')).toBeOnTheScreen();
    expect(screen.getByText('About · 1.0.3')).toBeOnTheScreen();
    await press(screen.getByTestId('row-stored'));
    await press(screen.getByTestId('row-delete'));
    expect(nav.onWhatIsStored).toHaveBeenCalledTimes(1);
    expect(nav.onDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('picks units and default lift from a sheet', async () => {
    const screen = await render(<YouScreen nav={nav} version="1.0.3" />);
    await press(screen.getByTestId('row-units'));
    await press(screen.getByTestId('pick-lb'));
    expect(useSettings.getState().units).toBe('lb');
    expect(within(screen.getByTestId('row-units')).getByText('lb')).toBeOnTheScreen();
    expect(screen.queryByTestId('option-sheet')).toBeNull();
    await press(screen.getByTestId('row-movement'));
    await press(screen.getByTestId('pick-bar_muscle_up'));
    expect(within(screen.getByTestId('row-movement')).getByText('Bar muscle-up')).toBeOnTheScreen();
  });

  it('toggles voice countdown and haptics, and haptics reaches the haptics module', async () => {
    const screen = await render(<YouScreen nav={nav} version="1.0.3" />);
    await act(async () => {
      fireEvent(screen.getByTestId('toggle-haptics'), 'valueChange', false);
    });
    await act(async () => {
      fireEvent(screen.getByTestId('toggle-voice'), 'valueChange', false);
    });
    expect(useSettings.getState().haptics).toBe(false);
    expect(useSettings.getState().voiceCountdown).toBe(false);
    expect(isHapticsEnabled()).toBe(false);
    await act(async () => {
      fireEvent(screen.getByTestId('toggle-haptics'), 'valueChange', true);
    });
    expect(isHapticsEnabled()).toBe(true);
  });

  it('edits the cue reminder days and time', async () => {
    const screen = await render(<YouScreen nav={nav} version="1.0.3" />);
    await press(screen.getByTestId('row-reminder'));
    await press(screen.getByTestId('day-Thu'));
    await press(screen.getByTestId('day-Sat'));
    await press(screen.getByTestId('time-07:30'));
    await press(screen.getByText('Done'));
    expect(within(screen.getByTestId('row-reminder')).getByText('Tue, Sat · 07:30')).toBeOnTheScreen();
  });

  it('keeps the cue reminder label on one line with the days and time under it, every day collapsed', async () => {
    useSettings.getState().set('cueReminder', { days: [0, 1, 2, 3, 4, 5, 6], time: '07:30' });
    const screen = await render(<YouScreen nav={nav} version="1.0.3" />);
    const row = screen.getByTestId('row-reminder');
    expect(row).toHaveTextContent('Cue reminderEvery day · 07:30One nudge before your usual session›');
    expect(within(row).getByText('Cue reminder')).toHaveProp('numberOfLines', 1);
    expect(within(row).getByText('Every day · 07:30')).toBeOnTheScreen();
  });

  it('renames the profile', async () => {
    const screen = await render(<YouScreen nav={nav} version="1.0.3" />);
    await press(screen.getByTestId('row-profile'));
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('name-input'), '  Alex Tan ');
    });
    await press(screen.getByText('Save'));
    expect(within(screen.getByTestId('row-profile')).getByText('Alex Tan')).toBeOnTheScreen();
  });

  it('exports everything stored', async () => {
    const send = jest.fn(() => Promise.resolve());
    const screen = await render(<YouScreen nav={nav} version="1.0.3" exportData={send} />);
    await press(screen.getByTestId('row-export'));
    expect(send).toHaveBeenCalledWith({
      exportedAt: expect.any(String),
      account: { name: 'Alex', plan: 'Pull · Founding member · for life' },
      settings: DEFAULT_SETTINGS,
      lifts: ['snatch-mock', 'snatch-mock-low', 'snatch-mock-miss', 'snatch-real'],
    });
  });
});

describe('YouScreen with the backend on', () => {
  const now = new Date('2026-10-14T09:00:00.000Z');

  beforeEach(() => mockBackendEnabled.mockReturnValue(true));

  it('labels the live plan from the tier and the usage store', () => {
    const used = { lifetime: 1, month: '', thisMonth: 0 };
    expect(livePlanLabel('free', used, 'organic', now)).toBe('Free · 2 of 3 videos left');
    expect(livePlanLabel('free', used, 'ad', now)).toBe('Free · 0 of 1 videos left');
    expect(livePlanLabel('pull', { lifetime: 5, month: '2026-10', thisMonth: 2 }, 'organic', now)).toBe('Pull · 38 of 40 videos left this month');
    expect(livePlanLabel('founding', { lifetime: 5, month: '2026-09', thisMonth: 2 }, 'organic', now)).toBe(
      'Founding member · 40 of 40 videos left this month'
    );
  });

  it('shows the anonymous account and the real free allowance, never the fixture', async () => {
    useUsage.getState().record('free', now);
    const screen = await render(<YouScreen nav={nav} version="1.0.3" />);
    expect(within(screen.getByTestId('row-profile')).getByText('Anonymous on this phone')).toBeOnTheScreen();
    expect(within(screen.getByTestId('row-profile')).queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Alex')).toBeNull();
    expect(screen.queryByText(/Signed in with/)).toBeNull();
    expect(within(screen.getByTestId('row-plan')).getByText('Free · 2 of 3 videos left')).toBeOnTheScreen();
    expect(screen.queryByTestId('founding-badge')).toBeNull();
    await press(screen.getByTestId('row-plan'));
    expect(nav.onPlan).toHaveBeenCalledTimes(1);
  });

  it('offers Sign in with Apple while anonymous and shows the account once signed in', async () => {
    const signIn = jest.fn(async () => {
      useAuthUser.setState({ userId: 'apple-1', anonymous: false, displayName: 'Alex Tan' });
      return { cancelled: false as const, userId: 'apple-1', transferred: true };
    });
    const screen = await render(<YouScreen nav={nav} version="1.0.3" signIn={signIn} />);
    expect(within(screen.getByTestId('row-profile')).getByText('Sign in with Apple')).toBeOnTheScreen();
    expect(screen.queryByTestId('row-sign-out')).toBeNull();
    await press(screen.getByTestId('row-profile'));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId('row-profile')).getByText('Alex Tan')).toBeOnTheScreen();
    expect(within(screen.getByTestId('row-profile')).getByText('Signed in with Apple')).toBeOnTheScreen();
    expect(screen.queryByText('Sign in with Apple')).toBeNull();
    expect(screen.queryByText('Anonymous on this phone')).toBeNull();
    expect(screen.getByTestId('row-sign-out')).toBeOnTheScreen();
    await press(screen.getByTestId('row-profile'));
    expect(screen.queryByTestId('name-sheet')).toBeNull();
  });

  it('says so when Apple sign-in fails and stays anonymous', async () => {
    const signIn = jest.fn(() => Promise.reject(new Error('bad nonce')));
    const screen = await render(<YouScreen nav={nav} version="1.0.3" signIn={signIn} />);
    await press(screen.getByTestId('row-profile'));
    expect(screen.getByTestId('sign-in-failed')).toHaveTextContent("Apple sign-in didn't go through. Try again.");
    expect(within(screen.getByTestId('row-profile')).getByText('Anonymous on this phone')).toBeOnTheScreen();
  });

  it('shows "Signed in with Apple" as the title when Apple gave no name, and signs out', async () => {
    useAuthUser.setState({ userId: 'apple-1', anonymous: false, displayName: null });
    const signOut = jest.fn(async () => {
      useAuthUser.setState(NO_USER);
    });
    const screen = await render(<YouScreen nav={nav} version="1.0.3" signOut={signOut} />);
    expect(within(screen.getByTestId('row-profile')).getByText('Signed in with Apple')).toBeOnTheScreen();
    await press(screen.getByTestId('row-sign-out'));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId('row-profile')).getByText('Anonymous on this phone')).toBeOnTheScreen();
    expect(screen.queryByTestId('row-sign-out')).toBeNull();
  });

  it('exports the Apple name once signed in', async () => {
    useAuthUser.setState({ userId: 'apple-1', anonymous: false, displayName: 'Alex Tan' });
    const send = jest.fn(() => Promise.resolve());
    const screen = await render(<YouScreen nav={nav} version="1.0.3" exportData={send} />);
    await press(screen.getByTestId('row-export'));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ account: { name: 'Alex Tan', plan: 'Free · 3 of 3 videos left' } }));
  });

  it('shows the live paid tier with its monthly cap and the founding badge', async () => {
    usePurchases.getState().setDemoPlan('founding');
    useUsage.getState().record('founding', new Date());
    useUsage.getState().record('founding', new Date());
    const screen = await render(<YouScreen nav={nav} version="1.0.3" />);
    expect(within(screen.getByTestId('row-plan')).getByText('Founding member · 38 of 40 videos left this month')).toBeOnTheScreen();
    expect(screen.getByTestId('founding-badge')).toBeOnTheScreen();
  });

  it('reads and writes units through the onboarding store', async () => {
    useOnboarding.getState().setUnits('lb');
    const screen = await render(<YouScreen nav={nav} version="1.0.3" />);
    expect(within(screen.getByTestId('row-units')).getByText('lb')).toBeOnTheScreen();
    await press(screen.getByTestId('row-units'));
    await press(screen.getByTestId('pick-kg'));
    expect(useOnboarding.getState().units).toBe('kg');
    expect(useSettings.getState().units).toBe('kg');
    expect(within(screen.getByTestId('row-units')).getByText('kg')).toBeOnTheScreen();
  });

  it('exports the anonymous account and the lifts in the library, not the fixture ids', async () => {
    const send = jest.fn(() => Promise.resolve());
    const screen = await render(<YouScreen nav={nav} version="1.0.3" exportData={send} />);
    await press(screen.getByTestId('row-export'));
    expect(send).toHaveBeenCalledWith({
      exportedAt: expect.any(String),
      account: { name: '', plan: 'Free · 3 of 3 videos left' },
      settings: DEFAULT_SETTINGS,
      lifts: ['l-snatch-today', 'l-clean', 'l-mu', 'l-jerk', 'l-snatch-queued', 'l-snatch-miss', 'l-snatch-real', 'l-snatch-low'],
    });
  });

  it('what is stored reads the real consent and records a change', async () => {
    useOnboarding.getState().acceptConsent(false, now);
    const screen = await render(<WhatIsStoredScreen onBack={jest.fn()} onExport={jest.fn()} />);
    expect(screen.getByText('Only if you turned it on. Off right now.')).toBeOnTheScreen();
    await act(async () => {
      fireEvent(screen.getByTestId('toggle-improve'), 'valueChange', true);
    });
    expect(screen.getByText('Only if you turned it on. On right now.')).toBeOnTheScreen();
    expect(useOnboarding.getState().consent?.improveAccuracy).toBe(true);
    expect(mockRecordConsent).toHaveBeenCalledWith('model_training', '1', true);
  });
});

describe('exportMyData', () => {
  it('stamps the export time from the repository clock', async () => {
    const repo = createLocalAccountRepository(() => new Date('2026-10-11T10:00:00.000Z'));
    const bundle = await repo.exportAllData(DEFAULT_SETTINGS, ['snatch-mock']);
    expect(bundle.exportedAt).toBe('2026-10-11T10:00:00.000Z');
    const send = jest.fn(() => Promise.resolve());
    await exportMyData(send);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('WhatIsStoredScreen', () => {
  it('spells out what is kept and toggles the accuracy opt-in', async () => {
    const onExport = jest.fn();
    const screen = await render(<WhatIsStoredScreen onBack={jest.fn()} onExport={onExport} />);
    expect(screen.getByText('On your phone. Sent once for analysis, deleted from our servers within 24 hours.')).toBeOnTheScreen();
    expect(screen.getAllByText('kept')).toHaveLength(3);
    expect(screen.getByText('Only if you turned it on. Off right now.')).toBeOnTheScreen();
    await act(async () => {
      fireEvent(screen.getByTestId('toggle-improve'), 'valueChange', true);
    });
    expect(screen.getByText('Only if you turned it on. On right now.')).toBeOnTheScreen();
    await press(screen.getByText('Export all my data'));
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});

describe('DeleteAccountSheet', () => {
  it('only matches the exact word', () => {
    expect(confirmed('DELETE')).toBe(true);
    expect(confirmed(' DELETE ')).toBe(true);
    expect(confirmed('DELE')).toBe(false);
    expect(confirmed('delete')).toBe(false);
  });

  it('enables the destructive button on DELETE and deletes', async () => {
    const onDeleted = jest.fn();
    const repo = createLocalAccountRepository();
    const screen = await render(<DeleteAccountSheet onKeep={jest.fn()} onDeleted={onDeleted} repo={repo} />);
    const button = screen.getByTestId('delete-everything');
    expect(button).toBeDisabled();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('delete-confirm-input'), 'DELE');
    });
    await press(button);
    expect(onDeleted).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('delete-confirm-input'), 'DELETE');
    });
    expect(screen.getByTestId('delete-everything')).toBeEnabled();
    await press(screen.getByTestId('delete-everything'));
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(useAccountStore.getState().account).toBeNull();
  });

  it('keeps the account', async () => {
    const onKeep = jest.fn();
    const screen = await render(<DeleteAccountSheet onKeep={onKeep} onDeleted={jest.fn()} />);
    await press(screen.getByText('Keep my account'));
    expect(onKeep).toHaveBeenCalledTimes(1);
  });
});

describe('global states', () => {
  it('shows the offline banner with the queue', async () => {
    const screen = await render(<OfflineBanner queued={2} />);
    expect(screen.getByText('Offline. Filming works; analysis will queue.')).toBeOnTheScreen();
    expect(screen.getByText('2 queued')).toBeOnTheScreen();
  });

  it('offers to delete originals when storage is low', async () => {
    const onDelete = jest.fn();
    const screen = await render(<LowStorageSheet clips={38} bytes={4.1e9} onDelete={onDelete} onNotNow={jest.fn()} />);
    expect(screen.getByText('38 original clips take 4.1 GB. Analyses, cues and stills stay either way.')).toBeOnTheScreen();
    await press(screen.getByText('Delete originals'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('blocks on a required update', async () => {
    const onUpdate = jest.fn();
    const screen = await render(<UpdateRequired onUpdate={onUpdate} />);
    expect(screen.getByText("This version can't talk to the analysis service any more.")).toBeOnTheScreen();
    await press(screen.getByText('Update Catchline'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('explains a denied permission inline and opens Settings', async () => {
    const spy = jest.spyOn(Linking, 'openSettings').mockResolvedValueOnce(undefined);
    const screen = await render(<PermissionDenied kind="camera" />);
    expect(screen.getByText('Camera is off for Catchline')).toBeOnTheScreen();
    expect(screen.getByText('Filming needs it. You can still import a clip from Photos.')).toBeOnTheScreen();
    await press(screen.getByText('Open Settings'));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
