import { expect, test } from '@playwright/test'
import { configureWorkbench } from './helpers'

/**
 * A full manual run against the fake-model server: enter a model id (via the
 * manual fallback, since the catalog never loads without AWS creds) and a
 * user prompt, hit Run, and watch the canned reply stream in.
 */
test('runs a prompt against the fake model and streams the canned reply', async ({ page }) => {
  await page.goto('/')

  await configureWorkbench(page, {
    modelId: 'fake.model-v1',
    userPrompt: 'Testing the workbench run flow end to end.'
  })

  const statusBadge = page.getByTestId('run-status-badge')
  const outputText = page.getByTestId('output-text')

  await expect(statusBadge).toHaveText('Idle')
  await expect(outputText).toContainText('Run a prompt to see output here.')

  await page.getByRole('button', { name: 'Run' }).click()

  // The run moves off idle right away (starting/streaming) before it settles
  // on Completed — this is the "streamed incrementally" signal: the status
  // (and, in practice, the text) update more than once as the NDJSON events
  // arrive rather than jumping straight from Idle to Completed.
  await expect(statusBadge).not.toHaveText('Idle', { timeout: 5000 })

  await expect(statusBadge).toHaveText('Completed', { timeout: 15000 })

  // The fake model's canned reply: "[fake-model] echoing <n> prompt
  // characters for <model_id>." — assert on its fixed pieces rather than the
  // exact character count.
  await expect(outputText).toContainText('[fake-model]')
  await expect(outputText).toContainText('echoing')
  await expect(outputText).toContainText('prompt characters')
  await expect(outputText).toContainText('for fake.model-v1.')

  // Metrics bar: FakeModel's usage_per_turn defaults to (11, 7) input/output
  // tokens regardless of prompt content.
  const stat = (label: string) => page.locator('dl > div').filter({ hasText: label }).locator('dd')
  await expect(stat('Input tokens')).toHaveText('11')
  await expect(stat('Output tokens')).toHaveText('7')
  await expect(stat('Total tokens')).toHaveText('18')
})
