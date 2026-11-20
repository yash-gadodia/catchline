import { PixelRatio, Platform, Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { renderStill, shareFile } from './exporter';

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///tmp/card.jpg') }));

// #112: view-shot multiplies the size by the screen scale on iOS, so 1080 x 1350 came out as a 3240 x 4050 PNG (35 MB)
describe('renderStill', () => {
  it('captures the card as a JPEG at the export size in pixels on a 3x iPhone', async () => {
    Platform.OS = 'ios';
    jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
    await renderStill({ current: null }, '4:5');
    expect(captureRef).toHaveBeenCalledWith({ current: null }, { format: 'jpg', quality: 0.9, width: 360, height: 450, result: 'tmpfile' });
    await renderStill({ current: null }, '9:16');
    expect((captureRef as jest.Mock).mock.calls[1][1]).toEqual({ format: 'jpg', quality: 0.9, width: 360, height: 640, result: 'tmpfile' });
  });
});

const URI = 'file:///cache/share-video/catchline-1.mp4';

describe('shareFile', () => {
  it('hands the share sheet the file alone and says which activity took it', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: 'com.burbn.instagram.shareextension' });
    expect(await shareFile(URI)).toEqual({ outcome: 'shared', activity: 'com.burbn.instagram.shareextension' });
    expect(share).toHaveBeenCalledWith({ url: URI });
  });

  it('a closed sheet is cancelled, with no activity', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction });
    expect(await shareFile(URI)).toEqual({ outcome: 'cancelled', activity: null });
  });
});
