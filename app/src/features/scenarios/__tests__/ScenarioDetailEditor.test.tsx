/**
 * ScenarioDetailEditor: prompt kind on add, dataset create body, the tools
 * list's `handler_registered` badges, and JSON-schema validation on tool
 * upsert.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ScenarioDetail, ToolListItem, ToolListResponse } from '../../../api'

const scenariosGetMock = vi.fn()
const promptsCreateMock = vi.fn()
const datasetsCreateMock = vi.fn()
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
        prompts: { ...actual.api.scenarios.prompts, create: promptsCreateMock },
        datasets: { ...actual.api.scenarios.datasets, create: datasetsCreateMock },
        tools: { ...actual.api.scenarios.tools, list: toolsListMock, upsert: toolsUpsertMock }
      }
    }
  }
})

const { useScenarioStore } = await import('../../../stores')
const { default: ScenarioDetailEditor } = await import('../ScenarioDetailEditor')

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
  datasetsCreateMock.mockReset()
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
})
