import { expect, test } from '@playwright/test'
import { gotoTab } from './helpers'

/**
 * The config store is never configured in this E2E environment (no
 * `CONFIG_API_URL`), so `GET /scenarios` answers `upstream_error` and the
 * Scenarios tab should show its "not reachable" notice rather than an empty
 * list or a crash.
 */
test('Scenarios tab shows the config-store-not-reachable notice', async ({ page }) => {
  await page.goto('/')
  await gotoTab(page, 'Scenarios')

  const notice = page.getByTestId('config-store-notice')
  await expect(notice).toBeVisible({ timeout: 10000 })
  await expect(notice).toContainText('Config store not reachable')

  await expect(page.getByTestId('scenarios-page')).toHaveCount(0)
})
