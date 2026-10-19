import { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { SchibstedGrotesk_400Regular } from '@expo-google-fonts/schibsted-grotesk/400Regular';
import { SchibstedGrotesk_500Medium } from '@expo-google-fonts/schibsted-grotesk/500Medium';
import { SchibstedGrotesk_700Bold } from '@expo-google-fonts/schibsted-grotesk/700Bold';
import { SometypeMono_400Regular } from '@expo-google-fonts/sometype-mono/400Regular';
import { SometypeMono_500Medium } from '@expo-google-fonts/sometype-mono/500Medium';

export const FONT_ASSETS = {
  BigShouldersDisplay_700Bold: require('@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_700Bold.ttf'),
  BigShouldersDisplay_900Black: require('@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_900Black.ttf'),
  SchibstedGrotesk_400Regular,
  SchibstedGrotesk_500Medium,
  SchibstedGrotesk_700Bold,
  SometypeMono_400Regular,
  SometypeMono_500Medium,
};

// Past this the app renders with system fonts rather than sit on the splash.
export const FONT_WAIT_MS = 3000;

// Ready when the fonts load, fail, or take too long: a font that never loads must
// not keep the app on its logo (a tester stuck on the splash, 19 Oct 2026).
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(FONT_ASSETS);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), FONT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  return loaded || error != null || waited;
}
