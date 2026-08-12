import { expect, test } from '@playwright/test'
import { gotoTab } from './helpers'

/**
 * Guardrail creation needs real AWS credentials, so this only checks that the
 * Guardrails tab renders gracefully when `GET /guardrails` fails (no
 * credentials in this environment => an `upstream_error` from the server):
 * the heading is there, nothing crashes, and either the empty state or an
 * error notice is visible (never both, and never neither).
 */
test('Guardrails tab renders its empty/error state without crashing', async ({ page }) => {
  await page.goto('/')
  await gotoTab(page, 'Guardrails')

  await expect(page.getByRole('heading', { name: 'Guardrails' })).toBeVisible()
  await expect(page.getByTestId('guardrails-page')).toBeVisible()

  const emptyState = page.getByTestId('guardrails-empty')
  const errorNotice = page.getByRole('alert').filter({ hasText: 'Could not load guardrails' })

  await expect(emptyState.or(errorNotice)).toBeVisible({ timeout: 10000 })

  // The page shell survived the failed load: the "New guardrail" affordance
  // is still there, and the table never rendered with zero rows to show.
  await expect(page.getByRole('button', { name: 'New guardrail' })).toBeVisible()
  await expect(page.getByTestId('guardrails-table')).toHaveCount(0)
})
