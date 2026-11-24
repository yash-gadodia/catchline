import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { usePipeline } from '../../data/pipeline';
import { claimSessionAsk } from '../feedback/sessionAsk';

const ASKED_KEY = '@catchline/rating_asked_version';

type StoreReview = { isAvailableAsync?: () => Promise<boolean>; requestReview?: () => Promise<void> };

// The App Store rating ask: Apple's own prompt (stars, one tap, in place), straight after a share the lifter went
// through with, of a lift that has a bar path. Once per app version, never while the last tracking is a failed one, and
// not in a run that already asked for feedback. Apple shows it at most three times a year and never says whether a
// rating was left. Nothing is offered for one: Apple forbids it (3.2.2).
async function storeReview(): Promise<StoreReview | null> {
  const review = requireOptionalNativeModule<StoreReview>('ExpoStoreReview');
  return review?.requestReview && (await review.isAvailableAsync?.()) ? review : null;
}

const version = () => Constants.expoConfig?.version ?? 'unknown';

export async function askForRatingOnce(barPath: boolean): Promise<'asked' | 'skipped' | 'unavailable'> {
  if (!barPath || usePipeline.getState().job?.status === 'failed') return 'skipped';
  const review = await storeReview();
  if (!review?.requestReview) return 'unavailable';
  if ((await AsyncStorage.getItem(ASKED_KEY)) === version()) return 'skipped';
  if (!claimSessionAsk('rating')) return 'skipped';
  await AsyncStorage.setItem(ASKED_KEY, version());
  await review.requestReview();
  return 'asked';
}
