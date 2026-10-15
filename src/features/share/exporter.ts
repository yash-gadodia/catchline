import type { RefObject } from 'react';
import { Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { File } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import Transcoder from '../../../modules/clip-transcoder';
import type { OverlaySpec, ShareAspect } from './overlay';
import { OUTPUT } from './overlay';

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

// The iOS share sheet with the file: Instagram (Stories, Reels, Feed), WhatsApp,
// Messages, Save, AirDrop.
export async function shareFile(uri: string): Promise<'shared' | 'cancelled'> {
  const res = await Share.share({ url: uri });
  return res.action === Share.dismissedAction ? 'cancelled' : 'shared';
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
