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

describe('Attach analysis numbers', () => {
  const NUMBERS = '{"movement":"snatch","angle":"34deg","error":null}';

  it('is not offered without a lift to describe', async () => {
    const view = await render(<ReportProblemScreen back="You" onBack={jest.fn()} />);
    expect(view.queryByTestId('report-attach')).toBeNull();
  });

  it('is off by default and the report goes without the numbers', async () => {
    queueProblemReport.mockResolvedValue(1);
    const view = await render(<ReportProblemScreen liftId="lift-9" numbers={NUMBERS} back="You" onBack={jest.fn()} />);
    expect(view.getByTestId('report-attach')).toHaveTextContent('Attach analysis numbers (no video)');
    expect(view.getByTestId('report-attach')).not.toBeChecked();
    expect(view.queryByTestId('report-attach-preview')).toBeNull();
    await act(async () => fireEvent.changeText(view.getByTestId('report-input'), 'Bar path is off'));
    await act(async () => fireEvent.press(view.getByTestId('report-send')));
    expect(queueProblemReport).toHaveBeenCalledWith({ body: 'Bar path is off', liftId: 'lift-9', context: undefined });
  });

  it('shows exactly what is attached once ticked and sends it after the words', async () => {
    queueProblemReport.mockResolvedValue(1);
    const view = await render(<ReportProblemScreen liftId="lift-9" numbers={NUMBERS} back="You" onBack={jest.fn()} />);
    await act(async () => fireEvent.press(view.getByTestId('report-attach')));
    expect(view.getByTestId('report-attach')).toBeChecked();
    expect(view.getByTestId('report-attach-preview')).toHaveTextContent(NUMBERS);
    await act(async () => fireEvent.changeText(view.getByTestId('report-input'), 'Bar path is off'));
    await act(async () => fireEvent.press(view.getByTestId('report-send')));
    expect(queueProblemReport).toHaveBeenCalledWith({ body: `Bar path is off\n\n${NUMBERS}`, liftId: 'lift-9', context: undefined });
  });

  it('hands the report to Intercom when it opens, and goes back instead of queueing', async () => {
    const sendToIntercom = jest.fn(() => Promise.resolve(true));
    const onBack = jest.fn();
    const view = await render(<ReportProblemScreen liftId="lift-9" numbers={NUMBERS} back="You" onBack={onBack} sendToIntercom={sendToIntercom} />);
    await act(async () => fireEvent.press(view.getByTestId('report-attach')));
    await act(async () => fireEvent.changeText(view.getByTestId('report-input'), 'Wrong phase'));
    await act(async () => fireEvent.press(view.getByTestId('report-send')));
    expect(sendToIntercom).toHaveBeenCalledWith(`Wrong phase\n\n${NUMBERS}`);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(queueProblemReport).not.toHaveBeenCalled();
  });

  it('queues locally when Intercom does not open', async () => {
    queueProblemReport.mockResolvedValue(0);
    const sendToIntercom = jest.fn(() => Promise.resolve(false));
    const view = await render(<ReportProblemScreen liftId="lift-9" numbers={NUMBERS} back="You" onBack={jest.fn()} sendToIntercom={sendToIntercom} />);
    await act(async () => fireEvent.changeText(view.getByTestId('report-input'), 'Crash'));
    await act(async () => fireEvent.press(view.getByTestId('report-send')));
    expect(queueProblemReport).toHaveBeenCalledWith({ body: 'Crash', liftId: 'lift-9', context: undefined });
    expect(view.getByTestId('report-result')).toHaveTextContent('Saved. It sends the next time you are online.');
  });
});
