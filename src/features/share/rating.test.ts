import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import { usePipeline } from '../../data/pipeline';
import { askForRatingOnce } from './rating';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '4.1.0' } } }));

const KEY = '@catchline/rating_asked_version';
const requestReview = jest.fn(async () => undefined);
const present = (available = true) =>
  jest.mocked(requireOptionalNativeModule).mockReturnValue({ isAvailableAsync: async () => available, requestReview });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  usePipeline.getState().clear();
});

describe('askForRatingOnce', () => {
  it('asks once for a version, then never again on that version', async () => {
    present();
    expect(await askForRatingOnce(true)).toBe('asked');
    expect(await AsyncStorage.getItem(KEY)).toBe('4.1.0');
    expect(await askForRatingOnce(true)).toBe('skipped');
    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  it('asks again on a new version', async () => {
    present();
    await AsyncStorage.setItem(KEY, '4.0.0');
    expect(await askForRatingOnce(true)).toBe('asked');
    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  it('does not ask for a lift without a bar path, and keeps the ask for one that has it', async () => {
    present();
    expect(await askForRatingOnce(false)).toBe('skipped');
    expect(requestReview).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('does not ask while the last tracking is a failed one', async () => {
    present();
    usePipeline.setState({ job: { status: 'failed' } as never });
    expect(await askForRatingOnce(true)).toBe('skipped');
    expect(requestReview).not.toHaveBeenCalled();
  });

  it('does nothing on a binary without the store review module, and keeps the ask for a build that has it', async () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
    expect(await askForRatingOnce(true)).toBe('unavailable');
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('does nothing where the prompt cannot show (TestFlight)', async () => {
    present(false);
    expect(await askForRatingOnce(true)).toBe('unavailable');
    expect(requestReview).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});
