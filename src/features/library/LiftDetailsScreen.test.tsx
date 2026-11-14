import { act, fireEvent, render, within } from '@testing-library/react-native';
import LiftDetailsRoute from '../../../app/analysis/details';
import LiftDetailsScreen from './LiftDetailsScreen';
import { useLiftDetails } from './liftDetails';
import { useLiftNames } from './liftNames';
import { emptyLibrary } from './seed';
import { useLibraryStore } from './store';

const params: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
  return { __esModule: true, router: r, useRouter: () => r, useLocalSearchParams: () => params.current };
});
const mockNav = jest.requireMock('expo-router').router as { replace: jest.Mock; back: jest.Mock; canGoBack: jest.Mock };

const doing = async (fn: () => void) => {
  await act(async () => {
    fn();
  });
};
const saved = () => useLiftDetails.getState().details;

beforeEach(() => {
  jest.clearAllMocks();
  params.current = {};
  useLiftDetails.setState({ details: {} });
  useLiftNames.setState({ shapes: {} });
});

describe('LiftDetailsScreen', () => {
  it('shows the detected kind until the lifter names the lift, and saves the name as typed', async () => {
    const onBack = jest.fn();
    const { getByTestId, getByText } = await render(<LiftDetailsScreen id="l1" kind="Snatch" title="14:32 · 62.5 kg" back="Back" onBack={onBack} />);
    expect(getByTestId('details-name')).toHaveProp('placeholder', 'Snatch');
    expect(getByTestId('details-name')).toHaveProp('value', '');
    expect(getByText('14:32 · 62.5 kg')).toBeOnTheScreen();
    expect(getByTestId('details-private')).toHaveTextContent('Saved on this phone only.');
    await doing(() => fireEvent.changeText(getByTestId('details-name'), 'Opener '));
    expect(getByTestId('details-name')).toHaveProp('value', 'Opener ');
    expect(saved()).toEqual({ l1: { name: 'Opener', tags: [], note: '' } });
    await doing(() => fireEvent.changeText(getByTestId('details-name'), ''));
    expect(saved()).toEqual({});
    await doing(() => fireEvent.press(getByTestId('topbar-back')));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('asks for a name where no kind was read, and opens on what was saved', async () => {
    useLiftDetails.setState({ details: { l1: { name: 'Opener', tags: ['pr'], note: 'Felt fast' } } });
    const { getByTestId, rerender } = await render(<LiftDetailsScreen id="l1" kind={null} title="" back="Back" onBack={jest.fn()} />);
    expect(getByTestId('details-name')).toHaveProp('value', 'Opener');
    expect(getByTestId('details-note')).toHaveProp('value', 'Felt fast');
    expect(getByTestId('details-tag-pr')).toHaveTextContent('pr×');
    await rerender(<LiftDetailsScreen key="l2" id="l2" kind={null} title="" back="Back" onBack={jest.fn()} />);
    expect(getByTestId('details-name')).toHaveProp('placeholder', 'Name this lift');
  });

  it('adds a tag on return, suggests the ones used on other lifts, and removes one on a tap', async () => {
    useLiftDetails.setState({ details: { other: { name: '', tags: ['heavy', 'belt'], note: '' }, more: { name: '', tags: ['heavy'], note: '' } } });
    const { getByTestId, getAllByTestId, queryByTestId } = await render(<LiftDetailsScreen id="l1" kind="Clean" title="" back="Back" onBack={jest.fn()} />);
    expect(queryByTestId('details-tags')).toBeNull();
    expect(getAllByTestId(/^details-suggest-/).map((n) => n.props.testID)).toEqual(['details-suggest-heavy', 'details-suggest-belt']);

    await doing(() => fireEvent.changeText(getByTestId('details-tag-input'), '#PR'));
    expect(queryByTestId('details-suggestions')).toBeNull();
    await doing(() => fireEvent(getByTestId('details-tag-input'), 'submitEditing'));
    expect(saved().l1.tags).toEqual(['PR']);
    expect(getByTestId('details-tag-input')).toHaveProp('value', '');

    await doing(() => fireEvent.press(getByTestId('details-suggest-heavy')));
    expect(saved().l1.tags).toEqual(['PR', 'heavy']);
    expect(getAllByTestId(/^details-suggest-/).map((n) => n.props.testID)).toEqual(['details-suggest-belt']);
    expect(getByTestId('details-tag-heavy')).toHaveProp('accessibilityLabel', 'Remove tag heavy');

    // a tag it already has stays in the field, so the lifter sees nothing was added
    await doing(() => fireEvent.changeText(getByTestId('details-tag-input'), 'pr'));
    await doing(() => fireEvent(getByTestId('details-tag-input'), 'submitEditing'));
    expect(saved().l1.tags).toEqual(['PR', 'heavy']);
    expect(getByTestId('details-tag-input')).toHaveProp('value', 'pr');

    await doing(() => fireEvent.press(getByTestId('details-tag-PR')));
    expect(saved().l1.tags).toEqual(['heavy']);
    expect(queryByTestId('details-tag-PR')).toBeNull();
  });

  it('saves the note as typed', async () => {
    const { getByTestId } = await render(<LiftDetailsScreen id="l1" kind="Clean" title="" back="Back" onBack={jest.fn()} />);
    expect(getByTestId('details-note')).toHaveProp('multiline', true);
    await doing(() => fireEvent.changeText(getByTestId('details-note'), 'Hips shot up.\nStay over the bar.'));
    expect(saved()).toEqual({ l1: { name: '', tags: [], note: 'Hips shot up.\nStay over the bar.' } });
  });

  it('takes away the tag field once the lift has eight tags', async () => {
    useLiftDetails.setState({ details: { l1: { name: '', tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], note: '' }, other: { name: '', tags: ['z'], note: '' } } });
    const { queryByTestId, getAllByTestId } = await render(<LiftDetailsScreen id="l1" kind={null} title="" back="Back" onBack={jest.fn()} />);
    expect(getAllByTestId(/^details-tag-[a-h]$/)).toHaveLength(8);
    expect(queryByTestId('details-tag-input')).toBeNull();
    expect(queryByTestId('details-suggestions')).toBeNull();
  });

  it('keeps every field in one scroll view that stays tappable while the keyboard is up', async () => {
    const { getByTestId } = await render(<LiftDetailsScreen id="l1" kind={null} title="" back="Back" onBack={jest.fn()} />);
    const scroll = getByTestId('details-scroll');
    expect(scroll.type).toBe('RCTScrollView');
    expect(scroll).toHaveProp('keyboardShouldPersistTaps', 'handled');
    for (const field of ['details-name', 'details-tag-input', 'details-note']) expect(within(scroll).getByTestId(field)).toBeOnTheScreen();
  });
});

describe('/analysis/details', () => {
  beforeEach(() => {
    useLibraryStore.getState().load({
      ...emptyLibrary(),
      lifts: [{ id: 'row-1', movement: 'snatch', date: '2026-03-11', status: 'done', analysisId: 'a-1', loadKg: 80 }],
    });
    useLiftNames.setState({ shapes: { 'a-1': 'floor-overhead' } });
  });

  it('opens the lift by the id the player uses, with its kind and title', async () => {
    params.current = { id: 'a-1' };
    const { getByTestId, getByText } = await render(<LiftDetailsRoute />);
    expect(getByTestId('details-name')).toHaveProp('placeholder', 'Snatch');
    expect(getByText('11 Mar · 80 kg')).toBeOnTheScreen();
    await doing(() => fireEvent.changeText(getByTestId('details-name'), 'Opener'));
    expect(saved()).toEqual({ 'a-1': { name: 'Opener', tags: [], note: '' } });
    await doing(() => fireEvent.press(getByTestId('topbar-back')));
    expect(mockNav.back).toHaveBeenCalledTimes(1);
  });

  it('says the lift is missing for an id the library does not hold, and writes nothing', async () => {
    params.current = { id: 'gone' };
    const { getByTestId, queryByTestId } = await render(<LiftDetailsRoute />);
    expect(getByTestId('analysis-missing')).toBeOnTheScreen();
    expect(queryByTestId('lift-details')).toBeNull();
    mockNav.canGoBack.mockReturnValueOnce(false);
    await doing(() => fireEvent.press(getByTestId('analysis-back')));
    expect(mockNav.replace).toHaveBeenCalledWith('/');
  });
});
