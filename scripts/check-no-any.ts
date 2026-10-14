// CLAUDE.md: no `any` in src/ or app/. The supabase-js `never` quirk gets a
// documented ts-expect-error comment instead of `as any`.
import { runGuard } from './guard';

runGuard({
  name: 'check-no-any',
  applies: () => true,
  pattern: /\bas any\b|:\s*any\b|<any>|\bany\[\]/,
  message: 'no `any`; type it, or use a documented // @ts-expect-error for the supabase-js quirk.',
  allowFiles: {
    // Pre-existing: supabase mocks cast with `as any`. Remove as they get typed.
    'src/features/auth/auth.test.tsx': 'pre-existing debt',
    'src/features/notifications/notifications.test.ts': 'pre-existing debt',
  },
});
