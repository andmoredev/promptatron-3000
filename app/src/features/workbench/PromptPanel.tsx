/**
 * System + user prompt editors.
 *
 * When a scenario is loaded its prompt library is offered as a dropdown above
 * each editor; picking one calls `selectSystemPrompt`/`selectUserPrompt`, which
 * sets the text *and* records which library entry it came from. Typing freely
 * afterwards is fine — the run request only ever carries the text.
 */

import { selectScenarioDetail, useRunConfigStore, useScenarioStore } from '../../stores'
import type { PromptSummary } from '../../api'

interface PromptLibraryProps {
  id: string
  label: string
  prompts: PromptSummary[]
  selectedId: string | null
  onSelect: (promptId: string | null, content?: string) => void
}

function PromptLibrary({ id, label, prompts, selectedId, onSelect }: PromptLibraryProps) {
  if (prompts.length === 0) return null
  return (
    <div className="mb-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        className="select-field text-xs py-1"
        value={selectedId ?? ''}
        onChange={(event) => {
          const promptId = event.target.value
          if (promptId === '') {
            onSelect(null)
            return
          }
          const prompt = prompts.find((entry) => entry.id === promptId)
          onSelect(promptId, prompt?.content ?? '')
        }}
      >
        <option value="">{label}…</option>
        {prompts.map((prompt) => (
          <option key={prompt.id} value={prompt.id}>
            {prompt.name}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function PromptPanel() {
  const scenarioId = useRunConfigStore((state) => state.scenario_id)
  const systemPrompt = useRunConfigStore((state) => state.system_prompt)
  const userPrompt = useRunConfigStore((state) => state.user_prompt)
  const systemPromptId = useRunConfigStore((state) => state.system_prompt_id)
  const userPromptId = useRunConfigStore((state) => state.user_prompt_id)
  const setSystemPrompt = useRunConfigStore((state) => state.setSystemPrompt)
  const setUserPrompt = useRunConfigStore((state) => state.setUserPrompt)
  const selectSystemPrompt = useRunConfigStore((state) => state.selectSystemPrompt)
  const selectUserPrompt = useRunConfigStore((state) => state.selectUserPrompt)

  const detail = useScenarioStore(selectScenarioDetail(scenarioId))

  return (
    <section className="card" aria-labelledby="prompt-panel-heading">
      <h2 id="prompt-panel-heading" className="text-base font-semibold text-gray-900 mb-3">
        Prompts
      </h2>

      <div className="mb-4">
        <label htmlFor="system-prompt" className="block text-xs font-medium text-gray-700 mb-1">
          System prompt
        </label>
        <PromptLibrary
          id="system-prompt-library"
          label="Load a system prompt"
          prompts={detail?.systemPrompts ?? []}
          selectedId={systemPromptId}
          onSelect={selectSystemPrompt}
        />
        <textarea
          id="system-prompt"
          className="input-field font-mono text-sm"
          rows={6}
          placeholder="You are a helpful assistant…"
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="user-prompt" className="block text-xs font-medium text-gray-700 mb-1">
          User prompt
        </label>
        <PromptLibrary
          id="user-prompt-library"
          label="Load a user prompt"
          prompts={detail?.userPrompts ?? []}
          selectedId={userPromptId}
          onSelect={selectUserPrompt}
        />
        <textarea
          id="user-prompt"
          className="input-field font-mono text-sm"
          rows={5}
          placeholder="Ask the model something…"
          value={userPrompt}
          onChange={(event) => setUserPrompt(event.target.value)}
        />
      </div>
    </section>
  )
}
