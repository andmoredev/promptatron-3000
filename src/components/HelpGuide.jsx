import React, { useState } from 'react'

/**
 * HelpGuide component provides comprehensive application help
 */
function HelpGuide() {
  const [isOpen, setIsOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('getting-started')

  const sections = {
    'getting-started': {
      title: 'Getting Started',
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Quick Start Guide</h3>
          <ol className="list-decimal list-inside space-y-2 text-gray-600">
            <li>Select a model from the dropdown (e.g., Claude, Nova, Titan)</li>
            <li>Choose a dataset type and specific dataset file</li>
            <li>Write your prompt in the editor</li>
            <li>Click "Run Test" to execute</li>
            <li>View results and save to history</li>
          </ol>
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> Start with simple prompts and gradually increase complexity as you learn how different models respond.
            </p>
          </div>
        </div>
      )
    },
    'models': {
      title: 'Model Selection',
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Understanding Bedrock Models</h3>
          <div className="space-y-3">
            <div className="border-l-4 border-blue-500 pl-4">
              <h4 className="font-medium text-gray-800">Claude Models</h4>
              <p className="text-sm text-gray-600">Excellent for reasoning, analysis, and complex tasks. Good for detailed responses.</p>
            </div>
            <div className="border-l-4 border-green-500 pl-4">
              <h4 className="font-medium text-gray-800">Nova Models</h4>
              <p className="text-sm text-gray-600">Amazon's latest models, optimized for various tasks with good performance.</p>
            </div>
            <div className="border-l-4 border-purple-500 pl-4">
              <h4 className="font-medium text-gray-800">Titan Models</h4>
              <p className="text-sm text-gray-600">Amazon's foundation models, good for general-purpose tasks.</p>
            </div>
          </div>
        </div>
      )
    },
    'datasets': {
      title: 'Working with Datasets',
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Dataset Management</h3>
          <div className="space-y-3">
            <div>
              <h4 className="font-medium text-gray-800">Adding Custom Datasets</h4>
              <ol className="list-decimal list-inside text-sm text-gray-600 mt-2 space-y-1">
                <li>Create a folder in <code className="bg-gray-100 px-1 rounded">public/datasets/</code></li>
                <li>Add CSV files with your data</li>
                <li>Refresh the application to see new datasets</li>
              </ol>
            </div>
            <div>
              <h4 className="font-medium text-gray-800">CSV Format Requirements</h4>
              <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                <li>First row must contain column headers</li>
                <li>Use UTF-8 encoding</li>
                <li>Keep files under 10MB for best performance</li>
                <li>Properly escape commas and quotes</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    'prompts': {
      title: 'Prompt Engineering',
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Writing Effective Prompts</h3>
          <div className="space-y-3">
            <div>
              <h4 className="font-medium text-gray-800">Best Practices</h4>
              <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                <li>Be specific and clear about what you want</li>
                <li>Provide context and examples when helpful</li>
                <li>Use consistent formatting across tests</li>
                <li>Test with different phrasings to find optimal results</li>
              </ul>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-800 mb-2">Example Prompt Structure</h4>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap">
{`You are an expert data analyst. Please analyze the following data:

[Dataset will be inserted here]

Task: Identify patterns and provide insights
Format: Bullet points with key findings
Focus: Look for anomalies and trends`}
              </pre>
            </div>
          </div>
        </div>
      )
    },
    'history': {
      title: 'History & Comparison',
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Managing Test History</h3>
          <div className="space-y-3">
            <div>
              <h4 className="font-medium text-gray-800">History Features</h4>
              <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                <li>All tests are automatically saved</li>
                <li>Search by model, dataset, or prompt content</li>
                <li>Filter by date range or test results</li>
                <li>Rerun previous tests with one click</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-800">Comparison Tool</h4>
              <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                <li>Select multiple tests to compare side-by-side</li>
                <li>Visual highlighting of differences</li>
                <li>Useful for A/B testing different models or prompts</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    'keyboard': {
      title: 'Keyboard Shortcuts',
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Keyboard Shortcuts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                <span className="text-sm text-gray-600">Run Test</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Ctrl+Enter</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                <span className="text-sm text-gray-600">History Tab</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Ctrl+H</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                <span className="text-sm text-gray-600">Test Tab</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Ctrl+T</kbd>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                <span className="text-sm text-gray-600">Comparison</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Ctrl+C</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                <span className="text-sm text-gray-600">Clear/Escape</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Esc</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                <span className="text-sm text-gray-600">Settings</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Ctrl+,</kbd>
              </div>
            </div>
          </div>
        </div>
      )
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors z-40"
        aria-label="Open help guide"
      >
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex">
        {/* Sidebar */}
        <div className="w-64 bg-gray-50 rounded-l-lg p-4 border-r">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Help Guide</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close help guide"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <nav className="space-y-2">
            {Object.entries(sections).map(([key, section]) => (
              <button
                key={key}
                onClick={() => setActiveSection(key)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeSection === key
                    ? 'bg-blue-100 text-blue-800 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {section.title}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {sections[activeSection].content}
        </div>
      </div>
    </div>
  )
}

export default HelpGuide
