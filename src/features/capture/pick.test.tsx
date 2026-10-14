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

// prod 14-10-2026: a clean was uploaded with the selector showing snatch. The import screen must open the
// picker with the last lift used, which means waiting for the capture store to come back from disk.
test('an import opens the picker on the last movement used, waiting for it to load from disk', async () => {
  useCapture.setState({ movement: 'snatch', draft: null });
  let release!: () => void;
  const disk = new Promise<void>((r) => (release = r));
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(async () => {
    await disk;
    return JSON.stringify({ state: { movement: 'clean', lastWeight: '', originals: [] }, version: 0 });
  });
  launch.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///clean.mov', duration: 8000 }] });
  const rehydrated = useCapture.persist.rehydrate();
  await render(<ImportRoute />);
  expect(launch).not.toHaveBeenCalled();
  await act(async () => {
    release();
    await rehydrated;
  });
  await waitFor(() => expect(launch).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(useCapture.getState().draft?.movement).toBe('clean'));
});
