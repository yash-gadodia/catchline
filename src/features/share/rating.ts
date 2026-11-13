import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { usePipeline } from '../../data/pipeline';

const ASKED_KEY = '@catchline/rating_asked_version';

type StoreReview = { isAvailableAsync?: () => Promise<boolean>; requestReview?: () => Promise<void> };

// The App Store rating prompt, after a share the lifter went through with, of a lift that has a bar path. Once per
// app version, and never while the last tracking is a failed one. The prompt is expo-store-review's native module,
// which build 41 does not hold: until a build adds that package this returns 'unavailable' and records nothing.
export async function askForRatingOnce(barPath: boolean): Promise<'asked' | 'skipped' | 'unavailable'> {
  if (!barPath || usePipeline.getState().job?.status === 'failed') return 'skipped';
  const review = requireOptionalNativeModule<StoreReview>('ExpoStoreReview');
  if (!review?.requestReview || !(await review.isAvailableAsync?.())) return 'unavailable';
  const version = Constants.expoConfig?.version ?? 'unknown';
  if ((await AsyncStorage.getItem(ASKED_KEY)) === version) return 'skipped';
  await AsyncStorage.setItem(ASKED_KEY, version);
  await review.requestReview();
  return 'asked';
}
