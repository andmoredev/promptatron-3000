/**
 * Shared constants between `playwright.config.ts` and `global-setup.ts`: the
 * throwaway sqlite file the fake-model server writes run/eval history to for
 * the whole E2E run.
 */

export const E2E_DB_PATH = '/tmp/promptatron-e2e.db'
