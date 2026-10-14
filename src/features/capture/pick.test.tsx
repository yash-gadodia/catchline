import { Alert } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { pickClip } from './pick';
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
  await pickClip('snatch');
  expect(launch).toHaveBeenCalledWith({ mediaTypes: ['videos'], quality: 1, shouldDownloadFromNetwork: true });
});

// Upload bug (12-10-2026): a rejected picker left a blank screen forever.
test('a video that cannot be opened explains why and leaves the import screen', async () => {
  launch.mockRejectedValueOnce(new Error('PHPhotosErrorDomain 3164'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<ImportRoute />);
  await waitFor(() => expect(mockNav.back).toHaveBeenCalledTimes(1));
  expect(alert).toHaveBeenCalledWith("Couldn't open that video", 'Try again, or pick a clip saved on this phone.');
});
