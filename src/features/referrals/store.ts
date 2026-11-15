import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// pendingCode: a code from an invite link, kept until the lifter signs in and claims it.
// promptedAfterShare: the "give a friend a free month" line shows after one share only.
type InviteState = {
  pendingCode: string | null;
  promptedAfterShare: boolean;
  setPendingCode: (code: string | null) => void;
  markPrompted: () => void;
};

export const useInvite = create<InviteState>()(
  persist(
    (set) => ({
      pendingCode: null,
      promptedAfterShare: false,
      setPendingCode: (pendingCode) => set({ pendingCode }),
      markPrompted: () => set({ promptedAfterShare: true }),
    }),
    {
      name: 'catchline-invite',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ pendingCode: s.pendingCode, promptedAfterShare: s.promptedAfterShare }),
    },
  ),
);
