import { Redirect } from 'expo-router';

// A link the app has no screen for (an old invite format, a typo) opens the first screen, never Expo Router's
// "Unmatched Route" page (#233).
export default function NotFound() {
  return <Redirect href="/" />;
}
