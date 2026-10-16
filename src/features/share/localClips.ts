import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';

// The lifter's own clip stays on the phone (camera original or picker copy); the
// uploaded copy is deleted after analysis. Share renders from this file, so it
// remembers which local file and trim start each lift came from.
export type LocalClip = { uri: string; startS: number };

const KEEP = 30;

type LocalClipsState = {
  clips: Record<string, LocalClip>;
  remember: (liftId: string, clip: LocalClip) => void;
};

export const useLocalClips = create<LocalClipsState>()(
  persist(
    (set) => ({
      clips: {},
      remember: (liftId, clip) =>
        set((s) => {
          const keep = Object.entries(s.clips).filter(([id]) => id !== liftId).slice(-(KEEP - 1));
          return { clips: { ...Object.fromEntries(keep), [liftId]: clip } };
        }),
    }),
    { name: 'catchline-local-clips', storage: createJSONStorage(() => AsyncStorage) }
  )
);

export function rememberClip(liftId: string, uri: string, startS: number): void {
  useLocalClips.getState().remember(liftId, { uri, startS });
}

// The clip behind a lift if its file is still on this phone.
export function localClipFor(liftId: string): LocalClip | null {
  const clip = useLocalClips.getState().clips[liftId];
  if (!clip) return null;
  return new File(clip.uri).exists ? clip : null;
}
