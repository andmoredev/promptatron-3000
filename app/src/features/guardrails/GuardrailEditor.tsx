/**
 * Create/edit form for the simplified guardrail config.
 *
 * `guardrailId === null` is create; otherwise the DRAFT working copy is
 * hydrated (once) from `loadGuardrail` into local form state, edited freely,
 * and re-submitted whole via `updateGuardrail`. Bedrock rejects a guardrail
 * with no policy at all, so `hasAnyPolicy` mirrors that rule client-side
 * before the request is even made.
 */

import { useEffect, useRef, useState } from 'react'
import LoadingSpinner from '../../components/LoadingSpinner'
import { selectGuardrailDetail, useGuardrailStore } from '../../stores'
import type {
  ContentFilter,
  ContentFilterType,
  ContextualGrounding,
  DeniedTopic,
  GuardrailConfig,
  GuardrailStrength,
  ManagedWordListType,
  PiiEntity,
  PiiEntityType,
  PiiPolicy,
  WordPolicy
} from '../../api'

const CONTENT_FILTER_TYPES: ContentFilterType[] = [
  'HATE',
  'INSULTS',
  'SEXUAL',
  'VIOLENCE',
  'MISCONDUCT',
  'PROMPT_ATTACK'
]

const FILTER_LABELS: Record<ContentFilterType, string> = {
  HATE: 'Hate',
  INSULTS: 'Insults',
  SEXUAL: 'Sexual',
  VIOLENCE: 'Violence',
  MISCONDUCT: 'Misconduct',
  PROMPT_ATTACK: 'Prompt attack'
}

const STRENGTHS: GuardrailStrength[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH']

const PII_ENTITY_TYPES: PiiEntityType[] = [
  'ADDRESS',
  'AGE',
  'AWS_ACCESS_KEY',
  'AWS_SECRET_KEY',
  'CA_HEALTH_NUMBER',
  'CA_SOCIAL_INSURANCE_NUMBER',
  'CREDIT_DEBIT_CARD_CVV',
  'CREDIT_DEBIT_CARD_EXPIRY',
  'CREDIT_DEBIT_CARD_NUMBER',
  'DRIVER_ID',
  'EMAIL',
  'INTERNATIONAL_BANK_ACCOUNT_NUMBER',
  'IP_ADDRESS',
  'LICENSE_PLATE',
  'MAC_ADDRESS',
  'NAME',
  'PASSWORD',
  'PHONE',
  'PIN',
  'SWIFT_CODE',
  'UK_NATIONAL_HEALTH_SERVICE_NUMBER',
  'UK_NATIONAL_INSURANCE_NUMBER',
  'UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER',
  'URL',
  'USERNAME',
  'US_BANK_ACCOUNT_NUMBER',
  'US_BANK_ROUTING_NUMBER',
  'US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER',
  'US_PASSPORT_NUMBER',
  'US_SOCIAL_SECURITY_NUMBER',
  'VEHICLE_IDENTIFICATION_NUMBER'
]

interface FilterFormState {
  enabled: boolean
  inputStrength: GuardrailStrength
  outputStrength: GuardrailStrength
}

type FilterFormMap = Record<ContentFilterType, FilterFormState>

function defaultFilterMap(): FilterFormMap {
  const map = {} as FilterFormMap
  for (const type of CONTENT_FILTER_TYPES) {
    map[type] = { enabled: false, inputStrength: 'NONE', outputStrength: 'NONE' }
  }
  return map
}

interface DeniedTopicRow {
  name: string
  definition: string
  /** Raw textarea contents; split on save. */
  examples: string
}

interface PiiRow {
  type: PiiEntityType
  action: 'BLOCK' | 'ANONYMIZE'
}

/** `"a, b\nc"` -> `["a", "b", "c"]`, capped at Bedrock's 5-example limit. */
function splitExamples(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 5)
}

/** `"a\nb\n\nc"` -> `["a", "b", "c"]`. */
function splitLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function emptyToNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/** Bedrock rejects a guardrail with no policy configured at all. */
function hasAnyPolicy(config: GuardrailConfig): boolean {
  return Boolean(
    config.contentPolicy ||
      (config.deniedTopics && config.deniedTopics.length > 0) ||
      config.wordPolicy ||
      config.piiPolicy ||
      config.contextualGrounding
  )
}

export default function GuardrailEditor({
  guardrailId,
  onClose
}: {
  guardrailId: string | null
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [blockedInputMessage, setBlockedInputMessage] = useState('')
  const [blockedOutputMessage, setBlockedOutputMessage] = useState('')
  const [filters, setFilters] = useState<FilterFormMap>(defaultFilterMap)
  const [deniedTopics, setDeniedTopics] = useState<DeniedTopicRow[]>([])
  const [words, setWords] = useState('')
  const [managedProfanity, setManagedProfanity] = useState(false)
  const [piiRows, setPiiRows] = useState<PiiRow[]>([])
  const [groundingThreshold, setGroundingThreshold] = useState('')
  const [relevanceThreshold, setRelevanceThreshold] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const loadGuardrail = useGuardrailStore((state) => state.loadGuardrail)
  const createGuardrail = useGuardrailStore((state) => state.createGuardrail)
  const updateGuardrail = useGuardrailStore((state) => state.updateGuardrail)
  const saving = useGuardrailStore((state) => state.saving)
  const saveError = useGuardrailStore((state) => state.saveError)
  const detail = useGuardrailStore(selectGuardrailDetail(guardrailId))
  const detailLoading = useGuardrailStore((state) =>
    guardrailId ? (state.detailLoading[guardrailId] ?? false) : false
  )

  const hydratedRef = useRef(false)

  useEffect(() => {
    if (guardrailId) void loadGuardrail(guardrailId)
  }, [guardrailId, loadGuardrail])

  useEffect(() => {
    if (!detail || hydratedRef.current) return
    hydratedRef.current = true

    setName(detail.name)
    setDescription(detail.description ?? '')
    setBlockedInputMessage(detail.blockedInputMessage ?? '')
    setBlockedOutputMessage(detail.blockedOutputMessage ?? '')

    const nextFilters = defaultFilterMap()
    for (const filter of detail.contentPolicy?.filters ?? []) {
      nextFilters[filter.type] = {
        enabled: true,
        inputStrength: filter.inputStrength ?? 'NONE',
        outputStrength: filter.outputStrength ?? 'NONE'
      }
    }
    setFilters(nextFilters)

    setDeniedTopics(
      (detail.deniedTopics ?? []).map((topic) => ({
        name: topic.name,
        definition: topic.definition,
        examples: (topic.examples ?? []).join('\n')
      }))
    )

    setWords((detail.wordPolicy?.words ?? []).join('\n'))
    setManagedProfanity(Boolean(detail.wordPolicy?.managedWordLists?.includes('PROFANITY')))

    setPiiRows(
      (detail.piiPolicy?.entities ?? []).map((entity) => ({
        type: entity.type,
        action: entity.action === 'ANONYMIZE' ? 'ANONYMIZE' : 'BLOCK'
      }))
    )

    setGroundingThreshold(
      detail.contextualGrounding?.groundingThreshold != null
        ? String(detail.contextualGrounding.groundingThreshold)
        : ''
    )
    setRelevanceThreshold(
      detail.contextualGrounding?.relevanceThreshold != null
        ? String(detail.contextualGrounding.relevanceThreshold)
        : ''
    )
  }, [detail])

  function updateFilter(type: ContentFilterType, patch: Partial<FilterFormState>) {
    setFilters((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }))
  }

  function addDeniedTopic() {
    setDeniedTopics((prev) => [...prev, { name: '', definition: '', examples: '' }])
  }

  function updateDeniedTopic(index: number, patch: Partial<DeniedTopicRow>) {
    setDeniedTopics((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    )
  }

  function removeDeniedTopic(index: number) {
    setDeniedTopics((prev) => prev.filter((_, i) => i !== index))
  }

  function addPiiRow() {
    setPiiRows((prev) => [...prev, { type: 'EMAIL', action: 'BLOCK' }])
  }

  function updatePiiRow(index: number, patch: Partial<PiiRow>) {
    setPiiRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function removePiiRow(index: number) {
    setPiiRows((prev) => prev.filter((_, i) => i !== index))
  }

  function buildConfig(): GuardrailConfig {
    const enabledFilters: ContentFilter[] = CONTENT_FILTER_TYPES.filter(
      (type) => filters[type].enabled
    ).map((type) => ({
      type,
      inputStrength: filters[type].inputStrength,
      outputStrength: type === 'PROMPT_ATTACK' ? 'NONE' : filters[type].outputStrength
    }))

    const cleanedDeniedTopics: DeniedTopic[] = deniedTopics
      .filter((row) => row.name.trim() !== '' && row.definition.trim() !== '')
      .map((row) => ({
        name: row.name.trim(),
        definition: row.definition.trim(),
        examples: splitExamples(row.examples)
      }))

    const wordList = splitLines(words)
    const managedWordLists: ManagedWordListType[] = managedProfanity ? ['PROFANITY'] : []
    const wordPolicy: WordPolicy | null =
      wordList.length > 0 || managedWordLists.length > 0
        ? { words: wordList, managedWordLists }
        : null

    const piiEntities: PiiEntity[] = piiRows.map((row) => ({
      type: row.type,
      action: row.action
    }))
    const piiPolicy: PiiPolicy | null = piiEntities.length > 0 ? { entities: piiEntities } : null

    const grounding = emptyToNull(groundingThreshold)
    const relevance = emptyToNull(relevanceThreshold)
    const contextualGrounding: ContextualGrounding | null =
      grounding != null || relevance != null
        ? { groundingThreshold: grounding, relevanceThreshold: relevance }
        : null

    return {
      name: name.trim(),
      description: emptyToUndefined(description),
      contentPolicy: enabledFilters.length > 0 ? { filters: enabledFilters } : null,
      deniedTopics: cleanedDeniedTopics.length > 0 ? cleanedDeniedTopics : undefined,
      wordPolicy,
      piiPolicy,
      contextualGrounding,
      blockedInputMessage: emptyToUndefined(blockedInputMessage),
      blockedOutputMessage: emptyToUndefined(blockedOutputMessage)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    if (name.trim() === '') {
      setFormError('Name is required.')
      return
    }

    const config = buildConfig()
    if (!hasAnyPolicy(config)) {
      setFormError(
        'Configure at least one policy — a content filter, denied topic, word list, PII rule, or grounding threshold.'
      )
      return
    }

    const result = guardrailId
      ? await updateGuardrail(guardrailId, config)
      : await createGuardrail(config)
    if (result) onClose()
  }

  if (guardrailId && detailLoading && !detail) {
    return (
      <div className="card max-w-3xl mx-auto">
        <LoadingSpinner text="Loading guardrail…" />
      </div>
    )
  }

  return (
    <form
      className="max-w-3xl mx-auto space-y-4"
      data-testid="guardrail-editor"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {guardrailId ? 'Edit guardrail' : 'New guardrail'}
        </h2>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Back
        </button>
      </div>

      <section className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Basics</h3>
        <div className="space-y-3">
          <div>
            <label htmlFor="guardrail-name" className="block text-xs font-medium text-gray-700 mb-1">
              Name<span aria-hidden="true"> *</span>
            </label>
            <input
              id="guardrail-name"
              type="text"
              className="input-field"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="guardrail-description"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Description
            </label>
            <input
              id="guardrail-description"
              type="text"
              className="input-field"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="blocked-input-message"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Blocked input message
              </label>
              <textarea
                id="blocked-input-message"
                className="input-field"
                rows={2}
                value={blockedInputMessage}
                onChange={(event) => setBlockedInputMessage(event.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="blocked-output-message"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Blocked output message
              </label>
              <textarea
                id="blocked-output-message"
                className="input-field"
                rows={2}
                value={blockedOutputMessage}
                onChange={(event) => setBlockedOutputMessage(event.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Content filters</h3>
        <div className="space-y-3">
          {CONTENT_FILTER_TYPES.map((type) => {
            const filter = filters[type]
            const isPromptAttack = type === 'PROMPT_ATTACK'
            return (
              <div
                key={type}
                className="grid grid-cols-1 sm:grid-cols-[10rem_1fr_1fr] gap-2 sm:items-end p-3 rounded-lg border border-gray-200"
                data-testid={`filter-row-${type}`}
              >
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary-600"
                    data-testid={`filter-enable-${type}`}
                    checked={filter.enabled}
                    onChange={(event) => updateFilter(type, { enabled: event.target.checked })}
                  />
                  {FILTER_LABELS[type]}
                </label>
                <div>
                  <label
                    htmlFor={`filter-${type}-input`}
                    className="block text-xs text-gray-600 mb-1"
                  >
                    Input strength
                  </label>
                  <select
                    id={`filter-${type}-input`}
                    className="select-field"
                    disabled={!filter.enabled}
                    value={filter.inputStrength}
                    onChange={(event) =>
                      updateFilter(type, {
                        inputStrength: event.target.value as GuardrailStrength
                      })
                    }
                  >
                    {STRENGTHS.map((strength) => (
                      <option key={strength} value={strength}>
                        {strength}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor={`filter-${type}-output`}
                    className="block text-xs text-gray-600 mb-1"
                  >
                    Output strength
                  </label>
                  <select
                    id={`filter-${type}-output`}
                    className="select-field"
                    disabled={!filter.enabled || isPromptAttack}
                    value={isPromptAttack ? 'NONE' : filter.outputStrength}
                    onChange={(event) =>
                      updateFilter(type, {
                        outputStrength: event.target.value as GuardrailStrength
                      })
                    }
                  >
                    {STRENGTHS.map((strength) => (
                      <option key={strength} value={strength}>
                        {strength}
                      </option>
                    ))}
                  </select>
                  {isPromptAttack && (
                    <p className="mt-1 text-xs text-gray-500">
                      Output strength is always NONE for prompt attacks.
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Denied topics</h3>
        <div className="space-y-3" data-testid="denied-topic-rows">
          {deniedTopics.map((row, index) => (
            <div
              key={index}
              className="p-3 rounded-lg border border-gray-200 space-y-2"
              data-testid={`denied-topic-row-${index}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Topic {index + 1}</span>
                <button
                  type="button"
                  className="text-xs font-medium text-red-700 hover:text-red-800"
                  onClick={() => removeDeniedTopic(index)}
                >
                  Remove
                </button>
              </div>
              <input
                type="text"
                className="input-field"
                placeholder="Name"
                aria-label={`Denied topic ${index + 1} name`}
                value={row.name}
                onChange={(event) => updateDeniedTopic(index, { name: event.target.value })}
              />
              <textarea
                className="input-field"
                rows={2}
                placeholder="Definition"
                aria-label={`Denied topic ${index + 1} definition`}
                value={row.definition}
                onChange={(event) =>
                  updateDeniedTopic(index, { definition: event.target.value })
                }
              />
              <textarea
                className="input-field"
                rows={2}
                placeholder="Examples (comma or newline separated, up to 5)"
                aria-label={`Denied topic ${index + 1} examples`}
                value={row.examples}
                onChange={(event) => updateDeniedTopic(index, { examples: event.target.value })}
              />
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={addDeniedTopic}>
            Add denied topic
          </button>
        </div>
      </section>

      <section className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Words</h3>
        <label htmlFor="denied-words" className="block text-xs font-medium text-gray-700 mb-1">
          Denied words (one per line)
        </label>
        <textarea
          id="denied-words"
          className="input-field"
          rows={4}
          value={words}
          onChange={(event) => setWords(event.target.value)}
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600"
            checked={managedProfanity}
            onChange={(event) => setManagedProfanity(event.target.checked)}
          />
          Use the managed profanity word list
        </label>
      </section>

      <section className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-3">PII</h3>
        <div className="space-y-3" data-testid="pii-rows">
          {piiRows.map((row, index) => (
            <div
              key={index}
              className="flex flex-wrap items-end gap-2 p-3 rounded-lg border border-gray-200"
              data-testid={`pii-row-${index}`}
            >
              <div className="flex-1 min-w-[10rem]">
                <label
                  htmlFor={`pii-type-${index}`}
                  className="block text-xs text-gray-600 mb-1"
                >
                  Entity type
                </label>
                <select
                  id={`pii-type-${index}`}
                  className="select-field"
                  value={row.type}
                  onChange={(event) =>
                    updatePiiRow(index, { type: event.target.value as PiiEntityType })
                  }
                >
                  {PII_ENTITY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[8rem]">
                <label
                  htmlFor={`pii-action-${index}`}
                  className="block text-xs text-gray-600 mb-1"
                >
                  Action
                </label>
                <select
                  id={`pii-action-${index}`}
                  className="select-field"
                  value={row.action}
                  onChange={(event) =>
                    updatePiiRow(index, {
                      action: event.target.value as 'BLOCK' | 'ANONYMIZE'
                    })
                  }
                >
                  <option value="BLOCK">BLOCK</option>
                  <option value="ANONYMIZE">ANONYMIZE</option>
                </select>
              </div>
              <button
                type="button"
                className="text-xs font-medium text-red-700 hover:text-red-800 mb-2"
                onClick={() => removePiiRow(index)}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={addPiiRow}>
            Add PII rule
          </button>
        </div>
      </section>

      <section className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Contextual grounding</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="grounding-threshold"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Grounding threshold (0-1)
            </label>
            <input
              id="grounding-threshold"
              type="number"
              step="0.05"
              min={0}
              max={1}
              className="input-field"
              value={groundingThreshold}
              onChange={(event) => setGroundingThreshold(event.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="relevance-threshold"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Relevance threshold (0-1)
            </label>
            <input
              id="relevance-threshold"
              type="number"
              step="0.05"
              min={0}
              max={1}
              className="input-field"
              value={relevanceThreshold}
              onChange={(event) => setRelevanceThreshold(event.target.value)}
            />
          </div>
        </div>
      </section>

      {formError && (
        <p className="text-sm text-red-600" role="alert" data-testid="form-error">
          {formError}
        </p>
      )}

      {saveError && (
        <p className="text-sm text-red-600" role="alert" data-testid="save-error">
          Could not save: {saveError.message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
