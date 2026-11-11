import * as ImagePicker from 'expo-image-picker';
import { newClip, type Clip } from './store';

export async function pickClip(): Promise<Clip | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1, shouldDownloadFromNetwork: true });
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;
  return newClip({ uri: asset.uri, durationS: (asset.duration ?? 0) / 1000, fps: null, source: 'library' });
}
