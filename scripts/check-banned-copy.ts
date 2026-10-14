// CLAUDE.md design rules: the app never claims to "prevent injury" or
// "diagnose". Tests are skipped so they can assert the copy is absent.
import { runGuard } from './guard';

runGuard({
  name: 'check-banned-copy',
  applies: (rel) => !/\.test\.tsx?$/.test(rel),
  pattern: /prevent(s|ing)? injur|diagnos/i,
  message: 'banned copy: never say "prevent injury" or "diagnose".',
});
