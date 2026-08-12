import { expect, test } from '@playwright/test'
import { configureWorkbench, gotoTab } from './helpers'

const MODEL_ID = 'fake.model-v1-hist'

/**
 * A run made through the Workbench shows up in History, its detail view
 * carries the output, and deleting it removes the row.
 *
 * Uses a model id unique to this spec (`MODEL_ID`) and the History tab's
 * model filter to isolate this test's row from whatever other specs have
 * written to the shared fake-model server's history store.
 */
test('a completed run appears in History, shows its detail, and can be deleted', async ({
  page
}) => {
  await page.goto('/')

  await configureWorkbench(page, {
    modelId: MODEL_ID,
    userPrompt: 'A prompt whose run should land in History.'
  })
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByTestId('run-status-badge')).toHaveText('Completed', { timeout: 15000 })

  await gotoTab(page, 'History')

  const modelFilter = page.getByTestId('history-filter-model')
  await modelFilter.fill(MODEL_ID)

  const row = page.getByTestId('history-row').filter({ hasText: MODEL_ID })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(MODEL_ID)
  await expect(row.locator('span').filter({ hasText: 'completed' })).toBeVisible()

  await row.click()

  const detail = page.getByTestId('run-detail-view')
  await expect(detail).toBeVisible()
  await expect(detail.getByTestId('run-detail-output')).toContainText('[fake-model]')

  await row.getByTestId('history-delete-btn').click()
  await row.getByTestId('history-delete-confirm').click()

  await expect(page.getByTestId('history-row').filter({ hasText: MODEL_ID })).toHaveCount(0)
})
