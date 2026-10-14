# Testing

Stack: **jest** (^29) + **jest-expo** (^56) preset + **@testing-library/react-native** (v14) for JS/TS; **pgTAP** (`supabase test db`) for SQL/RLS. Tests are co-located `*.test.ts(x)`; run `npm test`, watch `npm run test:watch`.

## Rules
- **Exact assertions** — assert the exact expected value for known inputs (floats: `toBeCloseTo` with a specific value). Never assert just `> 0` / "truthy".
- **Tests must actually exercise the thing.** A `render()` + a real query/`fireEvent` (or `toJSON()` for a smoke test). NEVER `expect(<Component/>).toBeTruthy()` — a JSX literal is always truthy and tests nothing. This bug shipped repeatedly here; reject it in review.
- `render()` from RNTL v14 is **async** — `const { ... } = await render(<X/>)`. The matchers entrypoint is `@testing-library/react-native/matchers` (NOT `/extend-expect`).
- A `fireEvent.press` that must **re-render** (toggling component state) needs `await act(async () => { fireEvent.press(...) })` — presses that only assert a mock was called pass without it, which hides the gap.
- **Never nest `waitFor` inside `act()`** — RNTL's `waitFor` flips the act-environment flag off while polling, so any state update landing in that window logs "The current testing environment is not configured to support act(...)". Press inside `act`, then `waitFor` *outside* it.
- **Pure logic first** — `src/analysis/*` (geometry, timeline, parse, format) is RN-free; unit-test it with exact values. Highest-ROI tests.
- **Descriptive names**, independent, deterministic (seed randomness). Behavior, not implementation.
- **No hollow/weak tests to make CI pass.** Don't `.skip`, don't revert a real render to a truthy stub, don't weaken an assertion.

## jest mocks (all in `jest-setup.ts` — global)
Native modules are mocked there so screens render in jest: `react-native-reanimated` (incl. `withRepeat`/`withSequence`/`Easing.inOut`), `react-native-safe-area-context`, `expo-router` (router/Link/Stack/Tabs), `@supabase/supabase-js` (chainable from/rpc/channel/auth returning empty), `@react-native-async-storage/async-storage`, and default `EXPO_PUBLIC_SUPABASE_*` env. If a new screen imports a native module that throws in jest, add its mock here — don't disable the test.

## pgTAP (RLS / caps / purge — security-critical)
- `supabase/tests/*.sql` run via `supabase test db` on the Mini. They MUST be **hermetic**: create their own rows with fixed per-file uuids or `gen_random_uuid()`; never assert global catalog counts (the seed + dev data break those).
- Keep the **enforcement** assertions: another user reads **0 rows** of `lifts` / `analyses` / `cues` / `consents`; anon reads nothing; no lift without the upload consent; caps hold (free = 3 for life, paid per month) and a failed lift refunds exactly once; raw clips past the cutoff get purged. Use valid pgTAP (`ok`/`is`/`isnt`/`throws_ok`); there is no `isnt_null`.
- Run against a clean DB: `supabase db reset && supabase test db`. A "FAIL" right after agent psql work is usually dirty state — reset first.

## Verify before "done"
`npm test` (green, **pristine** output — warnings are findings) + `npm run typecheck` (0, no new `any`) + `npx expo export -p ios` (bundles all routes). Don't claim passing without showing the run.
