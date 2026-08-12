import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { E2E_DB_PATH } from './e2e/env'

// Sandbox environments preinstall Chromium at a revision @playwright/test
// doesn't auto-discover; pin it there when present. Elsewhere (CI, dev
// machines) fall back to Playwright's own browser resolution.
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium'

/**
 * E2E config for the fake-model full stack (server + app), both booted as
 * Playwright `webServer`s so `npx playwright test` is a single, self
 * contained command.
 *
 * The config store is intentionally left unconfigured here (no
 * `CONFIG_API_URL`): the Scenarios tab shows its "not reachable" notice and
 * scenario pickers stay empty, and `/api/v1/models` fails too (no AWS
 * credentials in this environment) — specs must not depend on scenario or
 * catalog data. `PROMPTATRON_FAKE_MODEL=1` gives full run/eval functionality
 * with zero AWS calls (a scripted model *and* judge).
 *
 * Chromium is preinstalled in this environment at a revision `@playwright/test`
 * doesn't auto-discover (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`,
 * `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`), so the project pins
 * `launchOptions.executablePath` at it directly rather than relying on
 * revision auto-resolution.
 *
 * All specs share one running server/db (started once for the whole suite,
 * not per test), so `workers: 1` keeps them from writing concurrently to the
 * same sqlite file — with only five short specs this costs little and buys a
 * deterministic, non-flaky run.
 *
 * Spec files are named `*.pw.ts`, not the more usual `*.spec.ts`: `app/`'s
 * `vitest.config.ts` (owned by the unit-test suite, not this one) has no
 * `include` of its own, so Vitest's default `**\/*.{test,spec}.*` glob would
 * otherwise sweep these up too and fail them there (no DOM, no `@playwright/test`
 * runtime). `testMatch` repoints this project at the `.pw.ts` files instead of
 * Playwright's own `*.spec.ts` default, so nothing needs to change outside
 * `app/e2e/**` and this file to keep the two runners out of each other's way.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure'
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: existsSync(PREINSTALLED_CHROMIUM)
          ? { executablePath: PREINSTALLED_CHROMIUM }
          : {}
      }
    }
  ],

  webServer: [
    {
      // The throwaway sqlite file (+ its WAL/SHM siblings) is removed right
      // here, as part of the server's own startup command, rather than in a
      // Playwright `globalSetup` script: `globalSetup` runs *after*
      // `webServer` has already started (and `init_db` has already created
      // the schema) here, so deleting the file there raced the server's own
      // open connections — a later pooled connection would reopen the
      // (now-recreated-empty) path and see "no such table". Deleting before
      // `uv run` even starts is the only ordering that is actually hermetic.
      command: `rm -f ${E2E_DB_PATH} ${E2E_DB_PATH}-wal ${E2E_DB_PATH}-shm && uv run uvicorn promptatron.main:app --port 8000`,
      cwd: '../server',
      env: {
        PROMPTATRON_FAKE_MODEL: '1',
        PROMPTATRON_DB_PATH: E2E_DB_PATH
      },
      url: 'http://localhost:8000/api/v1/health',
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: 'npm run dev -- --port 3000',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 60_000
    }
  ]
})
