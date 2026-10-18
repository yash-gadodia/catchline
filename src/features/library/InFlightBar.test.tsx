import { fireEvent, render } from '@testing-library/react-native';
import type { Job } from '../../data/pipeline';
import InFlightBar, { inFlight, inFlightProgress } from './InFlightBar';

const job = (fields: Partial<Job>): Job => ({
  id: 'j', movement: 'snatch', status: 'preparing', liftId: null, prepared: 0, sent: 0, total: 0,
  uploadUrl: null, error: null, maxS: null, uri: null, ...fields,
});

describe('InFlightBar', () => {
  it('shows only while the clip is still on the phone', () => {
    expect(inFlight(null)).toBe(false);
    expect(inFlight(job({ status: 'preparing' }))).toBe(true);
    expect(inFlight(job({ status: 'uploading' }))).toBe(true);
    expect(inFlight(job({ status: 'queued', liftId: 'l1' }))).toBe(false);
    expect(inFlight(job({ status: 'failed' }))).toBe(false);
  });

  it('fills the bar through preparing and upload', () => {
    expect(inFlightProgress(job({ prepared: 0.5 }))).toBe(0.4);
    expect(inFlightProgress(job({ status: 'uploading', sent: 50, total: 100 }))).toBeCloseTo(0.9);
  });

  it('names the lift and the step, and reopens processing', async () => {
    const onOpen = jest.fn();
    const { getByText, getByTestId } = await render(<InFlightBar job={job({ prepared: 0.42 })} onOpen={onOpen} />);
    expect(getByText('Analysing your Snatch')).toBeOnTheScreen();
    expect(getByText('preparing 42%')).toBeOnTheScreen();
    expect(getByTestId('in-flight-progress')).toHaveStyle({ width: '34%' });
    fireEvent.press(getByTestId('in-flight'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders nothing once the server has the lift', async () => {
    const { queryByTestId } = await render(<InFlightBar job={job({ status: 'queued', liftId: 'l1' })} onOpen={jest.fn()} />);
    expect(queryByTestId('in-flight')).toBeNull();
  });
});
