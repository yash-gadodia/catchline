// .claude/rules/testing.md: expect(<Component />) is always truthy and tests
// nothing. render() it and assert real content.
import { runGuard } from './guard';

runGuard({
  name: 'check-hollow-tests',
  applies: (rel) => /\.test\.tsx?$/.test(rel),
  pattern: /expect\(</,
  message: 'expect(<JSX />) is a hollow test; render() and assert real content.',
});
