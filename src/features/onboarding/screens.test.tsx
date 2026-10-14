import { act, fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { snatchMock } from '../../analysis/fixtures';
import AccountScreen, { ACCOUNT_COPY } from './AccountScreen';
import CameraScreen from './CameraScreen';
import GuideScreen, { GUIDE } from './GuideScreen';
import LaunchScreen from './LaunchScreen';
import LiftPickerScreen from './LiftPickerScreen';
import PrivacyScreen from './PrivacyScreen';
import SampleScreen, { COACH_MARKS } from './SampleScreen';
import WelcomeScreen from './WelcomeScreen';

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => jest.clearAllMocks());

describe('Launch', () => {
  it('shows the mark', async () => {
    const { getByTestId } = await render(<LaunchScreen />);
    expect(getByTestId('launch-screen')).toHaveProp('accessibilityLabel', 'Catchline');
  });
});

describe('Welcome', () => {
  it('stacks the sample strobe under the drawing path and offers start or import', async () => {
    const onStart = jest.fn();
    const onImport = jest.fn();
    const onSample = jest.fn();
    const { getByTestId, getByText, getAllByTestId } = await render(
      <WelcomeScreen sample={snatchMock} onStart={onStart} onImport={onImport} onSample={onSample} reduceMotion />
    );
    expect(getAllByTestId(/^welcome-strobe-/).map((n) => n.props.testID)).toEqual([
      'welcome-strobe-setup',
      'welcome-strobe-first_pull',
      'welcome-strobe-transition',
      'welcome-strobe-second_pull',
      'welcome-strobe-catch',
    ]);
    expect(getByTestId('drawn-path')).toBeOnTheScreen();
    expect(getByText('Film a lift.\nGet the one thing to fix.')).toBeOnTheScreen();
    await press(getByTestId('welcome-start'));
    await press(getByTestId('welcome-import'));
    await press(getByText('Try a sample lift'));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onSample).toHaveBeenCalledTimes(1);
  });
});

describe('Lift picker', () => {
  it('groups barbell and gymnastics, greys the soon tiles, and returns the picks', async () => {
    const onContinue = jest.fn();
    const screen = await render(
      <LiftPickerScreen initial={{ lifts: ['snatch'], focus: [], units: 'kg' }} onContinue={onContinue} onSkip={jest.fn()} />
    );
    expect(screen.getByTestId('group-barbell')).toHaveTextContent('BARBELLSnatchbar pathCleanbar pathJerkbar path');
    expect(screen.getByTestId('group-gymnastics')).toHaveTextContent(
      'GYMNASTICSKipping pull-uphip pathBar muscle-uphip pathKipping HSPUhead + hip'
    );
    expect(screen.getAllByTestId('lift-soon')).toHaveLength(3);
    expect(screen.getByText('Ring muscle-up')).toBeOnTheScreen();
    expect(screen.getByTestId('lift-snatch')).toBeChecked();

    await press(screen.getByTestId('lift-bar_muscle_up'));
    await press(screen.getByTestId('lift-snatch'));
    await press(screen.getByTestId('focus-First muscle-up'));
    await press(screen.getByTestId('units-lb'));
    await press(screen.getByTestId('lifts-continue'));
    expect(onContinue).toHaveBeenCalledWith({ lifts: ['bar_muscle_up'], focus: ['First muscle-up'], units: 'lb' });
  });
});

describe('Sample analysis', () => {
  it('runs the real player under a sample header, with two coach marks in turn', async () => {
    const onFilm = jest.fn();
    const screen = await render(<SampleScreen sample={snatchMock} onBack={jest.fn()} onFilm={onFilm} />);
    expect(screen.getByTestId('player-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('coach-mark-1')).toHaveTextContent(`${COACH_MARKS[0]}1 / 2Next`);
    await press(screen.getByTestId('coach-mark-1'));
    expect(screen.getByTestId('coach-mark-2')).toHaveTextContent(`${COACH_MARKS[1]}2 / 2Got it`);
    await press(screen.getByTestId('coach-mark-2'));
    expect(screen.queryByTestId('coach-mark-1')).toBeNull();
    expect(screen.queryByTestId('coach-mark-2')).toBeNull();
    await press(screen.getByText('Now film yours'));
    expect(onFilm).toHaveBeenCalledTimes(1);
  });
});

describe('Filming guide', () => {
  it.each(['barbell', 'gymnastics'] as const)('shows the %s lines and distance', async (group) => {
    const onHide = jest.fn();
    const screen = await render(<GuideScreen group={group} onDone={jest.fn()} onHide={onHide} />);
    for (const line of GUIDE[group].lines) expect(screen.getByText(line)).toBeOnTheScreen();
    await press(screen.getByText("Don't show again"));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('has no "don\'t show again" when opened from the viewfinder', async () => {
    const screen = await render(<GuideScreen group="barbell" onDone={jest.fn()} />);
    expect(screen.queryByText("Don't show again")).toBeNull();
  });
});

describe('Camera permission', () => {
  it('asks before the system prompt', async () => {
    const onAllow = jest.fn();
    const onImport = jest.fn();
    const screen = await render(<CameraScreen denied={false} onAllow={onAllow} onSettings={jest.fn()} onImport={onImport} />);
    expect(screen.getByText('Catchline needs the camera to film your lift.')).toBeOnTheScreen();
    await press(screen.getByText('Allow camera'));
    await press(screen.getByText('Import a clip instead'));
    expect(onAllow).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it('points to Settings when denied', async () => {
    const onSettings = jest.fn();
    const screen = await render(<CameraScreen denied onAllow={jest.fn()} onSettings={onSettings} onImport={jest.fn()} />);
    expect(screen.getByText('Camera is off for Catchline.')).toBeOnTheScreen();
    await press(screen.getByText('Open Settings'));
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Import a clip')).toBeOnTheScreen();
  });
});

describe('Account', () => {
  it('offers Apple as the primary action and a quiet way to continue without one', async () => {
    const onApple = jest.fn(() => Promise.resolve(true));
    const onSkip = jest.fn();
    const screen = await render(<AccountScreen onApple={onApple} onSkip={onSkip} />);
    expect(screen.getByText('Keep your lifts')).toBeOnTheScreen();
    expect(screen.getByText('Keeps your lifts and your plan if you change phones.')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-failed')).toBeNull();
    await press(screen.getByTestId('account-apple'));
    expect(onApple).toHaveBeenCalledTimes(1);
    await press(screen.getByTestId('account-skip'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('says so when Apple sign-in fails, and stays quiet on a cancel', async () => {
    const onApple = jest.fn((): Promise<boolean> => Promise.reject(new Error('bad nonce')));
    const screen = await render(<AccountScreen onApple={onApple} onSkip={jest.fn()} />);
    await press(screen.getByTestId('account-apple'));
    expect(screen.getByTestId('account-failed')).toHaveTextContent(ACCOUNT_COPY.failed);
    onApple.mockImplementation(() => Promise.resolve(false));
    await press(screen.getByTestId('account-apple'));
    expect(screen.queryByTestId('account-failed')).toBeNull();
    expect(onApple).toHaveBeenCalledTimes(2);
  });
});

describe('Privacy and consent', () => {
  it('blocks Continue until the required box is ticked, and passes the optional choice', async () => {
    const onContinue = jest.fn();
    const screen = await render(<PrivacyScreen initialImprove={false} onContinue={onContinue} />);
    expect(screen.getByText('Raw video is deleted within 24 hours. The overlay and numbers stay.')).toBeOnTheScreen();
    expect(screen.getByTestId('privacy-continue')).toBeDisabled();
    await press(screen.getByTestId('privacy-continue'));
    expect(onContinue).not.toHaveBeenCalled();

    await press(screen.getByTestId('consent-required'));
    await press(screen.getByTestId('consent-improve'));
    expect(screen.getByTestId('consent-improve')).toBeChecked();
    await press(screen.getByTestId('privacy-continue'));
    expect(onContinue).toHaveBeenCalledWith(true);
  });

  it('opens the published privacy policy and terms', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = await render(<PrivacyScreen initialImprove={false} onContinue={jest.fn()} />);
    await press(screen.getByTestId('link-privacy'));
    expect(open).toHaveBeenLastCalledWith('https://yash-gadodia.github.io/catchline/legal/privacy.html');
    await press(screen.getByTestId('link-terms'));
    expect(open).toHaveBeenLastCalledWith('https://yash-gadodia.github.io/catchline/legal/terms.html');
    open.mockRestore();
  });
});
