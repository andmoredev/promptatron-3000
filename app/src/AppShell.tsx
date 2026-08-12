/**
 * The application shell: a sticky header (title, mascot, tab bar) over one
 * page per tab.
 *
 * Tab state is deliberately plain `useState` — there is no router, and the
 * active tab is not worth persisting: every tab rebuilds itself from its store
 * on mount, so a reload landing on the Workbench is the right default.
 */

import { useState } from 'react'
import RobotMascot from './components/RobotMascot'
import AboutPage from './features/about/AboutPage'
import EvalsPage from './features/evals/EvalsPage'
import GuardrailsPage from './features/guardrails/GuardrailsPage'
import HistoryPage from './features/history/HistoryPage'
import ScenariosPage from './features/scenarios/ScenariosPage'
import WorkbenchPage from './features/workbench/WorkbenchPage'

export type TabId = 'workbench' | 'evals' | 'history' | 'guardrails' | 'scenarios' | 'about'

interface TabDef {
  id: TabId
  label: string
}

export const TABS: TabDef[] = [
  { id: 'workbench', label: 'Workbench' },
  { id: 'evals', label: 'Evals' },
  { id: 'history', label: 'History' },
  { id: 'guardrails', label: 'Guardrails' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'about', label: 'About' }
]

function TabPage({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'workbench':
      return <WorkbenchPage />
    case 'evals':
      return <EvalsPage />
    case 'history':
      return <HistoryPage />
    case 'guardrails':
      return <GuardrailsPage />
    case 'scenarios':
      return <ScenariosPage />
    case 'about':
      return <AboutPage />
  }
}

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('workbench')

  return (
    <div className="min-h-screen bg-gradient-to-br from-tertiary-50 to-secondary-100">
      <header className="sticky top-0 z-40 border-b border-secondary-200 bg-gradient-to-br from-tertiary-50 to-secondary-100 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <RobotMascot size="md" />
              <div className="text-center sm:text-left">
                <h1 className="text-xl md:text-2xl font-bold text-primary-700 leading-tight">
                  Promptatron 3000
                </h1>
                <p className="text-xs md:text-sm text-secondary-700">
                  Building enterprise-grade AI agents before it was cool
                </p>
              </div>
            </div>

            <nav
              role="tablist"
              aria-label="Sections"
              className="flex flex-wrap justify-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm"
            >
              {TABS.map((tab) => {
                const selected = tab.id === activeTab
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`tab-${tab.id}`}
                    aria-selected={selected}
                    aria-controls={`tabpanel-${tab.id}`}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                      selected
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </nav>
          </div>
        </div>
      </header>

      <main
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="container mx-auto px-4 sm:px-6 lg:px-8 py-6"
      >
        <TabPage tab={activeTab} />
      </main>
    </div>
  )
}
