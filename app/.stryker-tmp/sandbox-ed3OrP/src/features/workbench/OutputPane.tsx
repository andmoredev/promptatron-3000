/**
 * The streamed model output: a status badge, the text as it arrives (pinned to
 * the bottom while it grows), and a collapsible reasoning pane.
 *
 * Auto-scroll only re-pins when the reader is already near the bottom, so
 * scrolling up to re-read something mid-stream is not fought by the next token.
 */
// @ts-nocheck


import { useEffect, useRef } from 'react'
import { selectIsRunning, useRunStore, type RunPhase } from '../../stores'

const STATUS_LABELS: Record<RunPhase, string> = {
  idle: 'Idle',
  starting: 'Starting',
  streaming: 'Streaming',
  completed: 'Completed',
  error: 'Error',
  cancelled: 'Cancelled'
}

const STATUS_CLASSES: Record<RunPhase, string> = {
  idle: 'bg-gray-100 text-gray-700',
  starting: 'bg-amber-100 text-amber-800',
  streaming: 'bg-blue-100 text-blue-800',
  completed: 'bg-primary-100 text-primary-800',
  error: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-200 text-gray-700'
}

/** Within this many pixels of the bottom counts as "following the stream". */
const PIN_THRESHOLD_PX = 48

export default function OutputPane() {
  const status = useRunStore((state) => state.status)
  const streamedText = useRunStore((state) => state.streamedText)
  const reasoningText = useRunStore((state) => state.reasoningText)
  const error = useRunStore((state) => state.error)
  const isRunning = useRunStore(selectIsRunning)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pinnedRef = useRef(true)

  useEffect(() => {
    const node = scrollRef.current
    if (!node || !pinnedRef.current) return
    node.scrollTop = node.scrollHeight
  }, [streamedText])

  function handleScroll() {
    const node = scrollRef.current
    if (!node) return
    pinnedRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight <= PIN_THRESHOLD_PX
  }

  return (
    <section className="card" aria-labelledby="output-pane-heading">
      <div className="flex items-center justify-between mb-3">
        <h2 id="output-pane-heading" className="text-base font-semibold text-gray-900">
          Output
        </h2>
        <span
          data-testid="run-status-badge"
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[status]}`}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200" role="alert">
          <p className="text-xs font-mono text-red-700">{error.code}</p>
          <p className="text-sm text-red-800">{error.message}</p>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="output-text"
        className="h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-sm text-gray-800"
      >
        {streamedText === '' ? (
          <span className="text-gray-400">
            {isRunning ? 'Waiting for the first token…' : 'Run a prompt to see output here.'}
          </span>
        ) : (
          streamedText
        )}
      </div>

      {reasoningText !== '' && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-gray-700">
            Reasoning ({reasoningText.length} chars)
          </summary>
          <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs text-gray-600">
            {reasoningText}
          </div>
        </details>
      )}
    </section>
  )
}
