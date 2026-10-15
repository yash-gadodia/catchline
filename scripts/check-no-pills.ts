// Design guard, rule and rationale in scripts/design-rules.ts; baseline in scripts/design-baseline.json.
import { runDesignGuard } from './design-guard';
import { noPills } from './design-rules';

runDesignGuard(noPills);
