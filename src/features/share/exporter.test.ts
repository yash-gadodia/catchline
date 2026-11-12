import { Share } from 'react-native';
import { shareFile } from './exporter';

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
