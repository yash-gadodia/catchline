import { act, fireEvent, render } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { snatchMock } from '../../analysis/fixtures';
import SendToCoachSheet, { coachMessage } from './SendToCoachSheet';
import FromCoachCard, { overrideDateLabel } from './FromCoachCard';
import { createLocalCoachRepository, useCoachStore } from './coachRepository';

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

const initialCoach = useCoachStore.getState();
beforeEach(() => {
  jest.clearAllMocks();
  useCoachStore.setState(initialCoach, true);
});

describe('coach repository', () => {
  it('creates a 30-day link and stores overrides', async () => {
    const repo = createLocalCoachRepository(() => new Date('2026-10-11T10:00:00.000Z'));
    const link = await repo.createLink('snatch-mock', { includeCue: true, includeRecent: false });
    expect(link).toEqual({
      id: '7f3a',
      analysisId: 'snatch-mock',
      url: 'https://yash-gadodia.github.io/catchline/l/7f3a',
      includeCue: true,
      includeRecent: false,
      createdAt: '2026-10-11T10:00:00.000Z',
      expiresAt: '2026-11-10T10:00:00.000Z',
    });
    expect((await repo.createLink('snatch-mock', { includeCue: false, includeRecent: true })).id).toBe('7f3b');
    expect(repo.getOverride('snatch-real')).toBeNull();
    await repo.saveOverride({
      analysisId: 'snatch-real',
      coachName: 'Sam',
      text: 'Finish the pull',
      replacedCue: 'Land where you started',
      metricLabel: 'Jump forward',
      createdAt: '2026-10-11T10:00:00.000Z',
    });
    expect(repo.getOverride('snatch-real')?.text).toBe('Finish the pull');
  });
});

describe('SendToCoachSheet', () => {
  it('copies the link and shares it through WhatsApp, Messages and More', async () => {
    const open = jest.fn(() => Promise.resolve());
    const share = jest.fn(() => Promise.resolve());
    const repo = createLocalCoachRepository(() => new Date('2026-10-11T10:00:00.000Z'));
    const screen = await render(
      <SendToCoachSheet analysis={snatchMock} onClose={jest.fn()} deps={{ repo, copy: Clipboard.setStringAsync, open, share }} />
    );
    expect(screen.getByText('A link to this lift with the overlay, the cue and the numbers. No login for them. Expires in 30 days.')).toBeOnTheScreen();
    await press(screen.getByText('Copy link'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://yash-gadodia.github.io/catchline/l/7f3a');
    expect(screen.getByText('Link copied')).toBeOnTheScreen();
    expect(screen.getByTestId('coach-link-url')).toHaveTextContent('https://yash-gadodia.github.io/catchline/l/7f3a');
    await press(screen.getByText('WhatsApp'));
    expect(open).toHaveBeenCalledWith(`whatsapp://send?text=${encodeURIComponent(coachMessage('https://yash-gadodia.github.io/catchline/l/7f3a'))}`);
    await press(screen.getByText('Messages'));
    expect(open).toHaveBeenLastCalledWith(`sms:&body=${encodeURIComponent('Can you check this lift? https://yash-gadodia.github.io/catchline/l/7f3a')}`);
    await press(screen.getByText('More'));
    expect(share).toHaveBeenCalledWith('Can you check this lift? https://yash-gadodia.github.io/catchline/l/7f3a');
    expect(useCoachStore.getState().links).toHaveLength(1);
  });

  it('mints a new link when the toggles change', async () => {
    const repo = createLocalCoachRepository(() => new Date('2026-10-11T10:00:00.000Z'));
    const screen = await render(
      <SendToCoachSheet analysis={snatchMock} onClose={jest.fn()} deps={{ repo, copy: Clipboard.setStringAsync, open: jest.fn(), share: jest.fn() }} />
    );
    await press(screen.getByText('Copy link'));
    await act(async () => {
      fireEvent(screen.getByTestId('include-recent'), 'valueChange', true);
    });
    await press(screen.getByText('Link copied'));
    expect(useCoachStore.getState().links.map((l) => [l.id, l.includeRecent])).toEqual([
      ['7f3a', false],
      ['7f3b', true],
    ]);
  });
});

describe('FromCoachCard', () => {
  it('shows the coach override in place of the app cue', async () => {
    const override = useCoachStore.getState().overrides['snatch-mock'];
    const onTry = jest.fn();
    const screen = await render(<FromCoachCard override={override} onTry={onTry} now={new Date('2026-10-11T12:00:00.000Z')} />);
    expect(screen.getByText('today')).toBeOnTheScreen();
    expect(screen.getByTestId('coach-cue')).toHaveTextContent('Sit back into the start, chest up. Pull slower off the floor.');
    expect(
      screen.getByText('Replaces "Stay over the bar longer". Catchline will track bar drift at hip against this cue instead.')
    ).toBeOnTheScreen();
    await press(screen.getByText('Try this next session'));
    expect(onTry).toHaveBeenCalledTimes(1);
  });

  it('labels older overrides by date', () => {
    expect(overrideDateLabel('2026-09-30T08:00:00.000Z', new Date('2026-10-11T12:00:00.000Z'))).toBe('30 sep');
  });
});
