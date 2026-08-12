/**
 * The tool call timeline.
 *
 * Each row is one `ToolEventEntry` — already merged by `runStore` from
 * `tool_use_start` + `tool_input_delta`* + `tool_result` — so a call that is
 * still streaming its arguments renders the partial JSON and gains its result
 * and duration in place when the result lands.
 */
// @ts-nocheck


import { useRunStore, type ToolEventEntry } from '../../stores'

/**
 * Best-effort pretty print. Tool input arrives as a JSON *fragment* stream, so
 * a mid-flight entry will not parse — show the raw text rather than an error.
 */
function prettyJson(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function ToolRow({ entry }: { entry: ToolEventEntry }) {
  const pending = entry.result === undefined && !entry.error
  const input = entry.input !== undefined ? entry.input : entry.inputJson

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-3" data-testid="tool-event">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono text-sm font-medium text-gray-900">
          {entry.name || 'unnamed tool'}
        </span>
        <span className="flex items-center gap-2">
          {entry.error && (
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-medium">
              error
            </span>
          )}
          {pending && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
              running
            </span>
          )}
          {entry.duration_ms !== undefined && (
            <span className="text-xs text-gray-500">{entry.duration_ms} ms</span>
          )}
        </span>
      </div>

      <div className="text-xs">
        <p className="font-medium text-gray-600 mb-1">Input</p>
        <pre className="overflow-x-auto rounded bg-gray-50 p-2 font-mono text-gray-800">
          {prettyJson(input)}
        </pre>
      </div>

      {entry.result !== undefined && (
        <div className="text-xs mt-2">
          <p className="font-medium text-gray-600 mb-1">Result</p>
          <pre className="max-h-48 overflow-auto rounded bg-gray-50 p-2 font-mono text-gray-800">
            {prettyJson(entry.result)}
          </pre>
        </div>
      )}

      {entry.error && (
        <div className="text-xs mt-2">
          <p className="font-medium text-red-600 mb-1">Error</p>
          <pre className="overflow-x-auto rounded bg-red-50 p-2 font-mono text-red-800">
            {prettyJson(entry.error)}
          </pre>
        </div>
      )}
    </li>
  )
}

export default function ToolTimeline() {
  const toolEvents = useRunStore((state) => state.toolEvents)

  return (
    <section className="card" aria-labelledby="tool-timeline-heading">
      <h2 id="tool-timeline-heading" className="text-base font-semibold text-gray-900 mb-3">
        Tool calls{toolEvents.length > 0 && ` (${toolEvents.length})`}
      </h2>

      {toolEvents.length === 0 ? (
        <p className="text-sm text-gray-500">No tools were called.</p>
      ) : (
        <ul className="space-y-2">
          {toolEvents.map((entry) => (
            <ToolRow key={entry.tool_use_id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  )
}
