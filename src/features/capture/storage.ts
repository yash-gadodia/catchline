import { File, Paths } from 'expo-file-system';

// Rough 1080p H.264 bitrates; good enough to warn before the disk fills mid-set.
export function bytesPerSecond(fps: number): number {
  return fps >= 60 ? 6_000_000 : 3_000_000;
}

export function secondsLeft(fps: number, availableBytes: number = Paths.availableDiskSpace): number {
  return Math.floor(availableBytes / bytesPerSecond(fps));
}

export function deleteOriginals(uris: string[]): string[] {
  const kept: string[] = [];
  for (const uri of uris) {
    const file = new File(uri);
    if (file.exists) file.delete();
    if (file.exists) kept.push(uri);
  }
  return kept;
}
