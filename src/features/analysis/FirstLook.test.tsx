import { act, fireEvent, render } from '@testing-library/react-native';
import { EVENTS, track } from '../../lib/analytics';
import { useLiftNames } from '../library/liftNames';
import FirstLook, { type FirstLookKind } from './FirstLook';

jest.mock('../../lib/analytics', () => ({ ...jest.requireActual('../../lib/analytics'), track: jest.fn() }));

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};
const show = (kind: FirstLookKind, more: Partial<Parameters<typeof FirstLook>[0]> = {}) =>
  render(<FirstLook kind={kind} first={false} peak={kind === 'path' ? 1.84 : null} free={false} bottomInset={0} onDetail={() => {}} onShare={() => {}} onAnother={() => {}} liftId="L1" onMoreKinds={() => {}} {...more} />);
const chips = (all: { props: { testID?: string } }[]) => all.map((n) => n.props.testID);
const selected = (el: { props: { accessibilityState?: { selected?: boolean } } }) => el.props.accessibilityState?.selected;

beforeEach(() => {
  jest.mocked(track).mockClear();
  useLiftNames.setState({ shapes: {}, chosen: {} });
});

describe('what was this lift, on the result card', () => {
  it('a bar path asks with the kind the app read first and selected, the barbell lifts, then More', async () => {
    useLiftNames.setState({ shapes: { L1: 'floor-overhead' }, chosen: {} });
    const { getByTestId, getAllByTestId } = await show('path');
    expect(getByTestId('first-look-kinds')).toHaveTextContent(/^What was this lift\?SnatchCleanClean and jerk/);
    expect(chips(getAllByTestId(/^first-look-kind-/))).toEqual([
      'first-look-kind-snatch',
      'first-look-kind-clean',
      'first-look-kind-cleanJerk',
      'first-look-kind-jerk',
      'first-look-kind-squat',
      'first-look-kind-deadlift',
      'first-look-kind-pull',
      'first-look-kind-overhead',
      'first-look-kind-more',
    ]);
    expect(selected(getByTestId('first-look-kind-snatch'))).toBe(true);
    expect(selected(getByTestId('first-look-kind-clean'))).toBe(false);
  });

  it('a hip trail starts with the gymnastics kinds, then the lifter\'s own', async () => {
    useLiftNames.setState({ shapes: {}, chosen: { other: 'Ring dip' } });
    const { getAllByTestId } = await show('trail');
    expect(chips(getAllByTestId(/^first-look-kind-/))).toEqual([
      'first-look-kind-pullUp',
      'first-look-kind-butterflyPullUp',
      'first-look-kind-muscleUp',
      'first-look-kind-handstandPushUp',
      'first-look-kind-Ring dip',
      'first-look-kind-more',
    ]);
  });

  it('a tap sets the kind and shows it selected, a second tap clears it, each one tracked', async () => {
    const { getByTestId } = await show('trail');
    await press(getByTestId('first-look-kind-pullUp'));
    expect(useLiftNames.getState().chosen).toEqual({ L1: 'pullUp' });
    expect(selected(getByTestId('first-look-kind-pullUp'))).toBe(true);
    expect(track).toHaveBeenLastCalledWith(EVENTS.LIFT_KIND_SET, { kind: 'pullUp' });
    await press(getByTestId('first-look-kind-muscleUp'));
    expect(useLiftNames.getState().chosen).toEqual({ L1: 'muscleUp' });
    expect(selected(getByTestId('first-look-kind-pullUp'))).toBe(false);
    await press(getByTestId('first-look-kind-muscleUp'));
    expect(useLiftNames.getState().chosen).toEqual({});
    expect(selected(getByTestId('first-look-kind-muscleUp'))).toBe(false);
    expect(track).toHaveBeenLastCalledWith(EVENTS.LIFT_KIND_SET, { kind: 'cleared' });
    expect(track).toHaveBeenCalledTimes(3);
  });

  it("the lifter's own kind is tracked as own, never by its words", async () => {
    useLiftNames.setState({ shapes: {}, chosen: { other: 'Ring dip' } });
    const { getByTestId } = await show('trail');
    await press(getByTestId('first-look-kind-Ring dip'));
    expect(useLiftNames.getState().chosen).toEqual({ other: 'Ring dip', L1: 'Ring dip' });
    expect(track).toHaveBeenLastCalledWith(EVENTS.LIFT_KIND_SET, { kind: 'own' });
  });

  it('More opens the details', async () => {
    const onMoreKinds = jest.fn();
    const { getByTestId } = await show('none', { onMoreKinds });
    expect(getByTestId('first-look-kind-more')).toHaveTextContent('More');
    await press(getByTestId('first-look-kind-more'));
    expect(onMoreKinds).toHaveBeenCalledTimes(1);
    expect(track).not.toHaveBeenCalled();
  });

  it('the sample asks nothing', async () => {
    const { queryByTestId, getByTestId } = await show('sample');
    expect(getByTestId('first-look')).toBeOnTheScreen();
    expect(queryByTestId('first-look-kinds')).toBeNull();
  });

  it('tells the screen how tall it needs to be, so the video can make room', async () => {
    const onNeed = jest.fn();
    const { getByTestId } = await show('path', { onNeed });
    await act(async () => {
      fireEvent(getByTestId('first-look-top'), 'layout', { nativeEvent: { layout: { height: 92 } } });
    });
    await act(async () => {
      fireEvent(getByTestId('first-look-bottom'), 'layout', { nativeEvent: { layout: { height: 202 } } });
    });
    // 16 above, 92 + 16 + 202, and 16 below
    expect(onNeed).toHaveBeenLastCalledWith(342);
  });
});
