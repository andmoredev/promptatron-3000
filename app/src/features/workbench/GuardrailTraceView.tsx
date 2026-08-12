/**
 * The guardrail assessment for the current run, as pretty JSON.
 *
 * The trace shape is Bedrock's and changes with the policies configured on the
 * guardrail, so this renders it verbatim rather than pretending to know the
 * schema. It collapses itself away entirely when no trace arrived.
 */

import { useRunStore } from '../../stores'

export default function GuardrailTraceView() {
  const guardrailTrace = useRunStore((state) => state.guardrailTrace)

  if (!guardrailTrace) return null

  return (
    <section className="card" aria-labelledby="guardrail-trace-heading">
      <details>
        <summary
          id="guardrail-trace-heading"
          className="cursor-pointer text-base font-semibold text-gray-900"
        >
          Guardrail trace
        </summary>
        <pre
          data-testid="guardrail-trace-json"
          className="mt-3 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800"
        >
          {JSON.stringify(guardrailTrace, null, 2)}
        </pre>
      </details>
    </section>
  )
}
