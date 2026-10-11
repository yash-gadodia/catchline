import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AppErrorBoundary } from './AppErrorBoundary';

function Boom(): React.ReactElement {
  throw new Error('boom');
}

describe('AppErrorBoundary', () => {
  it('renders children when there is no error', async () => {
    const { getByText } = await render(
      <AppErrorBoundary>
        <Text>all good</Text>
      </AppErrorBoundary>
    );
    expect(getByText('all good')).toBeTruthy();
  });

  it('shows the recovery screen when a child throws during render', async () => {
    // componentDidCatch logs the error + captureError warns (no key in test); silence both.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { getByText } = await render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>
    );

    expect(getByText('Something broke on our side')).toBeTruthy();
    expect(getByText('Try again')).toBeTruthy();

    spy.mockRestore();
    warnSpy.mockRestore();
  });
});
