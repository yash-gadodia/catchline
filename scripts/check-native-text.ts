// Text comes from src/components/Text, which caps Dynamic Type (#114, #115); react-native's own Text skips the cap.
import { runGuard } from './guard';

runGuard({
  name: 'check-native-text',
  applies: (rel) => !/\.test\.tsx?$/.test(rel),
  pattern: /import \{[^}]*\bText\b[^}]*\} from 'react-native'/,
  message: "import Text from src/components/Text, not 'react-native', so text scaling stays capped.",
  allowFiles: { 'src/components/Text.tsx': 'the one place that wraps it' },
});
