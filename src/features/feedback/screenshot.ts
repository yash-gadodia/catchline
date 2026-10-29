import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { captureScreen } from 'react-native-view-shot';

// "Screenshot to give feedback": a screenshot taken inside the app offers to send it as a problem
// report. The lifter can turn the prompt off from the sheet or the You tab; it stays off.
export const useScreenshotFeedback = create<{ enabled: boolean; shot: string | null; setEnabled: (v: boolean) => void; dismiss: () => void }>()(
  persist(
    (set) => ({
      enabled: true,
      shot: null,
      setEnabled: (enabled) => set({ enabled }),
      dismiss: () => set({ shot: null }),
    }),
    { name: 'catchline-screenshot-feedback', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ enabled: s.enabled }) }
  )
);

// Our own capture of what is on screen right now (the system screenshot stays in Photos, which the
// app never reads). Nothing happens while the prompt is off or one is already up.
export async function onScreenshot(): Promise<void> {
  const s = useScreenshotFeedback.getState();
  if (!s.enabled || s.shot) return;
  try {
    const uri = await captureScreen({ format: 'jpg', quality: 0.8, result: 'tmpfile' });
    useScreenshotFeedback.setState({ shot: uri });
  } catch {
    // a screen that cannot be captured (a secure view) just gets no prompt
  }
}

// Watches for the system screenshot. expo-screen-capture throws at import on a binary without the native
// module (a 3.1 phone, an old dev client), so the module is looked up first and the package required only
// when it is there: no listener, never a crash.
export function watchScreenshots(): () => void {
  if (!requireOptionalNativeModule('ExpoScreenCapture')) return () => undefined;
  const ScreenCapture = require('expo-screen-capture') as typeof import('expo-screen-capture');
  const sub = ScreenCapture.addScreenshotListener(() => void onScreenshot());
  return () => sub.remove();
}
