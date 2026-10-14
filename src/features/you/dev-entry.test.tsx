import { render } from '@testing-library/react-native';
import DevEntry from '../../../app/dev';
import PaywallDev from '../../../app/paywall/dev';

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  return {
    __esModule: true,
    router: r,
    useRouter: () => r,
    Redirect: ({ href }: { href: string }) => React.createElement(Text, { testID: 'redirect' }, href),
  };
});

// The dev entries are plain routes, so a release build could still reach them by deep
// link (catchline://dev, catchline://paywall/dev) and open every fixture state.
describe('release build: the dev entries redirect home', () => {
  beforeEach(() => {
    (global as { __DEV__: boolean }).__DEV__ = false;
  });
  afterEach(() => {
    (global as { __DEV__: boolean }).__DEV__ = true;
  });

  it('/dev', async () => {
    const view = await render(<DevEntry />);
    expect(view.getByTestId('redirect')).toHaveTextContent('/');
    expect(view.queryByText('DEV · EVERY STATE')).toBeNull();
    expect(view.queryByTestId('dev-Result reveal')).toBeNull();
  });

  it('/paywall/dev', async () => {
    const view = await render(<PaywallDev />);
    expect(view.getByTestId('redirect')).toHaveTextContent('/');
    expect(view.queryByText('DEV · PAYWALL AND PLANS')).toBeNull();
  });
});

describe('dev build: the dev entries list every state', () => {
  it('/dev', async () => {
    const view = await render(<DevEntry />);
    expect(view.queryByTestId('redirect')).toBeNull();
    expect(view.getByText('DEV · EVERY STATE')).toBeOnTheScreen();
    expect(view.getByTestId('dev-Result reveal')).toBeOnTheScreen();
  });

  it('/paywall/dev', async () => {
    const view = await render(<PaywallDev />);
    expect(view.queryByTestId('redirect')).toBeNull();
    expect(view.getByText('DEV · PAYWALL AND PLANS')).toBeOnTheScreen();
  });
});
