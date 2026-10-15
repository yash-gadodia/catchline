import { act, fireEvent, render } from '@testing-library/react-native';
import { snatchMock, snatchMockLow } from '../../analysis/fixtures';
import type { Note } from '../../analysis/types';
import { loadLibrary } from '../library/repository';
import CueNotes from './CueNotes';
import CueScreen from './CueScreen';
import PlayerScreen from './PlayerScreen';

const notes: Note[] = [
  {
    faultId: 'hips_rise_early',
    text: 'Push the floor down, chest comes up.',
    why: 'Your back angle dropped 12 deg between the floor and the knee, which put the bar in front of you.',
    severity: 2,
    reps: 2,
  },
  { faultId: 'jump_forward', text: 'Land on the line you started on.', why: 'Your feet landed 7 cm in front.', severity: 1.4, reps: 1 },
];
const nav = { onTry: jest.fn(), onNotForMe: jest.fn(), onBack: jest.fn(), onFilmAgain: jest.fn() };

beforeEach(() => loadLibrary('seeded'));

describe('CueNotes', () => {
  it('renders nothing without notes, old analyses included', async () => {
    expect((await render(<CueNotes notes={[]} />)).toJSON()).toBeNull();
    expect((await render(<CueNotes />)).toJSON()).toBeNull();
  });

  it('lists each sub-note with its why, and a long why expands on tap', async () => {
    const { getByText, getByTestId } = await render(<CueNotes notes={notes} />);
    expect(getByText('ALSO WORTH A LOOK')).toBeOnTheScreen();
    expect(getByText('Push the floor down, chest comes up.')).toBeOnTheScreen();
    expect(getByText('Land on the line you started on.')).toBeOnTheScreen();
    expect(getByTestId('note-why-hips_rise_early').props.numberOfLines).toBe(1);
    await act(async () => {
      fireEvent.press(getByTestId('note-hips_rise_early'));
    });
    expect(getByTestId('note-why-hips_rise_early').props.numberOfLines).toBeUndefined();
    expect(getByTestId('note-hips_rise_early')).toBeExpanded();
    expect(getByTestId('note-jump_forward')).toBeDisabled();
  });

  it('caps the list at three', async () => {
    const many = [0, 1, 2, 3].map((i) => ({ ...notes[1], faultId: `f${i}`, text: `Note ${i}` }));
    const { queryByText } = await render(<CueNotes notes={many} />);
    expect(queryByText('Note 2')).toBeOnTheScreen();
    expect(queryByText('Note 3')).toBeNull();
  });
});

describe('sub-notes on the result screens', () => {
  it('the player keeps the headline cue and lists the notes under it', async () => {
    const { getByText, getByTestId } = await render(
      <PlayerScreen analysis={{ ...snatchMock, notes }} onBack={() => {}} onShare={() => {}} />
    );
    expect(getByText(snatchMock.cue!.text)).toBeOnTheScreen();
    expect(getByTestId('player-cue-area')).toContainElement(getByTestId('cue-notes'));
    expect(getByTestId('player-share')).toBeOnTheScreen();
  });

  it('the player shows no notes section on an analysis without notes', async () => {
    const { queryByTestId } = await render(<PlayerScreen analysis={snatchMock} onBack={() => {}} onShare={() => {}} />);
    expect(queryByTestId('cue-notes')).toBeNull();
  });

  it('the cue screen lists them under the headline, confident and low-confidence alike', async () => {
    const clear = await render(<CueScreen analysis={{ ...snatchMock, notes }} nav={nav} />);
    expect(clear.getByTestId('cue-text')).toHaveTextContent(snatchMock.cue!.text);
    expect(clear.getByText('Land on the line you started on.')).toBeOnTheScreen();
    const low = await render(<CueScreen analysis={{ ...snatchMockLow, notes }} nav={nav} />);
    expect(low.getByText('Land on the line you started on.')).toBeOnTheScreen();
  });
});
