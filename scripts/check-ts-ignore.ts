// CLAUDE.md: no @ts-ignore. The one sanctioned escape is a documented
// // @ts-expect-error for the supabase-js `never` inference quirk.
import { runGuard } from './guard';

runGuard({
  name: 'check-ts-ignore',
  applies: () => true,
  pattern: /@ts-ignore/,
  message: '@ts-ignore is banned; use one documented // @ts-expect-error for the supabase-js quirk only.',
});
