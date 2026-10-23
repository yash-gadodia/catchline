import { act, fireEvent, render } from '@testing-library/react-native';
import { en } from '../../i18n/en';
import { CHANGELOG } from './changelog';
import { takeWhatsNew, useWhatsNew } from './store';
import WhatsNewScreen from './WhatsNewScreen';

beforeEach(() => useWhatsNew.setState({ seen: null }));

describe("What's new", () => {
  it('opens once after an update to a version with an entry', () => {
    expect(takeWhatsNew(true, '3.1')).toBe(true);
    expect(takeWhatsNew(true, '3.1')).toBe(false);
    expect(useWhatsNew.getState().seen).toBe('3.1');
  });

  it('stays shut on a fresh install, and for a version with no entry', () => {
    expect(takeWhatsNew(false, '3.1')).toBe(false);
    expect(takeWhatsNew(true, '3.1')).toBe(false);
    useWhatsNew.setState({ seen: null });
    expect(takeWhatsNew(true, '9.9')).toBe(false);
    expect(useWhatsNew.getState().seen).toBeNull();
  });

  it('leads 3.1 with on-device analysis and the privacy line, word for word', () => {
    expect(CHANGELOG[0].version).toBe('3.1');
    expect(CHANGELOG[0].items.map((k) => en[k])).toEqual([
      'Your lift is now analysed entirely on your iPhone, and analysis works with no signal.',
      'Your video never leaves your iPhone. Analysed on-device, never used to train AI.',
      'Sharper reads of lifts filmed at an angle and of hang lifts, and a full clean and jerk is read as one lift.',
      'Fixed: a bar that stalls at the hips no longer throws off the read.',
    ]);
  });

  it('shows every entry from the changelog file and goes back', async () => {
    const onBack = jest.fn();
    const view = await render(<WhatsNewScreen back="You" onBack={onBack} />);
    expect(view.getByTestId('whats-new-3.1')).toHaveTextContent(/Your lift is now analysed entirely on your iPhone/);
    expect(view.getByText('Your video never leaves your iPhone. Analysed on-device, never used to train AI.')).toBeOnTheScreen();
    await act(async () => fireEvent.press(view.getByTestId('topbar-back')));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
