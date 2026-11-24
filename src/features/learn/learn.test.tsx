import { act, fireEvent, render } from '@testing-library/react-native';
import TabBar from '../library/TabBar';
import { SAMPLE_ANALYSIS, SAMPLE_BODY, SAMPLE_CLIP } from '../onboarding/sample';
import LearnScreen from './LearnScreen';
import { LEARN_LIFTS, LEARN_MIN, learnOpen, type LearnLift } from './lifts';

const lift = (id: string, over: Partial<LearnLift> = {}): LearnLift => ({ id, lifter: 'Test Lifter', kind: 'snatch', loadKg: 170, where: 'Training hall 2025', credit: 'A Channel', clip: SAMPLE_CLIP, analysis: SAMPLE_ANALYSIS, body: SAMPLE_BODY, ...over });

describe('the Learn tab', () => {
  it('lists each lift with who, what, the peak bar speed and whose video it is, and opens it', async () => {
    const onOpen = jest.fn();
    const screen = await render(<LearnScreen lifts={[lift('a'), lift('b', { lifter: 'Other Lifter', kind: 'cleanJerk', loadKg: undefined, where: undefined })]} onOpen={onOpen} />);
    expect(screen.getByText('Learn from the best')).toBeOnTheScreen();
    expect(screen.getByTestId('learn-a')).toHaveTextContent(/Test Lifter\d\.\d\d m\/sSnatch · 170 kg · Training hall 2025Video: A Channel/);
    expect(screen.getByTestId('learn-b')).toHaveTextContent(/Other Lifter.*Clean and jerkVideo: A Channel/);
    await act(async () => fireEvent.press(screen.getByTestId('learn-b')));
    expect(onOpen).toHaveBeenCalledWith('b');
  });

  it('narrows the list to one kind of lift, and back to all', async () => {
    const screen = await render(<LearnScreen lifts={[lift('a'), lift('b', { kind: 'cleanJerk' }), lift('c')]} onOpen={jest.fn()} />);
    await act(async () => fireEvent.press(screen.getByTestId('learn-kind-cleanJerk')));
    expect(screen.queryByTestId('learn-a')).toBeNull();
    expect(screen.getByTestId('learn-b')).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByTestId('learn-kind-snatch')));
    expect([screen.queryByTestId('learn-a'), screen.queryByTestId('learn-b'), screen.queryByTestId('learn-c')].map(Boolean)).toEqual([true, false, true]);
    await act(async () => fireEvent.press(screen.getByTestId('learn-kind-all')));
    expect(screen.getByTestId('learn-b')).toBeOnTheScreen();
  });

  it('has no chips when every lift is the same kind', async () => {
    const screen = await render(<LearnScreen lifts={[lift('a'), lift('c')]} onOpen={jest.fn()} />);
    expect(screen.queryByTestId('learn-kinds')).toBeNull();
  });

  it('opens only once there are enough lifts to be worth a tab', () => {
    expect(learnOpen(Array.from({ length: LEARN_MIN - 1 }, (_, i) => lift(`${i}`)))).toBe(false);
    expect(learnOpen(Array.from({ length: LEARN_MIN }, (_, i) => lift(`${i}`)))).toBe(true);
  });

  it('every listed lift names the owner of its video', () => {
    for (const l of LEARN_LIFTS) expect(l.credit.trim().length).toBeGreaterThan(0);
  });

  it('the tab bar shows Learn between the + and You only when told to', async () => {
    const off = await render(<TabBar active="index" onTab={jest.fn()} onImport={jest.fn()} />);
    expect(off.queryByTestId('tab-learn')).toBeNull();
    off.unmount();
    const onTab = jest.fn();
    const on = await render(<TabBar active="learn" learn onTab={onTab} onImport={jest.fn()} />);
    expect(on.getByTestId('tab-learn')).toHaveTextContent('Learn');
    await act(async () => fireEvent.press(on.getByTestId('tab-learn')));
    expect(onTab).toHaveBeenCalledWith('learn');
  });
});
