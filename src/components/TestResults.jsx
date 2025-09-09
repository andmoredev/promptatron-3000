import React, { useState } from 'react'

const TestResults = ({ results, isLoading }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  if (isLoading) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Results</h3>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-600">Running test...</p>
            <p className="text-sm text-gray-500 mt-1">This may take a few moments</p>
          </div>
        </div>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Results</h3>
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-600">No test results yet</p>
          <p className="text-sm text-gray-500 mt-1">Configure your test and click "Run Test" to see results</p>
        </div>
      </div>
    )
  }

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString()
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Test Results</h3>
        <div className="flex space-x-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {/* Test Metadata */}
      <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="font-medium text-gray-700">Model:</span>
            <span className="ml-2 text-gray-600">{results.modelId}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Timestamp:</span>
            <span className="ml-2 text-gray-600">{formatTimestamp(results.timestamp)}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Dataset:</span>
            <span className="ml-2 text-gray-600">{results.datasetType}/{results.datasetOption}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Test ID:</span>
            <span className="ml-2 text-gray-600 font-mono">{results.id}</span>
          </div>
        </div>
      </div>

      {/* Prompt Display */}
      <div className="mb-4">
        <h4 className="font-medium text-gray-700 mb-2">Prompt Used:</h4>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <pre className="text-sm text-blue-800 whitespace-pre-wrap font-mono">
            {results.prompt}
          </pre>
        </div>
      </div>

      {/* Response Display */}
      <div>
        <h4 className="font-medium text-gray-700 mb-2">Model Response:</h4>
        <div className={`bg-white border border-gray-200 rounded-lg p-4 ${
          isExpanded ? 'max-h-none' : 'max-h-64 overflow-y-auto'
        }`}>
          <div className="prose prose-sm max-w-none">
            <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
              {results.response}
            </div>
          </div>
        </div>
      </div>

      {/* Response Stats */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="flex justify-between items-center text-sm text-gray-500">
          <span>Response length: {results.response.length} characters</span>
          <span>Word count: ~{results.response.split(/\s+/).length} words</span>
        </div>
      </div>
    </div>
  )
}

export default TestResults