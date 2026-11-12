import { useEffect } from 'react';
import { useNavigation } from 'expo-router';

// A screen whose main control is a horizontal drag (trim handles, the plate mark): iOS's swipe-back
// (from the edge, and full screen on iOS 26) would take the drag and slide the screen away, so Back is the button.
export function useNoSwipeBack() {
  const navigation = useNavigation();
  useEffect(() => {
    const stacks = [navigation, navigation.getParent()];
    stacks.forEach((n) => n?.setOptions({ gestureEnabled: false, fullScreenGestureEnabled: false }));
    return () => stacks.forEach((n) => n?.setOptions({ gestureEnabled: undefined, fullScreenGestureEnabled: undefined }));
  }, [navigation]);
}
