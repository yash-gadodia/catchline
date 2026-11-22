import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { usePipeline } from '../../data/pipeline';
import { claimSessionAsk } from '../feedback/sessionAsk';

const ASKED_KEY = '@catchline/rating_asked_version';

type StoreReview = { isAvailableAsync?: () => Promise<boolean>; requestReview?: () => Promise<void> };

// The App Store rating ask, after a share the lifter went through with, of a lift that has a bar path. Once per app
// version, and never while the last tracking is a failed one. The share screen first shows why a rating matters
// (ratingDue), then Apple's own prompt on "Rate Catchline" (askForRatingOnce); "Not now" spends the version's ask
// (declineRating). Nothing is offered for a rating: Apple forbids it (3.2.2) and never says whether one was left.
async function storeReview(): Promise<StoreReview | null> {
  const review = requireOptionalNativeModule<StoreReview>('ExpoStoreReview');
  return review?.requestReview && (await review.isAvailableAsync?.()) ? review : null;
}

const version = () => Constants.expoConfig?.version ?? 'unknown';

export async function ratingDue(barPath: boolean): Promise<boolean> {
  if (!barPath || usePipeline.getState().job?.status === 'failed') return false;
  if (!(await storeReview())) return false;
  if ((await AsyncStorage.getItem(ASKED_KEY)) === version()) return false;
  // not in a run that already asked for feedback
  return claimSessionAsk('rating');
}

export async function declineRating(): Promise<void> {
  await AsyncStorage.setItem(ASKED_KEY, version());
}

export async function askForRatingOnce(barPath: boolean): Promise<'asked' | 'skipped' | 'unavailable'> {
  if (!barPath || usePipeline.getState().job?.status === 'failed') return 'skipped';
  const review = await storeReview();
  if (!review?.requestReview) return 'unavailable';
  if ((await AsyncStorage.getItem(ASKED_KEY)) === version()) return 'skipped';
  await AsyncStorage.setItem(ASKED_KEY, version());
  await review.requestReview();
  return 'asked';
}
