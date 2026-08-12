/**
 * GuardrailEditor against a stubbed `guardrailStore`: client-side validation
 * (name, at-least-one-policy), the exact config shape built from the content
 * filter / PII form controls, the PROMPT_ATTACK output-strength lockout, and
 * edit-mode hydration from a cached detail.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import GuardrailEditor from '../GuardrailEditor'
import { guardrailCacheKey, INITIAL_GUARDRAIL_STATE, useGuardrailStore } from '../../../stores'
import type { GuardrailDetail } from '../../../api'

const createGuardrail = vi.fn()
const updateGuardrail = vi.fn()
const loadGuardrail = vi.fn().mockResolvedValue(null)

beforeEach(() => {
  createGuardrail.mockReset().mockResolvedValue({ id: 'gr-new' })
  updateGuardrail.mockReset().mockResolvedValue({ id: 'gr-1' })
  loadGuardrail.mockClear()
  useGuardrailStore.setState({
    ...INITIAL_GUARDRAIL_STATE,
    createGuardrail,
    updateGuardrail,
    loadGuardrail
  })
})

function fillName(value: string) {
  fireEvent.change(screen.getByLabelText(/Name/), { target: { value } })
}

describe('GuardrailEditor validation', () => {
  it('blocks submit when name is empty', () => {
    const onClose = vi.fn()
    render(<GuardrailEditor guardrailId={null} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByTestId('form-error')).toHaveTextContent('Name is required.')
    expect(createGuardrail).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('blocks submit when no policy is configured', () => {
    render(<GuardrailEditor guardrailId={null} onClose={vi.fn()} />)

    fillName('empty-guardrail')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByTestId('form-error')).toHaveTextContent(/at least one policy/)
    expect(createGuardrail).not.toHaveBeenCalled()
  })
})

describe('GuardrailEditor content filters', () => {
  it('submits the exact config shape for an enabled filter', async () => {
    const onClose = vi.fn()
    render(<GuardrailEditor guardrailId={null} onClose={onClose} />)

    fillName('my-guardrail')

    const hateRow = within(screen.getByTestId('filter-row-HATE'))
    fireEvent.click(hateRow.getByTestId('filter-enable-HATE'))
    fireEvent.change(hateRow.getByLabelText('Input strength'), { target: { value: 'MEDIUM' } })
    fireEvent.change(hateRow.getByLabelText('Output strength'), { target: { value: 'HIGH' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(createGuardrail).toHaveBeenCalledTimes(1)
    expect(createGuardrail).toHaveBeenCalledWith({
      name: 'my-guardrail',
      description: undefined,
      contentPolicy: { filters: [{ type: 'HATE', inputStrength: 'MEDIUM', outputStrength: 'HIGH' }] },
      deniedTopics: undefined,
      wordPolicy: null,
      piiPolicy: null,
      contextualGrounding: null,
      blockedInputMessage: undefined,
      blockedOutputMessage: undefined
    })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('disables the PROMPT_ATTACK output-strength select and forces it to NONE', () => {
    render(<GuardrailEditor guardrailId={null} onClose={vi.fn()} />)

    const row = within(screen.getByTestId('filter-row-PROMPT_ATTACK'))
    const outputSelect = row.getByLabelText('Output strength') as HTMLSelectElement
    expect(outputSelect).toBeDisabled()
    expect(outputSelect).toHaveValue('NONE')

    fireEvent.click(row.getByTestId('filter-enable-PROMPT_ATTACK'))
    expect(outputSelect).toBeDisabled()
    expect(outputSelect).toHaveValue('NONE')

    fillName('attack-guardrail')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(createGuardrail).toHaveBeenCalledWith(
      expect.objectContaining({
        contentPolicy: {
          filters: [{ type: 'PROMPT_ATTACK', inputStrength: 'NONE', outputStrength: 'NONE' }]
        }
      })
    )
  })
})

describe('GuardrailEditor PII rows', () => {
  it('adds and removes PII rows', () => {
    render(<GuardrailEditor guardrailId={null} onClose={vi.fn()} />)

    expect(screen.queryByTestId('pii-row-0')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add PII rule' }))
    expect(screen.getByTestId('pii-row-0')).toBeInTheDocument()

    const row = within(screen.getByTestId('pii-row-0'))
    fireEvent.click(row.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByTestId('pii-row-0')).not.toBeInTheDocument()
  })

  it('submits a configured PII rule', () => {
    render(<GuardrailEditor guardrailId={null} onClose={vi.fn()} />)

    fillName('pii-guardrail')
    fireEvent.click(screen.getByRole('button', { name: 'Add PII rule' }))

    const row = within(screen.getByTestId('pii-row-0'))
    fireEvent.change(row.getByLabelText('Entity type'), { target: { value: 'EMAIL' } })
    fireEvent.change(row.getByLabelText('Action'), { target: { value: 'ANONYMIZE' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(createGuardrail).toHaveBeenCalledWith(
      expect.objectContaining({
        piiPolicy: { entities: [{ type: 'EMAIL', action: 'ANONYMIZE' }] }
      })
    )
  })
})

describe('GuardrailEditor denied topics', () => {
  it('adds a denied topic row, fills it out, and builds the cleaned config (examples split on comma/newline, capped at 5)', () => {
    render(<GuardrailEditor guardrailId={null} onClose={vi.fn()} />)

    fillName('topic-guardrail')
    fireEvent.click(screen.getByRole('button', { name: 'Add denied topic' }))

    const row = within(screen.getByTestId('denied-topic-row-0'))
    fireEvent.change(row.getByLabelText('Denied topic 1 name'), {
      target: { value: 'Legal advice' }
    })
    fireEvent.change(row.getByLabelText('Denied topic 1 definition'), {
      target: { value: 'Requests for legal advice.' }
    })
    fireEvent.change(row.getByLabelText('Denied topic 1 examples'), {
      target: { value: 'a, b\nc,d,e,f' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(createGuardrail).toHaveBeenCalledWith(
      expect.objectContaining({
        deniedTopics: [
          {
            name: 'Legal advice',
            definition: 'Requests for legal advice.',
            examples: ['a', 'b', 'c', 'd', 'e']
          }
        ]
      })
    )
  })

  it('drops a denied topic row that is missing a name or definition, and removing a row via "Remove" discards it', () => {
    render(<GuardrailEditor guardrailId={null} onClose={vi.fn()} />)

    fillName('topic-guardrail')
    fireEvent.click(screen.getByRole('button', { name: 'Add denied topic' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add denied topic' }))
    expect(screen.getByTestId('denied-topic-row-0')).toBeInTheDocument()
    expect(screen.getByTestId('denied-topic-row-1')).toBeInTheDocument()

    // Row 0 is filled in fully; row 1 is left blank (name/definition empty).
    const row0 = within(screen.getByTestId('denied-topic-row-0'))
    fireEvent.change(row0.getByLabelText('Denied topic 1 name'), { target: { value: 'Topic' } })
    fireEvent.change(row0.getByLabelText('Denied topic 1 definition'), {
      target: { value: 'Def' }
    })

    // Remove row 1 instead of filling it in, to also exercise removeDeniedTopic.
    fireEvent.click(within(screen.getByTestId('denied-topic-row-1')).getByRole('button', { name: 'Remove' }))
    expect(screen.queryByTestId('denied-topic-row-1')).not.toBeInTheDocument()

    fillName('topic-guardrail')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(createGuardrail).toHaveBeenCalledWith(
      expect.objectContaining({
        deniedTopics: [{ name: 'Topic', definition: 'Def', examples: [] }]
      })
    )
  })
})

describe('GuardrailEditor save error', () => {
  it('renders the store save error inline when a save attempt fails', () => {
    useGuardrailStore.setState({ saveError: { code: 'validation_error', message: 'name taken' } })
    render(<GuardrailEditor guardrailId={null} onClose={vi.fn()} />)

    expect(screen.getByTestId('save-error')).toHaveTextContent('Could not save: name taken')
  })
})

describe('GuardrailEditor edit mode', () => {
  const DETAIL: GuardrailDetail = {
    id: 'gr-1',
    arn: 'arn:aws:bedrock:us-east-1:123:guardrail/gr-1',
    name: 'existing-guardrail',
    description: 'An existing guardrail',
    version: 'DRAFT',
    status: 'READY',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    contentPolicy: { filters: [{ type: 'SEXUAL', inputStrength: 'LOW', outputStrength: 'LOW' }] },
    deniedTopics: [],
    wordPolicy: null,
    piiPolicy: null,
    contextualGrounding: null,
    blockedInputMessage: 'Blocked in',
    blockedOutputMessage: 'Blocked out'
  }

  it('hydrates the form from the cached detail', () => {
    useGuardrailStore.setState({
      details: { [guardrailCacheKey('gr-1')]: DETAIL }
    })
    render(<GuardrailEditor guardrailId="gr-1" onClose={vi.fn()} />)

    expect(loadGuardrail).toHaveBeenCalledWith('gr-1')
    expect(screen.getByLabelText(/Name/)).toHaveValue('existing-guardrail')
    expect(screen.getByLabelText('Description')).toHaveValue('An existing guardrail')
    expect(within(screen.getByTestId('filter-row-SEXUAL')).getByTestId('filter-enable-SEXUAL')).toBeChecked()
  })

  it('submits an update with the guardrail id', () => {
    useGuardrailStore.setState({
      details: { [guardrailCacheKey('gr-1')]: DETAIL }
    })
    render(<GuardrailEditor guardrailId="gr-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateGuardrail).toHaveBeenCalledTimes(1)
    expect(updateGuardrail).toHaveBeenCalledWith(
      'gr-1',
      expect.objectContaining({
        name: 'existing-guardrail',
        contentPolicy: {
          filters: [{ type: 'SEXUAL', inputStrength: 'LOW', outputStrength: 'LOW' }]
        }
      })
    )
  })
})
