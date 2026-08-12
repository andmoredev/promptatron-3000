// @ts-check
/**
 * Mutation testing, scoped to the app's pure-logic layer.
 *
 * Deliberately NOT in scope:
 *   - src/api/client.ts: thin per-endpoint wrappers around `http`/`stream`
 *     (URL template + method + body passthrough). `client.test.ts` already
 *     asserts the exact URL/method/body for every one of them, but most
 *     mutants here are "change a literal path segment" — killed instantly
 *     and not informative about real logic. http.ts and stream.ts (the code
 *     those wrappers call into) carry the actual behavior and ARE mutated.
 *   - React components (features/**, components/**): Stryker re-runs the
 *     full Vitest + Testing Library + jsdom render pipeline per mutant.
 *     That's slow (jsdom environment setup dominates), and most component
 *     mutants land in JSX/markup rather than logic. The stores + api layer
 *     mutated here hold the actual branching/parsing/reducer logic that
 *     backs those components.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: {
    fileName: 'reports/mutation/mutation.html'
  },
  tempDirName: '.stryker-tmp',

  mutate: [
    'src/api/stream.ts',
    'src/api/http.ts',
    'src/stores/errors.ts',
    'src/stores/evalStore.ts',
    'src/stores/guardrailStore.ts',
    'src/stores/historyStore.ts',
    'src/stores/runConfigStore.ts',
    'src/stores/runStore.ts',
    'src/stores/scenarioStore.ts',
    'src/stores/settingsStore.ts',
    'src/utils/chadQuips.ts'
  ],

  ignorePatterns: ['node_modules', 'dist', 'coverage', 'reports', '.stryker-tmp'],

  vitest: {
    configFile: 'vitest.config.ts'
  },

  // Typechecking every mutant is the expensive part of running Stryker
  // against a TS project (a fresh `tsc` pass per surviving-candidate batch).
  // This project has no dedicated tsconfig for Stryker's checker plugin, and
  // `npm run typecheck` already gates the real source separately in CI, so
  // skip it here and rely on the test-run signal — which is what actually
  // catches behavioral regressions.
  disableTypeChecks: 'src/**/*.{ts,tsx}',
  coverageAnalysis: 'perTest',

  // Static mutants (top-level constants, module-level default values) can
  // only be tested by re-running the FULL suite, not just the tests that
  // cover them — Stryker measured these as ~11% of mutants but ~81% of
  // total runtime on this codebase. Ignoring them keeps the run inside the
  // ~10 minute budget; see the mutation-testing report notes for what's
  // dropped (mostly literal defaults in store initial-state objects).
  ignoreStatic: true,

  concurrency: 4,
  timeoutMS: 15000,

  thresholds: {
    high: 80,
    low: 60,
    break: null
  }
}
