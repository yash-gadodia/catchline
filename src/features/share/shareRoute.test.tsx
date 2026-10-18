import { render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { t } from '../../i18n';
import ShareRoute from '../../../app/share';

const params: { current: Record<string, string> } = { current: {} };
const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) };

jest.mock('expo-router', () => ({
  __esModule: true,
  router: mockNav,
  useRouter: () => mockNav,
  useLocalSearchParams: () => params.current,
}));
jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return { __esModule: true, VideoView: View, useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: jest.fn() }) }) };
});
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

// Issue #25: the share video is drawn from the lifter's raw clip and the renderer
// cannot blur bystanders yet, so with a clip on an iPhone only the (blurred) Strobe card can leave the phone.
it('offers only the strobe card even with the clip on an iPhone', async () => {
  expect(Platform.OS).toBe('ios');
  params.current = { fixture: 'snatch-real', clip: 'file:///originals/lift.mov', start: '0' };
  const view = await render(<ShareRoute />);

  expect(view.getByTestId('share-screen')).toBeTruthy();
  expect(view.queryByTestId('share-mode')).toBeNull();
  expect(view.queryByTestId('share-rendering')).toBeNull();
  expect(view.getByText(t('share.shareImage'))).toBeTruthy();
});
