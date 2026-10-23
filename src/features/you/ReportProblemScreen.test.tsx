import { act, fireEvent, render } from '@testing-library/react-native';
import ReportProblemScreen from './ReportProblemScreen';

jest.mock('../../data/problemReports', () => ({
  queueProblemReport: jest.fn(),
  reportDetails: () => ({ appVersion: '3.1', updateId: 'ota-42', device: 'iPhone16,1 iOS 26.1' }),
}));

const { queueProblemReport } = jest.requireMock('../../data/problemReports') as { queueProblemReport: jest.Mock };

beforeEach(() => jest.clearAllMocks());

describe('ReportProblemScreen', () => {
  it('shows what gets attached and keeps Send off until there is text', async () => {
    const view = await render(<ReportProblemScreen liftId="lift-9" back="You" onBack={jest.fn()} />);
    expect(view.getByTestId('report-details')).toHaveTextContent('Sent with Catchline 3.1, update ota-42, iPhone16,1 iOS 26.1');
    expect(view.getByTestId('report-lift')).toHaveTextContent('About lift lift-9');
    expect(view.getByText('No video is attached.')).toBeTruthy();
    await act(async () => fireEvent.press(view.getByTestId('report-send')));
    expect(queueProblemReport).not.toHaveBeenCalled();
  });

  it('queues the report with the lift and says it sends once online', async () => {
    queueProblemReport.mockResolvedValue(0);
    const onBack = jest.fn();
    const view = await render(<ReportProblemScreen liftId="lift-9" context="Snatch · cue: x" back="You" onBack={onBack} />);
    await act(async () => fireEvent.changeText(view.getByTestId('report-input'), 'Bar path is off'));
    await act(async () => fireEvent.press(view.getByTestId('report-send')));
    expect(queueProblemReport).toHaveBeenCalledWith({ body: 'Bar path is off', liftId: 'lift-9', context: 'Snatch · cue: x' });
    expect(view.getByTestId('report-result')).toHaveTextContent('Saved. It sends the next time you are online.');
    await act(async () => fireEvent.press(view.getByTestId('report-done')));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('says sent when it went straight out', async () => {
    queueProblemReport.mockResolvedValue(1);
    const view = await render(<ReportProblemScreen back="You" onBack={jest.fn()} />);
    expect(view.queryByTestId('report-lift')).toBeNull();
    await act(async () => fireEvent.changeText(view.getByTestId('report-input'), 'Crash'));
    await act(async () => fireEvent.press(view.getByTestId('report-send')));
    expect(view.getByTestId('report-result')).toHaveTextContent('Sent. Thank you, we read every one.');
  });
});
