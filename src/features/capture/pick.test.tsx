import { Alert } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pickClip } from './pick';
import { useCapture } from './store';
import ImportRoute from '../../../app/capture/import';

const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };

jest.mock('expo-router', () => ({
  __esModule: true,
  router: mockNav,
  useRouter: () => mockNav,
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return { __esModule: true, VideoView: View, useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: jest.fn() }) }) };
});

jest.mock('../onboarding/store', () => {
  const actual = jest.requireActual('../onboarding/store');
  return { ...actual, useHydrated: () => true, hasConsent: () => true };
});

const launch = ImagePicker.launchImageLibraryAsync as jest.Mock;

beforeEach(() => jest.clearAllMocks());

// Upload bug (12-10-2026): an iCloud-only video failed to copy because the picker was not allowed to download it.
test('pickClip lets the picker download a video stored only in iCloud', async () => {
  await pickClip();
  expect(launch).toHaveBeenCalledWith({ mediaTypes: ['videos'], quality: 1, shouldDownloadFromNetwork: true });
});

// Upload bug (12-10-2026): a rejected picker left a blank screen forever.
// Import first (15-10-2026): it lands on the empty state (pick again or record), never a blank screen.
test('a video that cannot be opened explains why and offers another pick or Record instead', async () => {
  launch.mockRejectedValueOnce(new Error('PHPhotosErrorDomain 3164'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = await render(<ImportRoute />);
  await waitFor(() => expect(view.getByTestId('import-empty')).toBeOnTheScreen());
  expect(view.getByTestId('import-pick')).toHaveTextContent('Choose a video');
  expect(view.getByTestId('import-record')).toHaveTextContent('Record instead');
  expect(alert).toHaveBeenCalledWith("Couldn't open that video", 'Try again, or pick a clip saved on this phone.');
});
