import { act, fireEvent, render } from '@testing-library/react-native';
import { router as nav } from 'expo-router';
import ProcessingRoute from '../../../app/analysis/processing';
import { cancelDeviceLift } from '../../data/devicePipeline';
import { usePipeline } from '../../data/pipeline';

jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) };
  return { __esModule: true, router: r, useRouter: () => r, useLocalSearchParams: () => ({ live: '1' }) };
});
jest.mock('../../data/devicePipeline', () => ({ cancelDeviceLift: jest.fn() }));

const T0 = 1_800_000_000_000;
let now = T0;

beforeEach(() => {
  jest.clearAllMocks();
  now = T0;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  usePipeline.getState().start({
    id: `job-${T0}`, movement: 'snatch', status: 'preparing', liftId: 'l1', prepared: 0.1, sent: 0, total: 0,
    uploadUrl: null, error: null, maxS: null, uri: 'file:///lift.mov', device: true, stage: null, fraction: 0,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// #235: a double tap on Track lands its second tap on Cancel as the sheet slides in under the finger.
describe('Cancel on a lift that is tracking', () => {
  it('ignores a tap the moment the sheet opens, so a double-tapped Track keeps the lift', async () => {
    const view = await render(<ProcessingRoute />);
    now = T0 + 300;
    await act(async () => {
      fireEvent.press(view.getByTestId('cancel'));
    });
    expect(cancelDeviceLift).not.toHaveBeenCalled();
    expect(nav.dismissTo).not.toHaveBeenCalled();
  });

  it('stops the lift once the sheet has been up for a second', async () => {
    const view = await render(<ProcessingRoute />);
    now = T0 + 1000;
    await act(async () => {
      fireEvent.press(view.getByTestId('cancel'));
    });
    expect(cancelDeviceLift).toHaveBeenCalledTimes(1);
    expect(nav.dismissTo).toHaveBeenCalledWith('/');
  });
});
