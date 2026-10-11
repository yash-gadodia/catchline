import type { RefObject } from 'react';
import { Linking, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import type { Aspect, ShareOptions, ShareType } from './model';
import { exportSize } from './model';

// Static cards render on-device: the card view is captured at export size.
export async function renderStill(ref: RefObject<View | null>, type: ShareType, aspect: Aspect): Promise<string> {
  const size = exportSize(type, aspect);
  return captureRef(ref, { format: 'png', quality: 1, width: size.width, height: size.height, result: 'tmpfile' });
}

// The iOS share sheet carries "Save Image". expo-media-library would save
// straight to Photos but is not a dependency yet.
export async function saveImage(uri: string): Promise<'saved' | 'cancelled'> {
  const res = await Share.share({ url: uri });
  return res.action === Share.dismissedAction ? 'cancelled' : 'saved';
}

export async function openInstagram(): Promise<void> {
  const app = 'instagram://library';
  if (await Linking.canOpenURL(app)) return Linking.openURL(app);
  return Linking.openURL('https://www.instagram.com/');
}

export type OverlayVideoRequest = {
  analysisId: string;
  aspect: Aspect;
  options: ShareOptions;
  watermark: string | null;
  fps: 30 | 60;
};

export type OverlayVideoJob =
  | { status: 'rendering'; progress: number }
  | { status: 'done'; uri: string }
  | { status: 'failed'; reason: 'not_available' | 'render_error' };

export interface OverlayVideoRenderer {
  render(req: OverlayVideoRequest, onProgress?: (p: number) => void): Promise<OverlayVideoJob>;
}

// TODO(phase-3): the overlay video is rendered server-side from the same
// Analysis JSON (comet path drawn with playback, phase strip). Until that
// endpoint exists the request resolves as not available and the screen offers
// the still instead.
export const overlayVideoRenderer: OverlayVideoRenderer = {
  async render() {
    return { status: 'failed', reason: 'not_available' };
  },
};
