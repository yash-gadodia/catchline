import { Directory, File, Paths } from 'expo-file-system';

// The photo picker hands the app its own copy of a picked video (expo-image-picker writes it under Caches/ImagePicker),
// and the native modules write into the app's tmp folder while preparing (clip-transcoder), tracking
// (catchline-analysis) and rendering a share (share-video). A lift keeps its own clip.mp4, so none of these copies
// outlives the step that made it. tmp/lift-camera holds the camera originals, which the lifter deletes from the camera.
const PICKER_DIR = 'ImagePicker';
const TEMP_DIRS = ['clip-transcoder', 'catchline-analysis', 'share-video'];
const CAMERA_DIR = 'lift-camera';

function pickerDir(): Directory {
  return new Directory(Paths.cache, PICKER_DIR);
}

function tempDir(name: string): Directory {
  return new Directory(Paths.document.parentDirectory, 'tmp', name);
}

// The picker's copy of a picked clip, once its lift is saved or the import is cancelled. Anything else is left alone.
export function discardPickedCopy(uri: string | null): void {
  if (!uri || !uri.startsWith(pickerDir().uri)) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}

// At launch (nothing is in flight yet) and on Delete everything, which also takes the camera originals.
export function sweepClipCache({ cameraOriginals = false }: { cameraOriginals?: boolean } = {}): void {
  const dirs = [pickerDir(), ...TEMP_DIRS.map(tempDir), ...(cameraOriginals ? [tempDir(CAMERA_DIR)] : [])];
  for (const dir of dirs) if (dir.exists) dir.delete();
}
