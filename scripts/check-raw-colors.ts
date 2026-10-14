// CLAUDE.md: colours come from src/design tokens; the only raw hex allowed
// outside src/design is the flare #FF1F3D. url(#id) SVG refs are not colours.
// Tests are skipped: they assert resolved token values.
import { runGuard } from './guard';

runGuard({
  name: 'check-raw-colors',
  applies: (rel) => !rel.startsWith('src/design/') && !/\.test\.tsx?$/.test(rel),
  pattern: /(?<!url\()#(?!ff1f3d\b)(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/i,
  message: 'raw hex colour outside src/design; use a token from src/design/tokens.',
  allowFiles: {
    // Pre-existing: '#000' / '#fff' where colors.bg / colors.text exist. Remove as they move to tokens.
    'src/features/analysis/DrawnPath.tsx': 'pre-existing debt',
    'src/features/analysis/overlays.tsx': 'pre-existing debt',
    'src/features/capture/ViewfinderScreen.tsx': 'pre-existing debt',
    'src/features/library/FailureScreen.tsx': 'pre-existing debt',
    'src/features/share/ShareCard.tsx': 'pre-existing debt',
  },
});
