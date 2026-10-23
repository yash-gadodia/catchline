import { render } from '@testing-library/react-native';
import TabsLayout from '../../../app/(tabs)/_layout';
import { useOnboarding } from '../onboarding/store';
import { useWhatsNew } from './store';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => mockRouter,
  Redirect: () => null,
  Tabs: Object.assign(() => null, { Screen: () => null }),
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '3.1' } } }));

beforeEach(() => jest.clearAllMocks());

describe("What's new after an update", () => {
  it('opens once over the library for someone already onboarded', async () => {
    useOnboarding.setState({ completed: true });
    useWhatsNew.setState({ seen: '3.0' });
    await render(<TabsLayout />);
    expect(mockRouter.push).toHaveBeenCalledWith('/whats-new');
    mockRouter.push.mockClear();
    await render(<TabsLayout />);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('stays shut on a fresh install', async () => {
    useOnboarding.setState({ completed: false });
    useWhatsNew.setState({ seen: null });
    await render(<TabsLayout />);
    expect(mockRouter.push).not.toHaveBeenCalledWith('/whats-new');
    expect(useWhatsNew.getState().seen).toBe('3.1');
  });
});
