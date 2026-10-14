import * as ImagePicker from 'expo-image-picker';
import { detectSets } from './sets';
import { newClip, type Clip } from './store';

export async function pickClip(movement: Clip['movement']): Promise<Clip | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1, shouldDownloadFromNetwork: true });
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;
  const durationS = (asset.duration ?? 0) / 1000;
  return newClip({ uri: asset.uri, durationS, fps: null, source: 'library', movement, sets: detectSets(asset.uri, durationS) });
}
