import { loadLibrary } from '../library/repository';
import * as problemReports from '../../data/problemReports';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Linking, Platform, Share } from 'react-native';
import { File } from 'expo-file-system';
import { isHapticsEnabled } from '../../lib/haptics';
import YouScreen, { exportMyData, shareExport } from './YouScreen';
import WhatIsStoredScreen from './WhatIsStoredScreen';
import DeleteAccountSheet, { confirmed } from './DeleteAccountSheet';
import { LowStorageSheet, OfflineBanner, PermissionDenied, UpdateRequired, formatBytes } from './GlobalStates';
import { NOTIFICATION_COPY, NOTIFICATION_TITLE } from './notificationCopy';
import { DEFAULT_SETTINGS, reminderLabel, settingLabels, useSettings } from './settings';
import { accountLine, createLocalAccountRepository, planLabel, useAccountStore, type DataExport } from './account';
import { ANALYSES } from '../../analysis/fixtures';
import { useLibraryStore } from '../library/store';
import { backendEnabled } from '../../data/backend';
import { useOnboarding } from '../onboarding/store';
import { useUsage } from '../paywall/usageStore';
import { usePurchases } from '../purchases/usePurchases';
import { NO_USER, useAuthUser } from '../auth/authUser';

jest.mock('expo-file-system', () => {
  const File = jest.fn().mockImplementation(() => ({ uri: 'file:///cache/catchline-data.json', create: jest.fn(), write: jest.fn() }));
  return { File, Paths: { cache: { uri: 'file:///cache/' } } };
});
jest.mock('../../data/backend', () => ({ backendEnabled: jest.fn(() => false) }));
jest.mock('../../lib/api', () => ({
  recordConsent: jest.fn(() => Promise.resolve()),
  ensureSession: jest.fn(),
  getAllowance: jest.fn(),
  updateCue: jest.fn(),
}));

const mockBackendEnabled = backendEnabled as jest.Mock;

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

const initialAccount = useAccountStore.getState();
const nav = { onDemo: jest.fn(), onWhatIsStored: jest.fn(), onDeleteAccount: jest.fn(), onPlan: jest.fn(), onReport: jest.fn(), onWhatsNew: jest.fn() };

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
  it('free shows this week\'s videos; every paid tier, old or new, is Catchline Pro', () => {
    const wed = new Date(2026, 10, 11, 9, 0);
    const one = { lifetime: 9, week: '2026-11-09', thisWeek: 1 };
    expect(planLabel('free', one, wed)).toBe('Free · 2 of 3 videos left this week');
    expect(planLabel('free', { lifetime: 9, week: '2026-11-09', thisWeek: 3 }, wed)).toBe('Free · 0 of 3 videos left this week');
    expect(planLabel('free', one, new Date(2026, 10, 16))).toBe('Free · 3 of 3 videos left this week');
    expect(planLabel('hook', one, wed)).toBe('Catchline Pro · unlimited videos');
    expect(planLabel('pull', one, wed)).toBe('Catchline Pro · unlimited videos');
    expect(planLabel('platform', one, wed)).toBe('Catchline Pro · unlimited videos');
    expect(planLabel('founding', one, wed)).toBe('Catchline Pro · Founding member');
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
  it('lists the profile, the founding plan, three sections, and none of the 3.x settings', async () => {
    const screen = await render(<YouScreen nav={nav} />);
    expect(within(screen.getByTestId('row-profile')).getByText('Alex')).toBeOnTheScreen();
    expect(screen.getByText('Signed in with Apple · synced')).toBeOnTheScreen();
    expect(screen.getByText('Catchline Pro · Founding member')).toBeOnTheScreen();
    expect(screen.getByTestId('founding-badge')).toBeOnTheScreen();
    expect(screen.queryByText(/renews/)).toBeNull();
    expect(screen.getByText('SETTINGS')).toBeOnTheScreen();
    expect(screen.getByText('PRIVACY')).toBeOnTheScreen();
    expect(screen.getByText('HELP')).toBeOnTheScreen();
    // 4.0 has no movement picker, cues or frame-rate choice, and nothing read these
    for (const id of ['row-movement', 'row-frame-rate', 'toggle-voice', 'row-reminder', 'row-auto-delete', 'row-export-lifts']) expect(screen.queryByTestId(id)).toBeNull();
    for (const id of ['row-support', 'row-help']) expect(screen.queryByTestId(id)).toBeNull();
    await press(screen.getByTestId('row-stored'));
    await press(screen.getByTestId('row-delete'));
    await press(screen.getByTestId('row-report'));
    await press(screen.getByTestId('row-whats-new'));
    expect(screen.queryByText('See how it works')).toBeNull();
    expect(nav.onWhatIsStored).toHaveBeenCalledTimes(1);
    expect(nav.onDeleteAccount).toHaveBeenCalledTimes(1);
    expect(nav.onReport).toHaveBeenCalledTimes(1);
    expect(nav.onWhatsNew).toHaveBeenCalledTimes(1);
  });

  it('shows the exact build at the bottom', async () => {
    jest.spyOn(problemReports, 'reportDetails').mockReturnValue({ appVersion: '3.1', updateId: 'ota-42', device: 'iPhone19,7 iOS 27.0.1' });
    const screen = await render(<YouScreen nav={nav} />);
    expect(screen.getByTestId('you-build')).toHaveTextContent('Catchline 3.1 · update ota-42 · iPhone19,7 iOS 27.0.1');
  });

  it('picks units from a sheet', async () => {
    const screen = await render(<YouScreen nav={nav} />);
    await press(screen.getByTestId('row-units'));
    await press(screen.getByTestId('pick-lb'));
    expect(useSettings.getState().units).toBe('lb');
    expect(within(screen.getByTestId('row-units')).getByText('lb')).toBeOnTheScreen();
    expect(screen.queryByTestId('option-sheet')).toBeNull();
  });

  it('toggles haptics, and it reaches the haptics module', async () => {
    const screen = await render(<YouScreen nav={nav} />);
    await act(async () => {
      fireEvent(screen.getByTestId('toggle-haptics'), 'valueChange', false);
    });
    expect(useSettings.getState().haptics).toBe(false);
    expect(isHapticsEnabled()).toBe(false);
    await act(async () => {
      fireEvent(screen.getByTestId('toggle-haptics'), 'valueChange', true);
    });
    expect(isHapticsEnabled()).toBe(true);
  });

  it('renames the profile', async () => {
    const screen = await render(<YouScreen nav={nav} />);
    await press(screen.getByTestId('row-profile'));
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('name-input'), '  Alex Tan ');
    });
    await press(screen.getByText('Save'));
    expect(within(screen.getByTestId('row-profile')).getByText('Alex Tan')).toBeOnTheScreen();
  });

  it('exports everything stored', async () => {
    const send = jest.fn(() => Promise.resolve());
    const screen = await render(<YouScreen nav={nav} exportData={send} />);
    await press(screen.getByTestId('row-export'));
    const bundle = (send.mock.calls[0] as unknown as [DataExport])[0];
    expect(bundle).toMatchObject({ account: { name: 'Alex', plan: 'Catchline Pro · Founding member' }, settings: DEFAULT_SETTINGS });
    expect(bundle.lifts.map((l) => l.id)).toEqual(useLibraryStore.getState().lifts.map((l) => l.id));
  });
});

describe('YouScreen with the backend on', () => {

  beforeEach(() => mockBackendEnabled.mockReturnValue(true));

  it('shows the anonymous account and the real free allowance, never the fixture', async () => {
    useUsage.getState().record('free', new Date());
    const screen = await render(<YouScreen nav={nav} />);
    expect(within(screen.getByTestId('row-profile')).getByText('Anonymous on this phone')).toBeOnTheScreen();
    expect(within(screen.getByTestId('row-profile')).queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Alex')).toBeNull();
    expect(screen.queryByText(/Signed in with/)).toBeNull();
    expect(within(screen.getByTestId('row-plan')).getByText('Free · 2 of 3 videos left this week')).toBeOnTheScreen();
    expect(screen.queryByTestId('founding-badge')).toBeNull();
    await press(screen.getByTestId('row-plan'));
    expect(nav.onPlan).toHaveBeenCalledTimes(1);
  });

  it('offers Sign in with Apple while anonymous and shows the account once signed in', async () => {
    const signIn = jest.fn(async () => {
      useAuthUser.setState({ userId: 'apple-1', anonymous: false, displayName: 'Alex Tan' });
      return { cancelled: false as const, userId: 'apple-1', transferred: true };
    });
    const screen = await render(<YouScreen nav={nav} signIn={signIn} />);
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
    const screen = await render(<YouScreen nav={nav} signIn={signIn} />);
    await press(screen.getByTestId('row-profile'));
    expect(screen.getByTestId('sign-in-failed')).toHaveTextContent("Apple sign-in didn't go through. Try again.");
    expect(within(screen.getByTestId('row-profile')).getByText('Anonymous on this phone')).toBeOnTheScreen();
  });

  it('shows "Signed in with Apple" as the title when Apple gave no name, and signs out', async () => {
    useAuthUser.setState({ userId: 'apple-1', anonymous: false, displayName: null });
    const signOut = jest.fn(async () => {
      useAuthUser.setState(NO_USER);
    });
    const screen = await render(<YouScreen nav={nav} signOut={signOut} />);
    expect(within(screen.getByTestId('row-profile')).getByText('Signed in with Apple')).toBeOnTheScreen();
    await press(screen.getByTestId('row-sign-out'));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId('row-profile')).getByText('Anonymous on this phone')).toBeOnTheScreen();
    expect(screen.queryByTestId('row-sign-out')).toBeNull();
  });

  it('exports the Apple name once signed in', async () => {
    useAuthUser.setState({ userId: 'apple-1', anonymous: false, displayName: 'Alex Tan' });
    const send = jest.fn(() => Promise.resolve());
    const screen = await render(<YouScreen nav={nav} exportData={send} />);
    await press(screen.getByTestId('row-export'));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ account: { name: 'Alex Tan', plan: 'Free · 3 of 3 videos left this week' } }));
  });

  it('shows a live founding member as Catchline Pro with the founding badge', async () => {
    usePurchases.getState().setDemoPlan('founding');
    useUsage.getState().record('founding', new Date());
    useUsage.getState().record('founding', new Date());
    const screen = await render(<YouScreen nav={nav} />);
    expect(within(screen.getByTestId('row-plan')).getByText('Catchline Pro · Founding member')).toBeOnTheScreen();
    expect(screen.getByTestId('founding-badge')).toBeOnTheScreen();
  });

  it('reads and writes units through the onboarding store', async () => {
    useOnboarding.getState().setUnits('lb');
    const screen = await render(<YouScreen nav={nav} />);
    expect(within(screen.getByTestId('row-units')).getByText('lb')).toBeOnTheScreen();
    await press(screen.getByTestId('row-units'));
    await press(screen.getByTestId('pick-kg'));
    expect(useOnboarding.getState().units).toBe('kg');
    expect(useSettings.getState().units).toBe('kg');
    expect(within(screen.getByTestId('row-units')).getByText('kg')).toBeOnTheScreen();
  });

  it('exports the anonymous account and the lifts in the library, not the fixture ids', async () => {
    const send = jest.fn(() => Promise.resolve());
    const screen = await render(<YouScreen nav={nav} exportData={send} />);
    await press(screen.getByTestId('row-export'));
    const bundle = (send.mock.calls[0] as unknown as [DataExport])[0];
    expect(bundle).toMatchObject({ account: { name: '', plan: 'Free · 3 of 3 videos left this week' }, settings: DEFAULT_SETTINGS });
    expect(bundle.lifts.map((l) => l.id)).toEqual(['l-snatch-today', 'l-clean', 'l-mu', 'l-jerk', 'l-snatch-queued', 'l-snatch-miss', 'l-snatch-real', 'l-snatch-low']);
    expect(bundle.lifts.every((l) => l.date && l.movement)).toBe(true);
  });

});

describe('exportMyData', () => {
  it('carries each lift itself (date, movement, cue, every seen measurement), not just its id', async () => {
    const analysis = ANALYSES['snatch-mock'];
    const lift = { id: 'l1', movement: 'snatch' as const, date: '2026-10-11', loadKg: 60, status: 'analysed' as const, analysisId: 'snatch-mock' };
    const bundle = await createLocalAccountRepository().exportAllData(DEFAULT_SETTINGS, [{ lift: lift as never, analysis }]);
    const seen = analysis.measurements.filter((m: { status: string }) => m.status !== 'not_seen');
    expect(bundle.lifts).toHaveLength(1);
    expect(bundle.lifts[0]).toMatchObject({ id: 'l1', date: '2026-10-11', movement: 'snatch', loadKg: 60, cue: analysis.cue?.text });
    expect(bundle.lifts[0].measurements).toEqual(seen.map((m) => ({ id: m.id, label: m.label, value: m.value, unit: m.unit })));
    expect(seen.length).toBeGreaterThan(0);
  });

  it('stamps the export time from the repository clock', async () => {
    const repo = createLocalAccountRepository(() => new Date('2026-10-11T10:00:00.000Z'));
    const bundle = await repo.exportAllData(DEFAULT_SETTINGS, []);
    expect(bundle.exportedAt).toBe('2026-10-11T10:00:00.000Z');
    const send = jest.fn(() => Promise.resolve());
    await exportMyData(send);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('shares the export as a named JSON file on iOS', async () => {
    Platform.OS = 'ios';
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    const bundle = await createLocalAccountRepository(() => new Date('2026-10-11T10:00:00.000Z')).exportAllData(DEFAULT_SETTINGS, []);
    await shareExport(bundle);
    const file = (File as unknown as jest.Mock).mock.results[0].value;
    expect((File as unknown as jest.Mock).mock.calls[0][1]).toBe('catchline-data.json');
    expect(file.create).toHaveBeenCalledWith({ overwrite: true });
    expect(file.write).toHaveBeenCalledWith(JSON.stringify(bundle, null, 2));
    expect(share).toHaveBeenCalledWith({ url: 'file:///cache/catchline-data.json' });
  });
});

describe('WhatIsStoredScreen', () => {
  it('spells out what is kept, with no training opt-in', async () => {
    const onExport = jest.fn();
    const screen = await render(<WhatIsStoredScreen onBack={jest.fn()} onExport={onExport} />);
    expect(screen.getByText('On your phone. Analysed on your iPhone, never uploaded.')).toBeOnTheScreen();
    expect(screen.getAllByText('kept')).toHaveLength(4);
    expect(screen.queryByTestId('toggle-improve')).toBeNull();
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
    expect(screen.getByText('38 original clips take 4.1 GB. Your tracked lifts stay either way.')).toBeOnTheScreen();
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
