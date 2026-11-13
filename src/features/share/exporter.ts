import type { RefObject } from 'react';
import { Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { File } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import Transcoder from '../../../modules/clip-transcoder';
import type { OverlaySpec, ShareAspect } from './overlay';
import { OUTPUT } from './overlay';
import type { TrackSpec } from './trackShare';

// The still card renders on-device: the card view is captured at export size.
export async function renderStill(ref: RefObject<View | null>, aspect: ShareAspect): Promise<string> {
  const size = OUTPUT[aspect];
  return captureRef(ref, { format: 'png', quality: 1, width: size.width, height: size.height, result: 'tmpfile' });
}

// The overlay video, rendered on the phone from the lifter's own clip.
export async function renderVideo(uri: string, spec: OverlaySpec, onProgress: (p: number) => void): Promise<string> {
  const sub = Transcoder.addListener('onProgress', (e) => onProgress(e.progress));
  try {
    return (await Transcoder.renderShareVideo(uri, spec)).uri;
  } finally {
    sub.remove();
  }
}

// 2x and 4x shares: only a binary whose TrackRenderer keeps every 2nd / 4th frame (build 43 on).
export const fastShareSupported = () => (Transcoder as { supportsFastShare?: boolean } | null)?.supportsFastShare === true;
// the logo lockup and end card: only a binary whose TrackRenderer draws spec.brand (4.0.2 on)
export const shareBrandSupported = () => (Transcoder as { supportsShareBrand?: boolean } | null)?.supportsShareBrand === true;

// 4.0: the lift's kept clip with the tracker's overlay burned in, and one frame of it as an image.
export async function renderTrackVideo(clipUri: string, spec: TrackSpec, onProgress: (p: number) => void): Promise<string> {
  const sub = Transcoder.addListener('onProgress', (e) => onProgress(e.progress));
  try {
    return (await Transcoder.renderTrackVideo(clipUri, JSON.stringify(spec))).uri;
  } finally {
    sub.remove();
  }
}

export async function renderTrackImage(clipUri: string, spec: TrackSpec): Promise<string> {
  return (await Transcoder.renderTrackImage(clipUri, JSON.stringify(spec))).uri;
}

export type ShareResult = { outcome: 'shared' | 'cancelled'; activity: string | null };

// The iOS share sheet with the file: Instagram (Stories, Reels, Feed), WhatsApp,
// Messages, Save, AirDrop. iOS says which activity took the file (an identifier such as
// com.apple.UIKit.activity.SaveToCameraRoll), never what happened inside that app.
// The file goes alone: a text item beside a video takes Instagram off the sheet and makes WhatsApp send the text
// without the video, and React Native's Share cannot give a text to some activities only (docs/catchline/analytics-4.0.md).
export async function shareFile(uri: string): Promise<ShareResult> {
  const res = await Share.share({ url: uri });
  if (res.action === Share.dismissedAction) return { outcome: 'cancelled', activity: null };
  return { outcome: 'shared', activity: res.activityType ?? null };
}

export async function saveToPhotos(uri: string): Promise<'saved' | 'denied'> {
  const perm = await requestPermissionsAsync(true);
  if (!perm.granted) return 'denied';
  await Asset.create(uri);
  return 'saved';
}

export function discardRender(uri: string): void {
  const f = new File(uri);
  if (f.exists) f.delete();
}
