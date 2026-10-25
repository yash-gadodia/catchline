import { render } from '@testing-library/react-native';
import ReportRoute from '../../../app/report';

const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
  return { __esModule: true, router: r, useRouter: () => r, useLocalSearchParams: () => mockParams.current };
});

describe('the report route', () => {
  it('offers to attach the numbers of the lift it was opened from', async () => {
    mockParams.current = { lift: 'snatch-mock-partial', context: 'Snatch · cue: none' };
    const view = await render(<ReportRoute />);
    expect(view.getByTestId('report-attach')).toHaveTextContent('Attach analysis numbers (no video)');
  });

  it('offers nothing to attach from the You tab', async () => {
    mockParams.current = {};
    const view = await render(<ReportRoute />);
    expect(view.queryByTestId('report-attach')).toBeNull();
  });
});
