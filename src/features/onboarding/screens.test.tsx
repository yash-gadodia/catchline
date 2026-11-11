import { act, fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';
import CameraScreen from './CameraScreen';
import GuideScreen, { guideLines } from './GuideScreen';
import PrivacyScreen from './PrivacyScreen';
import WelcomeScreen from './WelcomeScreen';

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => jest.clearAllMocks());

describe('1. Welcome', () => {
  it('makes the promise, says the video stays on the phone, and has one way on', async () => {
    const onContinue = jest.fn();
    const screen = await render(<WelcomeScreen onContinue={onContinue} />);
    expect(screen.getByTestId('welcome-hero')).toHaveProp('source', require('../../../assets/art/welcome-hero.png'));
    expect(screen.getByText('See your lift.')).toBeOnTheScreen();
    expect(screen.getByText('Bar path and body lines on every frame.')).toBeOnTheScreen();
    expect(screen.getByText('Everything runs on your phone. Your video never leaves it.')).toBeOnTheScreen();
    expect(screen.getByText(/By continuing you confirm you are over 16 and accept the terms and privacy policy\./)).toBeOnTheScreen();
    expect(screen.queryByText(/cue|fix|sample|how it works/i)).toBeNull();
    await press(screen.getByTestId('welcome-start'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('opens the published terms and privacy policy', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = await render(<WelcomeScreen onContinue={jest.fn()} />);
    await press(screen.getByTestId('link-terms'));
    expect(open).toHaveBeenLastCalledWith('https://yash-gadodia.github.io/catchline/legal/terms.html');
    await press(screen.getByTestId('link-privacy'));
    expect(open).toHaveBeenLastCalledWith('https://yash-gadodia.github.io/catchline/legal/privacy.html');
    open.mockRestore();
  });
});

describe('2. How to film', () => {
  it('says phone still, whole body and plate in frame, side view for the bar path', async () => {
    const onDone = jest.fn();
    const screen = await render(<GuideScreen label="Next" onDone={onDone} />);
    expect(guideLines()).toEqual([
      'Keep the phone still, on the floor or a plate stack.',
      'Get your whole body and the plate in frame.',
      'A side view gives the best bar path. Any angle works for body lines.',
    ]);
    for (const line of guideLines()) expect(screen.getByText(line)).toBeOnTheScreen();
    expect(screen.getByText('How to film it')).toBeOnTheScreen();
    expect(screen.queryByTestId('guide-hide')).toBeNull();
    await press(screen.getByText('Next'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('3. Add your first video', () => {
  const handlers = () => ({ onChoose: jest.fn(), onFilm: jest.fn(), onSettings: jest.fn() });

  it('offers a video from Photos first and filming second', async () => {
    const h = handlers();
    const screen = await render(<CameraScreen denied={false} {...h} />);
    expect(screen.getByTestId('add-video')).toBeOnTheScreen();
    expect(screen.getByText('Add your first video')).toBeOnTheScreen();
    expect(screen.getByText('Pick one from Photos or film a lift now. The camera only records when you press the button.')).toBeOnTheScreen();
    await press(screen.getByText('Choose a video'));
    expect(h.onChoose).toHaveBeenCalledTimes(1);
    expect(h.onFilm).toHaveBeenCalledTimes(0);
    await press(screen.getByText('Film a lift'));
    expect(h.onFilm).toHaveBeenCalledTimes(1);
  });

  it('with the camera off, points to Settings and still lets the lifter choose a video', async () => {
    const h = handlers();
    const screen = await render(<CameraScreen denied {...h} />);
    expect(screen.getByTestId('camera-denied')).toBeOnTheScreen();
    expect(screen.getByText('Camera is off for Catchline.')).toBeOnTheScreen();
    expect(screen.getByText("Turn it on in Settings, or choose a video you've already filmed.")).toBeOnTheScreen();
    expect(screen.queryByText('Film a lift')).toBeNull();
    await press(screen.getByText('Open Settings'));
    expect(h.onSettings).toHaveBeenCalledTimes(1);
    await press(screen.getByText('Choose a video'));
    expect(h.onChoose).toHaveBeenCalledTimes(1);
  });
});

describe('Privacy and consent (asked again only when the consent on this phone is out of date)', () => {
  it('blocks Continue until the required box is ticked', async () => {
    const onContinue = jest.fn();
    const screen = await render(<PrivacyScreen onContinue={onContinue} />);
    expect(screen.getByText('What happens to your video')).toBeOnTheScreen();
    expect(screen.getByText('Your video never leaves your iPhone. Tracked on-device, never used to train AI.')).toBeOnTheScreen();
    expect(screen.getByText('We measure positions, not faces.')).toBeOnTheScreen();
    expect(screen.queryByText(/cue/i)).toBeNull();
    expect(screen.getByTestId('privacy-continue')).toBeDisabled();
    await press(screen.getByTestId('privacy-continue'));
    expect(onContinue).not.toHaveBeenCalled();

    await press(screen.getByTestId('consent-required'));
    await press(screen.getByTestId('privacy-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('opens the published privacy policy and terms', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = await render(<PrivacyScreen onContinue={jest.fn()} />);
    await press(screen.getByTestId('link-privacy'));
    expect(open).toHaveBeenLastCalledWith('https://yash-gadodia.github.io/catchline/legal/privacy.html');
    await press(screen.getByTestId('link-terms'));
    expect(open).toHaveBeenLastCalledWith('https://yash-gadodia.github.io/catchline/legal/terms.html');
    open.mockRestore();
  });
});
