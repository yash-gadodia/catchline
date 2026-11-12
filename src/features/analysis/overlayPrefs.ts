import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Overlays = { path: boolean; lines: boolean; body: boolean; angles: boolean };

// The bar and the body are drawn together unless the lifter turned one off; their last toggles carry to the next lift.
export const DEFAULT_OVERLAYS: Overlays = { path: true, lines: true, body: true, angles: false };

export const useOverlays = create<Overlays>()(
  persist((): Overlays => DEFAULT_OVERLAYS, { name: 'catchline.tracker.overlays', storage: createJSONStorage(() => AsyncStorage) })
);
