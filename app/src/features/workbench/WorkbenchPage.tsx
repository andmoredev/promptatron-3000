/**
 * The Workbench tab: configure a run on the left, watch it on the right.
 *
 * The two columns are independent subscribers to the stores — nothing is
 * threaded through here as props — so a token arriving mid-stream re-renders
 * only `OutputPane`, not the form the user may be editing at the time.
 */

import GuardrailTraceView from './GuardrailTraceView'
import MetricsBar from './MetricsBar'
import ModelPanel from './ModelPanel'
import OutputPane from './OutputPane'
import PromptPanel from './PromptPanel'
import RunControls from './RunControls'
import ScenarioPanel from './ScenarioPanel'
import ToolTimeline from './ToolTimeline'

export default function WorkbenchPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6" data-testid="workbench-page">
      <div className="lg:col-span-1 space-y-4">
        <ModelPanel />
        <ScenarioPanel />
        <PromptPanel />
        <RunControls />
      </div>
      <div className="lg:col-span-2 space-y-4">
        <MetricsBar />
        <OutputPane />
        <GuardrailTraceView />
        <ToolTimeline />
      </div>
    </div>
  )
}
