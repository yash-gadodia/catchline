import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { supabase } from '../../lib/supabase';
import DrillCard from './DrillCard';
import { DRILLS } from './drills';
import { drillsFlag, drillVisible, resetDrillsFlag } from './flag';

function flag(enabled: boolean | null) {
  const maybeSingle = jest.fn(async () => ({ data: enabled === null ? null : { enabled }, error: null }));
  const eq = jest.fn(() => ({ maybeSingle }));
  jest.spyOn(supabase, 'from').mockReturnValue({ select: () => ({ eq }) } as unknown as ReturnType<typeof supabase.from>);
  return eq;
}

function setDev(v: boolean) {
  (global as unknown as { __DEV__: boolean }).__DEV__ = v;
}

describe('DrillCard', () => {
  beforeEach(() => {
    resetDrillsFlag();
    setDev(true);
    flag(false);
  });
  afterEach(() => {
    setDev(true);
    jest.restoreAllMocks();
  });

  it('shows the name and dose, collapsed, in a dev build', async () => {
    await render(<DrillCard faultId="hips_rise_early" />);
    expect(screen.getByTestId('drill-name')).toHaveTextContent('Pause deadlift at lift-off and the knee');
    expect(screen.getByTestId('drill-dose')).toHaveTextContent('3 x 3, at a weight where your back angle holds');
    expect(screen.queryByTestId('drill-detail')).toBeNull();
  });

  it('tap expands the steps and the why, tap again hides them', async () => {
    await render(<DrillCard faultId="jump_forward" />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('drill-card'));
    });
    expect(screen.getByText('Lift as normal but keep your feet flat in place the whole rep.')).toBeOnTheScreen();
    expect(screen.getByText('Finish with one normal rep with a tape line at your toes.')).toBeOnTheScreen();
    expect(screen.getByTestId('drill-why')).toHaveTextContent(DRILLS.jump_forward.why);
    expect(screen.getByTestId('drill-card')).toBeExpanded();
    await act(async () => {
      fireEvent.press(screen.getByTestId('drill-card'));
    });
    expect(screen.queryByTestId('drill-detail')).toBeNull();
  });

  it('renders nothing for a fault with no drill', async () => {
    await render(<DrillCard faultId="bar_drift_knee" />);
    expect(screen.queryByTestId('drill-card')).toBeNull();
  });

  it('gate off: a release build hides the draft drill', async () => {
    setDev(false);
    flag(false);
    await render(<DrillCard faultId="hips_rise_early" />);
    await act(async () => {
      await drillsFlag();
    });
    expect(screen.queryByTestId('drill-card')).toBeNull();
  });

  it('gate on: feature_flags.drills shows the draft drill in a release build', async () => {
    setDev(false);
    const eq = flag(true);
    await render(<DrillCard faultId="hips_rise_early" />);
    await waitFor(() => expect(screen.getByTestId('drill-card')).toBeOnTheScreen());
    expect(eq).toHaveBeenCalledWith('key', 'drills');
  });

  it('a missing flag row reads as off', async () => {
    flag(null);
    expect(await drillsFlag()).toBe(false);
  });

  it('drillVisible: draft needs dev or the flag, a reviewed drill always shows', () => {
    const draft = DRILLS.press_out;
    expect(drillVisible(draft, false, false)).toBe(false);
    expect(drillVisible(draft, true, false)).toBe(true);
    expect(drillVisible(draft, false, true)).toBe(true);
    expect(drillVisible({ ...draft, draft: false }, false, false)).toBe(true);
  });
});
