/**
 * ScenariosPage: list rendering off the real `scenarioStore` (network calls
 * stubbed at the `api` module), slug-validated scenario creation, inline
 * delete confirm, and the config-store-unreachable page takeover.
 */
// @ts-nocheck


import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ScenarioListResponse, ScenarioSummary } from '../../../api'

const scenariosListMock = vi.fn()
const scenariosCreateMock = vi.fn()
const scenariosRemoveMock = vi.fn()

vi.mock('../../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      scenarios: {
        ...actual.api.scenarios,
        list: scenariosListMock,
        create: scenariosCreateMock,
        remove: scenariosRemoveMock
      }
    }
  }
})

const { ApiError } = await import('../../../api')
const { useScenarioStore } = await import('../../../stores')
const { default: ScenariosPage } = await import('../ScenariosPage')

const shipping: ScenarioSummary = {
  id: 'shipping',
  name: 'Shipping support',
  description: 'Where is my order?',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z'
}

const billing: ScenarioSummary = {
  id: 'billing',
  name: 'Billing support',
  description: null,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z'
}

function listResponse(items: ScenarioSummary[]): ScenarioListResponse {
  return { items, count: items.length, nextToken: null }
}

beforeEach(() => {
  scenariosListMock.mockReset()
  scenariosCreateMock.mockReset()
  scenariosRemoveMock.mockReset()
  useScenarioStore.getState().clear()
})

describe('ScenariosPage', () => {
  it('renders the scenario list from the store', async () => {
    scenariosListMock.mockResolvedValue(listResponse([shipping, billing]))

    render(<ScenariosPage />)

    expect(await screen.findByTestId('scenario-row-shipping')).toBeInTheDocument()
    expect(screen.getByTestId('scenario-row-billing')).toBeInTheDocument()
    expect(within(screen.getByTestId('scenario-row-shipping')).getByText('Shipping support')).toBeInTheDocument()
    expect(within(screen.getByTestId('scenario-row-shipping')).getByText('shipping')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('scenario-row-shipping')).getByText('Where is my order?')
    ).toBeInTheDocument()
  })

  it('shows an empty state when there are no scenarios', async () => {
    scenariosListMock.mockResolvedValue(listResponse([]))

    render(<ScenariosPage />)

    expect(await screen.findByTestId('scenarios-empty')).toBeInTheDocument()
  })

  it('validates the id slug and blocks submission until it and name are valid', async () => {
    scenariosListMock.mockResolvedValue(listResponse([]))
    render(<ScenariosPage />)
    await screen.findByTestId('scenarios-empty')

    fireEvent.click(screen.getByRole('button', { name: 'New scenario' }))

    const createButton = screen.getByRole('button', { name: 'Create scenario' })
    expect(createButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Id (slug)'), { target: { value: 'Not A Slug!' } })
    expect(
      screen.getByText('Id must be lowercase letters, numbers, and hyphens only.')
    ).toBeInTheDocument()
    expect(createButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Id (slug)'), { target: { value: 'refund-support' } })
    expect(createButton).toBeDisabled() // name still empty

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Refund support' } })
    expect(createButton).toBeEnabled()
  })

  it('calls api.scenarios.create with the form body and refreshes the list', async () => {
    scenariosListMock.mockResolvedValueOnce(listResponse([]))
    render(<ScenariosPage />)
    await screen.findByTestId('scenarios-empty')

    scenariosCreateMock.mockResolvedValue({
      id: 'refund-support',
      name: 'Refund support',
      description: 'Handles refunds',
      systemPrompts: [],
      userPrompts: [],
      tools: [],
      datasets: []
    })
    scenariosListMock.mockResolvedValueOnce(
      listResponse([
        {
          id: 'refund-support',
          name: 'Refund support',
          description: 'Handles refunds',
          createdAt: '2026-08-12T00:00:00Z',
          updatedAt: '2026-08-12T00:00:00Z'
        }
      ])
    )

    fireEvent.click(screen.getByRole('button', { name: 'New scenario' }))
    fireEvent.change(screen.getByLabelText('Id (slug)'), { target: { value: 'refund-support' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Refund support' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Handles refunds' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }))

    await waitFor(() => expect(scenariosCreateMock).toHaveBeenCalledTimes(1))
    expect(scenariosCreateMock).toHaveBeenCalledWith({
      id: 'refund-support',
      name: 'Refund support',
      description: 'Handles refunds'
    })

    expect(await screen.findByTestId('scenario-row-refund-support')).toBeInTheDocument()
    expect(scenariosListMock).toHaveBeenCalledTimes(2)
  })

  it('deletes a scenario after inline confirmation', async () => {
    scenariosListMock.mockResolvedValueOnce(listResponse([shipping]))
    render(<ScenariosPage />)
    await screen.findByTestId('scenario-row-shipping')

    scenariosRemoveMock.mockResolvedValue(undefined)
    scenariosListMock.mockResolvedValueOnce(listResponse([]))

    const row = screen.getByTestId('scenario-row-shipping')
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(row).getByRole('button', { name: 'Yes' }))

    await waitFor(() => expect(scenariosRemoveMock).toHaveBeenCalledWith('shipping'))
    await waitFor(() => expect(screen.queryByTestId('scenario-row-shipping')).not.toBeInTheDocument())
  })

  it('shows the config-store-unreachable notice when the store load fails with upstream_error', async () => {
    scenariosListMock.mockRejectedValue(
      new ApiError('config store not configured', { code: 'upstream_error', status: 502 })
    )

    render(<ScenariosPage />)

    expect(await screen.findByTestId('config-store-notice')).toBeInTheDocument()
    expect(screen.getByText(/Config store not reachable/i)).toBeInTheDocument()
    expect(screen.queryByTestId('scenarios-page')).not.toBeInTheDocument()
  })

  it('surfaces a non-upstream scenario list error inline instead of the takeover notice', async () => {
    scenariosListMock.mockRejectedValue(
      new ApiError('boom', { code: 'internal_error', status: 500 })
    )

    render(<ScenariosPage />)

    expect(await screen.findByText(/Could not load scenarios: boom/)).toBeInTheDocument()
    expect(screen.queryByTestId('config-store-notice')).not.toBeInTheDocument()
  })
})
