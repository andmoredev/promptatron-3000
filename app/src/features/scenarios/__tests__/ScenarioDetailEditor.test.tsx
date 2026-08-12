/**
 * ScenarioDetailEditor: prompt kind on add, dataset create body, the tools
 * list's `handler_registered` badges, and JSON-schema validation on tool
 * upsert.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Dataset, DatasetMeta, ScenarioDetail, ToolListItem, ToolListResponse } from '../../../api'

const scenariosGetMock = vi.fn()
const promptsCreateMock = vi.fn()
const promptsUpdateMock = vi.fn()
const promptsRemoveMock = vi.fn()
const datasetsCreateMock = vi.fn()
const datasetsGetMock = vi.fn()
const datasetsUpdateMock = vi.fn()
const datasetsRemoveMock = vi.fn()
const toolsListMock = vi.fn()
const toolsUpsertMock = vi.fn()

vi.mock('../../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      scenarios: {
        ...actual.api.scenarios,
        get: scenariosGetMock,
        prompts: {
          ...actual.api.scenarios.prompts,
          create: promptsCreateMock,
          update: promptsUpdateMock,
          remove: promptsRemoveMock
        },
        datasets: {
          ...actual.api.scenarios.datasets,
          create: datasetsCreateMock,
          get: datasetsGetMock,
          update: datasetsUpdateMock,
          remove: datasetsRemoveMock
        },
        tools: { ...actual.api.scenarios.tools, list: toolsListMock, upsert: toolsUpsertMock }
      }
    }
  }
})

const { useScenarioStore } = await import('../../../stores')
const { default: ScenarioDetailEditor } = await import('../ScenarioDetailEditor')
const { ApiError } = await import('../../../api')

const emptyDetail: ScenarioDetail = {
  id: 'demo',
  name: 'Demo scenario',
  description: 'A scenario for tests',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  systemPrompts: [],
  userPrompts: [],
  tools: [],
  datasets: []
}

const onConfigStoreDown = vi.fn()

beforeEach(() => {
  scenariosGetMock.mockReset()
  promptsCreateMock.mockReset()
  promptsUpdateMock.mockReset()
  promptsRemoveMock.mockReset()
  datasetsCreateMock.mockReset()
  datasetsGetMock.mockReset()
  datasetsUpdateMock.mockReset()
  datasetsRemoveMock.mockReset()
  toolsListMock.mockReset()
  toolsUpsertMock.mockReset()
  onConfigStoreDown.mockReset()
  useScenarioStore.getState().clear()
  toolsListMock.mockResolvedValue({ items: [], count: 0 } satisfies ToolListResponse)
})

describe('ScenarioDetailEditor — prompts', () => {
  it('adds a system prompt with kind SYSTEM and a user prompt with kind USER', async () => {
    scenariosGetMock.mockResolvedValue(emptyDetail)
    promptsCreateMock.mockResolvedValue({ id: 'new-prompt' })

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')

    const systemSection = screen.getByTestId('prompt-section-system')
    fireEvent.click(within(systemSection).getByRole('button', { name: '+ Add' }))
    fireEvent.change(within(systemSection).getByLabelText('New prompt name'), {
      target: { value: 'Terse' }
    })
    fireEvent.change(within(systemSection).getByLabelText('New prompt content'), {
      target: { value: 'Be terse.' }
    })
    fireEvent.click(within(systemSection).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(promptsCreateMock).toHaveBeenCalledTimes(1))
    expect(promptsCreateMock).toHaveBeenCalledWith('demo', {
      kind: 'SYSTEM',
      name: 'Terse',
      content: 'Be terse.'
    })

    const userSection = screen.getByTestId('prompt-section-user')
    fireEvent.click(within(userSection).getByRole('button', { name: '+ Add' }))
    fireEvent.change(within(userSection).getByLabelText('New prompt name'), {
      target: { value: 'Order lookup' }
    })
    fireEvent.change(within(userSection).getByLabelText('New prompt content'), {
      target: { value: 'Where is order B456?' }
    })
    fireEvent.click(within(userSection).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(promptsCreateMock).toHaveBeenCalledTimes(2))
    expect(promptsCreateMock).toHaveBeenLastCalledWith('demo', {
      kind: 'USER',
      name: 'Order lookup',
      content: 'Where is order B456?'
    })
  })
})

describe('ScenarioDetailEditor — datasets', () => {
  it('creates a dataset with the chosen contentType and content', async () => {
    scenariosGetMock.mockResolvedValue(emptyDetail)
    datasetsCreateMock.mockResolvedValue({ id: 'orders' })

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')

    fireEvent.click(screen.getByRole('button', { name: '+ Add dataset' }))
    fireEvent.change(screen.getByLabelText('New dataset id'), { target: { value: 'orders' } })
    fireEvent.change(screen.getByLabelText('New dataset name'), {
      target: { value: 'Orders' }
    })
    fireEvent.change(screen.getByLabelText('New dataset content type'), {
      target: { value: 'application/json' }
    })
    fireEvent.change(screen.getByLabelText('New dataset content'), {
      target: { value: '[{"id": "B456"}]' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(datasetsCreateMock).toHaveBeenCalledTimes(1))
    expect(datasetsCreateMock).toHaveBeenCalledWith('demo', {
      id: 'orders',
      name: 'Orders',
      description: undefined,
      contentType: 'application/json',
      content: '[{"id": "B456"}]'
    })
  })

  it('blocks the dataset id field on an invalid slug', async () => {
    scenariosGetMock.mockResolvedValue(emptyDetail)
    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')

    fireEvent.click(screen.getByRole('button', { name: '+ Add dataset' }))
    fireEvent.change(screen.getByLabelText('New dataset id'), { target: { value: 'Not Valid' } })

    expect(
      screen.getByText('Id must be lowercase letters, numbers, and hyphens only.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })
})

describe('ScenarioDetailEditor — tools', () => {
  const withHandler: ToolListItem = {
    name: 'lookup_order',
    description: 'Looks up an order by id.',
    inputSchema: { type: 'object', properties: { order_id: { type: 'string' } } },
    handlerKey: 'lookup_order',
    handler_registered: true
  }

  const withoutHandler: ToolListItem = {
    name: 'send_email',
    description: 'Sends a follow-up email.',
    inputSchema: { type: 'object', properties: { to: { type: 'string' } } },
    handlerKey: 'send_email',
    handler_registered: false
  }

  it('renders handler_registered badges both ways', async () => {
    scenariosGetMock.mockResolvedValue(emptyDetail)
    toolsListMock.mockResolvedValue({ items: [withHandler, withoutHandler], count: 2 })

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')

    expect(await screen.findByTestId('handler-badge-lookup_order')).toHaveTextContent(
      'handler available'
    )
    expect(screen.getByTestId('handler-badge-send_email')).toHaveTextContent(
      'no local handler — definition only'
    )
  })

  it('blocks tool upsert on invalid JSON in the input schema textarea', async () => {
    scenariosGetMock.mockResolvedValue(emptyDetail)
    toolsListMock.mockResolvedValue({ items: [withHandler], count: 1 })

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')
    const row = await screen.findByTestId('tool-row-lookup_order')

    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    fireEvent.change(within(row).getByLabelText('Tool input schema (JSON)'), {
      target: { value: '{ not valid json' }
    })
    fireEvent.click(within(row).getByRole('button', { name: 'Save definition' }))

    expect(
      await screen.findByText('Input schema must be valid JSON (an object).')
    ).toBeInTheDocument()
    expect(toolsUpsertMock).not.toHaveBeenCalled()
  })

  it('upserts the tool definition with the existing handlerKey when the schema is valid JSON', async () => {
    scenariosGetMock.mockResolvedValue(emptyDetail)
    toolsListMock.mockResolvedValue({ items: [withHandler], count: 1 })
    toolsUpsertMock.mockResolvedValue({ ...withHandler, description: 'Updated description.' })

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')
    const row = await screen.findByTestId('tool-row-lookup_order')

    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    fireEvent.change(within(row).getByLabelText('Tool description'), {
      target: { value: 'Updated description.' }
    })
    fireEvent.change(within(row).getByLabelText('Tool input schema (JSON)'), {
      target: { value: '{"type": "object", "properties": {}}' }
    })
    fireEvent.click(within(row).getByRole('button', { name: 'Save definition' }))

    await waitFor(() => expect(toolsUpsertMock).toHaveBeenCalledTimes(1))
    expect(toolsUpsertMock).toHaveBeenCalledWith('demo', 'lookup_order', {
      description: 'Updated description.',
      inputSchema: { type: 'object', properties: {} },
      handlerKey: 'lookup_order'
    })
  })

  it('rejects a JSON array as the input schema (must be an object)', async () => {
    scenariosGetMock.mockResolvedValue(emptyDetail)
    toolsListMock.mockResolvedValue({ items: [withHandler], count: 1 })

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')
    const row = await screen.findByTestId('tool-row-lookup_order')

    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    fireEvent.change(within(row).getByLabelText('Tool input schema (JSON)'), {
      target: { value: '[1, 2, 3]' }
    })
    fireEvent.click(within(row).getByRole('button', { name: 'Save definition' }))

    expect(
      await screen.findByText('Input schema must be valid JSON (an object).')
    ).toBeInTheDocument()
    expect(toolsUpsertMock).not.toHaveBeenCalled()
  })

  it('surfaces a config-store-down error from tool upsert via onConfigStoreDown', async () => {
    scenariosGetMock.mockResolvedValue(emptyDetail)
    toolsListMock.mockResolvedValue({ items: [withHandler], count: 1 })
    toolsUpsertMock.mockRejectedValue(new ApiError('down', { code: 'upstream_error' }))

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')
    const row = await screen.findByTestId('tool-row-lookup_order')

    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    fireEvent.click(within(row).getByRole('button', { name: 'Save definition' }))

    await waitFor(() => expect(onConfigStoreDown).toHaveBeenCalledTimes(1))
  })
})

describe('ScenarioDetailEditor — editing and deleting prompts', () => {
  const detailWithPrompt: ScenarioDetail = {
    ...emptyDetail,
    systemPrompts: [{ id: 'p1', name: 'Terse', content: 'Be terse.' }]
  }

  it('edits a prompt: switches to the edit form, saves the new name/content, and refreshes', async () => {
    scenariosGetMock.mockResolvedValue(detailWithPrompt)
    promptsUpdateMock.mockResolvedValue({ id: 'p1' })

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const form = screen.getByLabelText('Edit Terse')
    fireEvent.change(within(form).getByLabelText('Prompt name'), {
      target: { value: 'Terser' }
    })
    fireEvent.change(within(form).getByLabelText('Prompt content'), {
      target: { value: 'Be very terse.' }
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(promptsUpdateMock).toHaveBeenCalledTimes(1))
    expect(promptsUpdateMock).toHaveBeenCalledWith('demo', 'p1', {
      name: 'Terser',
      content: 'Be very terse.'
    })
    // Reload after save happens through onDone -> onRefresh (loadScenario again).
    await waitFor(() => expect(scenariosGetMock).toHaveBeenCalledTimes(2))
  })

  it('cancelling a prompt edit returns to the read-only row without saving', async () => {
    scenariosGetMock.mockResolvedValue(detailWithPrompt)

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Edit Terse')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Edit Terse')).not.toBeInTheDocument()
    expect(promptsUpdateMock).not.toHaveBeenCalled()
  })

  it('deletes a prompt through the confirm/cancel two-step, only calling remove on Confirm', async () => {
    scenariosGetMock.mockResolvedValue(detailWithPrompt)
    promptsRemoveMock.mockResolvedValue(undefined)

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    // Second thoughts: Cancel backs out without deleting.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(promptsRemoveMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(promptsRemoveMock).toHaveBeenCalledWith('demo', 'p1'))
  })

  it('shows an inline error and re-enables the form when a prompt update fails (non-config-store error)', async () => {
    scenariosGetMock.mockResolvedValue(detailWithPrompt)
    promptsUpdateMock.mockRejectedValue(new Error('server exploded'))

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('server exploded')).toBeInTheDocument()
    expect(onConfigStoreDown).not.toHaveBeenCalled()
  })
})

describe('ScenarioDetailEditor — dataset content, editing, and deleting', () => {
  const datasetMeta: DatasetMeta = {
    id: 'orders',
    name: 'Orders',
    description: 'Order rows',
    contentType: 'application/json'
  }
  const datasetFull: Dataset = { ...datasetMeta, content: '[{"id": "B456"}]' }
  const detailWithDataset: ScenarioDetail = { ...emptyDetail, datasets: [datasetMeta] }

  it('lazily loads and displays dataset content only on "View content", and toggles it away on "Hide content"', async () => {
    scenariosGetMock.mockResolvedValue(detailWithDataset)
    datasetsGetMock.mockResolvedValue(datasetFull)

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')

    expect(datasetsGetMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'View content' }))

    expect(await screen.findByTestId('dataset-content-orders')).toHaveTextContent(
      '[{"id": "B456"}]'
    )
    expect(datasetsGetMock).toHaveBeenCalledWith('demo', 'orders')
    expect(screen.getByText('16 characters')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide content' }))
    expect(screen.queryByTestId('dataset-content-orders')).not.toBeInTheDocument()

    // Re-expanding does not refetch: content is cached in local state.
    fireEvent.click(screen.getByRole('button', { name: 'View content' }))
    await screen.findByTestId('dataset-content-orders')
    expect(datasetsGetMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces a content-load error inline when fetching dataset content fails', async () => {
    scenariosGetMock.mockResolvedValue(detailWithDataset)
    datasetsGetMock.mockRejectedValue(new Error('fetch failed'))

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')

    fireEvent.click(screen.getByRole('button', { name: 'View content' }))
    expect(await screen.findByText('fetch failed')).toBeInTheDocument()
  })

  it('editing a dataset loads content first (if not already expanded), then saves the updated fields', async () => {
    scenariosGetMock.mockResolvedValue(detailWithDataset)
    datasetsGetMock.mockResolvedValue(datasetFull)
    datasetsUpdateMock.mockResolvedValue(undefined)

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const form = await screen.findByLabelText('Edit Orders')
    expect(datasetsGetMock).toHaveBeenCalledWith('demo', 'orders')

    fireEvent.change(within(form).getByLabelText('Dataset name'), {
      target: { value: 'Orders v2' }
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(datasetsUpdateMock).toHaveBeenCalledTimes(1))
    expect(datasetsUpdateMock).toHaveBeenCalledWith('demo', 'orders', {
      name: 'Orders v2',
      description: 'Order rows',
      contentType: 'application/json',
      content: '[{"id": "B456"}]'
    })
  })

  it('deletes a dataset through the confirm step and calls onRefresh', async () => {
    scenariosGetMock.mockResolvedValue(detailWithDataset)
    datasetsRemoveMock.mockResolvedValue(undefined)

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(datasetsRemoveMock).toHaveBeenCalledWith('demo', 'orders'))
  })

  it('reads an uploaded file into the new-dataset content textarea', async () => {
    scenariosGetMock.mockResolvedValue(emptyDetail)

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)
    await screen.findByTestId('scenario-editor-demo')

    fireEvent.click(screen.getByRole('button', { name: '+ Add dataset' }))
    const file = new File(['id,name\n1,Ann'], 'rows.csv', { type: 'text/csv' })
    const fileInput = screen.getByLabelText('Upload a file (optional, fills content below)')

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() =>
      expect(screen.getByLabelText('New dataset content')).toHaveValue('id,name\n1,Ann')
    )
  })
})

describe('ScenarioDetailEditor — top-level loading/error states', () => {
  it('shows a loading spinner while the scenario detail is loading and nothing is cached yet', () => {
    scenariosGetMock.mockReturnValue(new Promise(() => {}))

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)

    expect(screen.getByText('Loading scenario…')).toBeInTheDocument()
  })

  it('shows an inline error when loading fails and nothing is cached, without rendering sections', async () => {
    scenariosGetMock.mockRejectedValue(new Error('scenario not found'))

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)

    expect(await screen.findByText(/Could not load scenario:/)).toHaveTextContent(
      'scenario not found'
    )
    expect(screen.queryByTestId('scenario-editor-demo')).not.toBeInTheDocument()
  })

  it('calls onConfigStoreDown when the detail load fails with an upstream_error', async () => {
    scenariosGetMock.mockRejectedValue(new ApiError('down', { code: 'upstream_error' }))

    render(<ScenarioDetailEditor scenarioId="demo" onConfigStoreDown={onConfigStoreDown} />)

    await waitFor(() => expect(onConfigStoreDown).toHaveBeenCalledTimes(1))
  })
})
