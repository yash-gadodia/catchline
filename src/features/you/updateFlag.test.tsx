import { Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { supabase } from '../../lib/supabase';
import CaptureLayout from '../../../app/capture/_layout';
import { requireUpdateFlag, resetRequireUpdateFlag } from './updateFlag';

function flag(enabled: boolean | null) {
  const maybeSingle = jest.fn(async () => ({ data: enabled === null ? null : { enabled }, error: null }));
  const eq = jest.fn(() => ({ maybeSingle }));
  jest.spyOn(supabase, 'from').mockReturnValue({ select: () => ({ eq }) } as unknown as ReturnType<typeof supabase.from>);
  return { eq, maybeSingle };
}

describe('require_update_31', () => {
  beforeEach(() => resetRequireUpdateFlag());
  afterEach(() => jest.restoreAllMocks());

  it('reads feature_flags.require_update_31 and is off when the row is missing', async () => {
    const { eq } = flag(null);
    expect(await requireUpdateFlag()).toBe(false);
    expect(eq).toHaveBeenCalledWith('key', 'require_update_31');
  });

  it('asks again after an off read, keeps an on read for the launch', async () => {
    const off = flag(false);
    expect(await requireUpdateFlag()).toBe(false);
    expect(await requireUpdateFlag()).toBe(false);
    expect(off.maybeSingle).toHaveBeenCalledTimes(2);
    const on = flag(true);
    expect(await requireUpdateFlag()).toBe(true);
    expect(await requireUpdateFlag()).toBe(true);
    expect(on.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('flag off: capture opens as usual', async () => {
    const { maybeSingle } = flag(false);
    await render(<CaptureLayout />);
    await waitFor(() => expect(maybeSingle).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('update-required')).toBeNull();
  });

  it('flag on: capture shows the update screen and the button opens the App Store', async () => {
    flag(true);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true);
    await render(<CaptureLayout />);
    expect(await screen.findByText('Update to keep analysing')).toBeOnTheScreen();
    expect(
      screen.getByText("Catchline now analyses your lift on your iPhone, so your video never leaves it. This version can't analyse any more. Your lifts are safe.")
    ).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByText('Update Catchline'));
    });
    expect(open).toHaveBeenCalledWith('https://apps.apple.com/app/id6785406082');
    expect(screen.getByText('Back to my lifts')).toBeOnTheScreen();
  });
});
