import { expect, test } from '@playwright/test'
import { configureWorkbench, gotoTab } from './helpers'

const MODEL_ID = 'fake.model-v1-det'

/**
 * Configures a run in the Workbench, launches a 3-run determinism evaluation
 * from the Evals tab against the fake model + fake judge, and checks the
 * progress, the finished result, and that History gained the 3 underlying
 * runs (a model id unique to this spec keeps the count exact).
 */
test('runs a determinism evaluation to completion and records its runs', async ({ page }) => {
  await page.goto('/')

  await configureWorkbench(page, {
    modelId: MODEL_ID,
    userPrompt: 'Say hello in exactly one sentence.'
  })

  await gotoTab(page, 'Evals')

  await expect(page.getByTestId('workbench-config-summary')).toBeVisible()
  await expect(page.getByTestId('workbench-config-summary')).toContainText(MODEL_ID)

  await page.locator('#eval-n').fill('3')
  // Grader model defaults to a non-empty id (`amazon.nova-pro-v1:0`) from
  // settings, so the launcher is ready without needing the (unreachable)
  // model catalog.

  await page.getByRole('button', { name: 'Start evaluation' }).click()

  // The fake model + fake judge run entirely in-process, so a 3-run
  // determinism evaluation can finish before the UI's next paint — the live
  // progress panel and the finished result view are therefore both valid
  // observations of "the evaluation reached 3/3", not just the former.
  const progress = page.getByTestId('eval-progress')
  const result = page.getByTestId('eval-result')
  await expect(progress.or(result)).toBeVisible({ timeout: 20000 })

  if (await progress.isVisible()) {
    await expect(page.getByTestId('eval-progress-total')).toHaveText('3')
    await expect(page.getByTestId('eval-progress-completed')).toHaveText('3', { timeout: 20000 })
  }

  await expect(result).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('eval-grade')).not.toHaveText('—')
  await expect(page.getByTestId('eval-score')).toContainText('/ 100')
  await expect(page.getByTestId('eval-metrics-grid')).toBeVisible()

  await gotoTab(page, 'History')
  await page.getByTestId('history-filter-model').fill(MODEL_ID)
  await expect(page.getByTestId('history-row').filter({ hasText: MODEL_ID })).toHaveCount(3)
})
