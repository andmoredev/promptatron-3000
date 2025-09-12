import { useState, useRef } from 'react'
import { useHistory } from '../hooks/useHistory.js'

const History = ({ onLoadFromHistory, onCompareTests, selectedForComparison = [] }) => {
  const {
    history,
    loading,
    error,
    clearHistory,
    exportHistory,
    importHistory,
    getHistoryStats
  } = useHistory()

  const [selectedItem, setSelectedItem] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterModel, setFilterModel] = useState('')
  const [filterToolUsage, setFilterToolUsage] = useState('')
  const [showStats, setShowStats] = useState(false)
  const [showManagement, setShowManagement] = useState(false)
  const [rerunDialog, setRerunDialog] = useState(null)
  const [comparisonMode, setComparisonMode] = useState(false)
  const [determinismModal, setDeterminismModal] = useState(null)
  const fileInputRef = useRef(null)

  // Get unique models for filtering
  const uniqueModels = [...new Set(history.map(item => item.modelId))].sort()

  // Filter history based on search, model filter, and tool usage filter
  const filteredHistory = history.filter(item => {
    const matchesSearch = !searchTerm ||
      item.systemPrompt?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.userPrompt?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.prompt?.toLowerCase().includes(searchTerm.toLowerCase()) || // Legacy prompt field for backward compatibility
      item.datasetType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.datasetOption?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.response?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      // Include tool usage in search
      (item.toolUsage?.toolCalls?.some(call =>
        call.toolName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        JSON.stringify(call.input)?.toLowerCase().includes(searchTerm.toLowerCase())
      ))

    const matchesModel = !filterModel || item.modelId === filterModel

    const matchesToolUsage = !filterToolUsage ||
      (filterToolUsage === 'used' && item.toolUsage?.hasToolUsage) ||
      (filterToolUsage === 'not-used' && !item.toolUsage?.hasToolUsage)

    return matchesSearch && matchesModel && matchesToolUsage
  })

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString()
  }

  const truncateText = (text, maxLength = 100) => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
  }

  const handleLoadTest = (item) => {
    onLoadFromHistory(item)
  }

  const handleRerunTest = (item) => {
    setRerunDialog(item)
  }

  const handleConfirmRerun = (modifiedItem) => {
    onLoadFromHistory(modifiedItem)
    setRerunDialog(null)
  }

  const handleCancelRerun = () => {
    setRerunDialog(null)
  }

  const handleToggleComparison = (item) => {
    if (selectedForComparison.find(test => test.id === item.id)) {
      // Remove from comparison
      onCompareTests(selectedForComparison.filter(test => test.id !== item.id))
    } else {
      // Add to comparison (limit to 4 tests)
      if (selectedForComparison.length < 4) {
        onCompareTests([...selectedForComparison, item])
      }
    }
  }

  const isSelectedForComparison = (item) => {
    return selectedForComparison.find(test => test.id === item.id) !== undefined
  }

  const handleClearComparison = () => {
    onCompareTests([])
    setComparisonMode(false)
  }

  const handleViewDetails = (item) => {
    setSelectedItem(selectedItem?.id === item.id ? null : item)
  }

  const handleClearHistory = async () => {
    if (window.confirm('Are you sure you want to clear all test history? This action cannot be undone.')) {
      await clearHistory()
    }
  }

  const handleExportHistory = async () => {
    await exportHistory()
  }

  const handleImportHistory = async (event) => {
    const file = event.target.files[0]
    if (file) {
      try {
        const importedCount = await importHistory(file)
        alert(`Successfully imported ${importedCount} records.`)
      } catch (err) {
        alert(`Failed to import history: ${err.message}`)
      }
      // Reset file input
      event.target.value = ''
    }
  }

  const handleDeterminismGradeClick = (item) => {
    if (item.determinismGrade) {
      setDeterminismModal({
        testItem: item,
        grade: item.determinismGrade
      })
    }
  }

  const stats = getHistoryStats()

  if (loading) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test History</h3>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading history...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test History</h3>
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 text-red-400 mb-4">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-red-600 mb-2">Error loading history</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Test History</h3>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Import History
          </button>
        </div>
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-600">No test history yet</p>
          <p className="text-sm text-gray-500 mt-1">Run some tests to see your history here</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImportHistory}
          className="hidden"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Management Options */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Test History</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setComparisonMode(!comparisonMode)}
              className={`text-sm font-medium ${
                comparisonMode
                  ? 'text-blue-600 hover:text-blue-700'
                  : 'text-gray-600 hover:text-gray-700'
              }`}
            >
              {comparisonMode ? 'Exit Compare' : 'Compare Tests'}
            </button>
            {selectedForComparison.length > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {selectedForComparison.length} selected
              </span>
            )}
            <button
              onClick={() => setShowStats(!showStats)}
              className="text-sm text-gray-600 hover:text-gray-700 font-medium"
            >
              {showStats ? 'Hide Stats' : 'Show Stats'}
            </button>
            <button
              onClick={() => setShowManagement(!showManagement)}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Manage
            </button>
          </div>
        </div>

        {/* Statistics */}
        {showStats && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-3">Statistics</h4>
            <div className="space-y-4">
              {/* General Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Total Tests:</span>
                  <span className="ml-2 font-medium">{stats.totalTests}</span>
                </div>
                <div>
                  <span className="text-gray-600">Unique Models:</span>
                  <span className="ml-2 font-medium">{stats.uniqueModels}</span>
                </div>
                <div>
                  <span className="text-gray-600">Unique Datasets:</span>
                  <span className="ml-2 font-medium">{stats.uniqueDatasets}</span>
                </div>
                {stats.dateRange && (
                  <div>
                    <span className="text-gray-600">Date Range:</span>
                    <span className="ml-2 font-medium text-xs">
                      {stats.dateRange.earliest.toLocaleDateString()} - {stats.dateRange.latest.toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Tool Usage Stats */}
              {stats.toolUsageStats && (
                <div className="border-t border-gray-200 pt-3">
                  <h5 className="font-medium text-gray-800 mb-2">Tool Usage Statistics</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Tests with Tools:</span>
                      <span className="ml-2 font-medium text-orange-600">{stats.toolUsageStats.testsWithTools}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Tests without Tools:</span>
                      <span className="ml-2 font-medium">{stats.toolUsageStats.testsWithoutTools}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Total Tool Calls:</span>
                      <span className="ml-2 font-medium text-orange-600">{stats.toolUsageStats.totalToolCalls}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Unique Tools:</span>
                      <span className="ml-2 font-medium">{stats.toolUsageStats.uniqueTools}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Management Options */}
        {showManagement && (
          <div className="mb-4 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-3">History Management</h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleExportHistory}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              >
                Export History
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Import History
              </button>
              <button
                onClick={handleClearHistory}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                Clear All History
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <input
              id="search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search prompts, datasets, responses, or tool usage..."
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="model-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Model
            </label>
            <select
              id="model-filter"
              value={filterModel}
              onChange={(e) => setFilterModel(e.target.value)}
              className="select-field"
            >
              <option value="">All models</option>
              {uniqueModels.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tool-usage-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Tool Usage
            </label>
            <select
              id="tool-usage-filter"
              value={filterToolUsage}
              onChange={(e) => setFilterToolUsage(e.target.value)}
              className="select-field"
            >
              <option value="">All tests</option>
              <option value="used">Used tools</option>
              <option value="not-used">No tools used</option>
            </select>
          </div>
        </div>

        <div className="text-sm text-gray-600">
          Showing {filteredHistory.length} of {history.length} tests
        </div>

        {/* Comparison Mode Notification */}
        {comparisonMode && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h4 className="font-medium text-blue-900">Comparison Mode Active</h4>
                  {/* Progress indicator */}
                  <div className="flex space-x-1">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`w-2 h-2 rounded-full ${
                          selectedForComparison.length >= step
                            ? 'bg-blue-500'
                            : 'bg-blue-200'
                        }`}
                        title={`Test ${step}${selectedForComparison.length >= step ? ' selected' : ''}`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-blue-700 mb-2">
                  {selectedForComparison.length === 0 && "Select up to 4 tests to compare."}
                  {selectedForComparison.length === 1 && "Select 1 more test to start comparison."}
                  {selectedForComparison.length >= 2 && selectedForComparison.length < 4 &&
                    `${selectedForComparison.length} tests selected. You can select ${4 - selectedForComparison.length} more or start comparison now.`
                  }
                  {selectedForComparison.length === 4 && "Maximum 4 tests selected. Ready to compare!"}
                  {selectedForComparison.length >= 2 && (
                    <span className="block text-xs text-blue-600 mt-1">
                      💡 Tip: Press Ctrl+C to quickly navigate to comparison
                    </span>
                  )}
                </p>

                {/* Selected tests preview */}
                {selectedForComparison.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedForComparison.map((test, index) => (
                      <span
                        key={test.id}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {String.fromCharCode(65 + index)}: {test.modelId?.split('.')[0] || 'Unknown'}
                        <button
                          onClick={() => handleToggleComparison(test)}
                          className="ml-1 text-blue-600 hover:text-blue-800"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2 ml-4">
                {selectedForComparison.length >= 2 && (
                  <button
                    onClick={() => onCompareTests(selectedForComparison, true)} // Pass true to indicate navigation
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Go to Comparison
                  </button>
                )}
                {selectedForComparison.length > 0 && (
                  <button
                    onClick={handleClearComparison}
                    className="text-sm text-red-600 hover:text-red-700 font-medium"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* History List */}
      <div className="space-y-4">
        {filteredHistory.map((item) => (
          <div key={item.id} className="card">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {item.modelId?.split('.')[0] || 'Unknown'}
                  </span>
                  {item.determinismGrade && (
                    <DeterminismGradeBadge
                      grade={item.determinismGrade}
                      onClick={() => handleDeterminismGradeClick(item)}
                    />
                  )}
                  {/* Streaming indicator */}
                  {item.isStreamed && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      ⚡ Streamed
                    </span>
                  )}
                  {/* Tool usage indicator */}
                  {item.toolUsage?.hasToolUsage && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                      🔧 Used {item.toolUsage.toolCallCount} tool{item.toolUsage.toolCallCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="text-sm text-gray-500">
                    {formatTimestamp(item.timestamp)}
                  </span>
                  {item.id && (
                    <span className="text-xs text-gray-400 font-mono">
                      ID: {item.id.slice(-8)}
                    </span>
                  )}
                </div>

                <div className="mb-2">
                  {item.datasetType && item.datasetOption && (
                    <p className="text-sm font-medium text-gray-900 mb-1">
                      Dataset: {item.datasetType}/{item.datasetOption}
                    </p>
                  )}
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Prompts:</span>
                    <div className="mt-1 space-y-1">
                      {item.systemPrompt && (
                        <div className="flex items-start">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 mr-2 flex-shrink-0">
                            System
                          </span>
                          <span className="text-gray-700">{truncateText(item.systemPrompt, 60)}</span>
                        </div>
                      )}
                      {(item.userPrompt || item.prompt) && (
                        <div className="flex items-start">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mr-2 flex-shrink-0">
                            User
                          </span>
                          <span className="text-gray-700">{truncateText(item.userPrompt || item.prompt, 60)}</span>
                        </div>
                      )}
                      {!item.systemPrompt && !item.userPrompt && !item.prompt && (
                        <span className="text-gray-500 italic">No prompts available</span>
                      )}
                    </div>
                  </div>
                </div>

                {selectedItem?.id === item.id && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-medium text-gray-700">Full Prompts:</h5>
                        {!item.systemPrompt && item.prompt && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Legacy Format
                          </span>
                        )}
                      </div>

                      {/* System Prompt */}
                      {item.systemPrompt && (
                        <div className="mb-3">
                          <div className="flex items-center mb-2">
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 mr-2">
                              System Prompt
                            </span>
                            <span className="text-xs text-gray-500">
                              {item.systemPrompt.length} characters
                            </span>
                          </div>
                          <div className="bg-purple-50 border border-purple-200 rounded p-3">
                            <pre className="text-sm text-purple-800 whitespace-pre-wrap">
                              {item.systemPrompt}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* User Prompt */}
                      {(item.userPrompt || item.prompt) && (
                        <div className="mb-3">
                          <div className="flex items-center mb-2">
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                              User Prompt
                            </span>
                            <span className="text-xs text-gray-500">
                              {(item.userPrompt || item.prompt).length} characters
                            </span>
                            {!item.userPrompt && item.prompt && (
                              <span className="ml-2 text-xs text-gray-400">(from legacy format)</span>
                            )}
                          </div>
                          <div className="bg-blue-50 border border-blue-200 rounded p-3">
                            <pre className="text-sm text-blue-800 whitespace-pre-wrap">
                              {item.userPrompt || item.prompt}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* No prompts available */}
                      {!item.systemPrompt && !item.userPrompt && !item.prompt && (
                        <div className="text-center py-4 text-gray-500 italic">
                          No prompts available for this test
                        </div>
                      )}
                    </div>

                    <div>
                      <h5 className="font-medium text-gray-700 mb-1">Model Details:</h5>
                      <div className="bg-gray-50 border border-gray-200 rounded p-3 mb-3">
                        <div className="text-sm text-gray-800 space-y-1">
                          <p><span className="font-medium">Model ID:</span> {item.modelId}</p>
                          {item.datasetType && (
                            <p><span className="font-medium">Dataset:</span> {item.datasetType}/{item.datasetOption}</p>
                          )}
                          <p><span className="font-medium">Timestamp:</span> {formatTimestamp(item.timestamp)}</p>

                          {/* Streaming Information */}
                          <div className="pt-2 border-t border-gray-300">
                            <p><span className="font-medium">Response Mode:</span> {item.isStreamed ? 'Streaming' : 'Standard'}</p>

                            {/* Streaming Metrics */}
                            {item.isStreamed && item.streamingMetrics && (
                              <div className="mt-2 space-y-1">
                                <p className="font-medium text-gray-700">Streaming Performance:</p>
                                {item.streamingMetrics.totalTokens && (
                                  <p className="text-xs"><span className="font-medium">Total Tokens:</span> {item.streamingMetrics.totalTokens}</p>
                                )}
                                {item.streamingMetrics.streamDuration && (
                                  <p className="text-xs"><span className="font-medium">Duration:</span> {(item.streamingMetrics.streamDuration / 1000).toFixed(1)}s</p>
                                )}
                                {item.streamingMetrics.averageTokensPerSecond && (
                                  <p className="text-xs"><span className="font-medium">Speed:</span> {item.streamingMetrics.averageTokensPerSecond.toFixed(1)} tokens/sec</p>
                                )}
                                {item.streamingMetrics.firstTokenLatency && (
                                  <p className="text-xs"><span className="font-medium">First Token:</span> {item.streamingMetrics.firstTokenLatency}ms</p>
                                )}
                              </div>
                            )}

                            {/* Token Usage */}
                            {item.usage && (
                              <div className="mt-2 space-y-1">
                                <p className="font-medium text-gray-700">Token Usage:</p>
                                <p className="text-xs"><span className="font-medium">Input:</span> {item.usage.input_tokens || item.usage.inputTokens || 'N/A'}</p>
                                <p className="text-xs"><span className="font-medium">Output:</span> {item.usage.output_tokens || item.usage.outputTokens || 'N/A'}</p>
                                <p className="text-xs"><span className="font-medium">Total:</span> {item.usage.total_tokens || item.usage.totalTokens || 'N/A'}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h5 className="font-medium text-gray-700 mb-1">Response:</h5>
                      <div className="bg-gray-50 border border-gray-200 rounded p-3 max-h-64 overflow-y-auto">
                        <div className="text-sm text-gray-800 whitespace-pre-wrap">
                          {item.response || 'No response available'}
                        </div>
                      </div>
                    </div>

                    {/* Tool Usage Section */}
                    <div>
                      <h5 className="font-medium text-gray-700 mb-1">Tool Usage:</h5>
                      <div className="bg-orange-50 border border-orange-200 rounded p-3">
                        {item.toolUsage?.hasToolUsage ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-orange-800">
                                {item.toolUsage.toolCallCount} tool call{item.toolUsage.toolCallCount !== 1 ? 's' : ''} attempted
                              </span>
                              {item.toolUsage.availableTools && (
                                <span className="text-xs text-orange-600">
                                  Available: {item.toolUsage.availableTools.join(', ')}
                                </span>
                              )}
                            </div>
                            {item.toolUsage.toolCalls?.map((toolCall, index) => (
                              <div key={index} className="border border-orange-300 rounded p-2 bg-white">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-orange-900">{toolCall.toolName}</span>
                                  <span className="text-xs text-orange-600">
                                    {toolCall.attempted ? 'Attempted' : 'Called'}
                                  </span>
                                </div>
                                {toolCall.input && (
                                  <div className="text-xs text-gray-700">
                                    <div className="font-medium mb-1">Parameters:</div>
                                    <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                                      {JSON.stringify(toolCall.input, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {toolCall.timestamp && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    {new Date(toolCall.timestamp).toLocaleTimeString()}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-600 italic">
                            No tools were used in this test
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col space-y-2 ml-4">
                <button
                  onClick={() => handleViewDetails(item)}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  {selectedItem?.id === item.id ? 'Hide Details' : 'View Details'}
                </button>

                {comparisonMode ? (
                  <button
                    onClick={() => handleToggleComparison(item)}
                    className={`text-sm font-medium ${
                      isSelectedForComparison(item)
                        ? 'text-blue-600 hover:text-blue-700'
                        : 'text-gray-600 hover:text-gray-700'
                    }`}
                    disabled={!isSelectedForComparison(item) && selectedForComparison.length >= 4}
                  >
                    {isSelectedForComparison(item) ? '✓ Selected' :
                     selectedForComparison.length >= 4 ? 'Max Reached' : 'Select'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleLoadTest(item)}
                      className="text-sm text-green-600 hover:text-green-700 font-medium"
                    >
                      Quick Load
                    </button>
                    <button
                      onClick={() => handleRerunTest(item)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Rerun Test
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredHistory.length === 0 && history.length > 0 && (
        <div className="card text-center py-8">
          <p className="text-gray-600">No tests match your current filters</p>
          <button
            onClick={() => {
              setSearchTerm('')
              setFilterModel('')
              setFilterToolUsage('')
            }}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium mt-2"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportHistory}
        className="hidden"
      />

      {/* Determinism Grade Modal */}
      {determinismModal && (
        <DeterminismGradeModal
          testItem={determinismModal.testItem}
          grade={determinismModal.grade}
          onClose={() => setDeterminismModal(null)}
        />
      )}

      {/* Floating Comparison Button */}
      {selectedForComparison.length >= 2 && (
        <div className="fixed bottom-6 right-16 sm:right-20 z-50">
          <button
            onClick={() => onCompareTests(selectedForComparison, true)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 sm:p-4 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 00-2 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="font-medium hidden sm:inline">Compare {selectedForComparison.length} Tests</span>
            <span className="font-medium sm:hidden">{selectedForComparison.length}</span>
          </button>
        </div>
      )}

      {/* Rerun Dialog */}
      {rerunDialog && (
        <RerunDialog
          testItem={rerunDialog}
          onConfirm={handleConfirmRerun}
          onCancel={handleCancelRerun}
        />
      )}
    </div>
  )
}

// Rerun Dialog Component
const RerunDialog = ({ testItem, onConfirm, onCancel }) => {
  const [modifiedItem, setModifiedItem] = useState({
    modelId: testItem.modelId || '',
    systemPrompt: testItem.systemPrompt || '',
    userPrompt: testItem.userPrompt || testItem.prompt || '', // Handle legacy prompt field
    datasetType: testItem.datasetType || '',
    datasetOption: testItem.datasetOption || ''
  })
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleConfirm = () => {
    onConfirm(modifiedItem)
  }

  const handleSystemPromptChange = (e) => {
    setModifiedItem(prev => ({
      ...prev,
      systemPrompt: e.target.value
    }))
  }

  const handleUserPromptChange = (e) => {
    setModifiedItem(prev => ({
      ...prev,
      userPrompt: e.target.value
    }))
  }

  const isModified = () => {
    return (
      modifiedItem.modelId !== testItem.modelId ||
      modifiedItem.systemPrompt !== (testItem.systemPrompt || '') ||
      modifiedItem.userPrompt !== (testItem.userPrompt || testItem.prompt || '') ||
      modifiedItem.datasetType !== testItem.datasetType ||
      modifiedItem.datasetOption !== testItem.datasetOption
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Rerun Test Configuration
            </h3>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {/* Original Test Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Original Test</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p><span className="font-medium">Model:</span> {testItem.modelId}</p>
                <p><span className="font-medium">Dataset:</span> {testItem.datasetType}/{testItem.datasetOption}</p>
                <p><span className="font-medium">Date:</span> {new Date(testItem.timestamp).toLocaleString()}</p>
              </div>
            </div>

            {/* Modification Options */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">Rerun Options</h4>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
                </button>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => setModifiedItem({
                    modelId: testItem.modelId || '',
                    systemPrompt: testItem.systemPrompt || '',
                    userPrompt: testItem.userPrompt || testItem.prompt || '',
                    datasetType: testItem.datasetType || '',
                    datasetOption: testItem.datasetOption || ''
                  })}
                  className="p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="font-medium text-gray-900">Exact Rerun</div>
                  <div className="text-sm text-gray-600">Use identical configuration</div>
                </button>
                <button
                  onClick={() => setModifiedItem({
                    modelId: testItem.modelId || '',
                    systemPrompt: testItem.systemPrompt || '',
                    userPrompt: testItem.userPrompt || testItem.prompt || '',
                    datasetType: testItem.datasetType || '',
                    datasetOption: testItem.datasetOption || ''
                  })}
                  className="p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="font-medium text-gray-900">Modify & Rerun</div>
                  <div className="text-sm text-gray-600">Edit before running</div>
                </button>
              </div>

              {/* Advanced Modification */}
              {showAdvanced && (
                <div className="space-y-4 border-t pt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Model ID
                    </label>
                    <input
                      type="text"
                      value={modifiedItem.modelId}
                      onChange={(e) => setModifiedItem(prev => ({ ...prev, modelId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Enter model ID"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Dataset Type
                    </label>
                    <input
                      type="text"
                      value={modifiedItem.datasetType}
                      onChange={(e) => setModifiedItem(prev => ({ ...prev, datasetType: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Enter dataset type"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Dataset Option
                    </label>
                    <input
                      type="text"
                      value={modifiedItem.datasetOption}
                      onChange={(e) => setModifiedItem(prev => ({ ...prev, datasetOption: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Enter dataset option"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      System Prompt
                    </label>
                    <textarea
                      value={modifiedItem.systemPrompt}
                      onChange={handleSystemPromptChange}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Enter system prompt"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      User Prompt
                    </label>
                    <textarea
                      value={modifiedItem.userPrompt}
                      onChange={handleUserPromptChange}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Enter your prompt"
                    />
                  </div>
                </div>
              )}

              {/* Modification Status */}
              {isModified() && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-yellow-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span className="text-sm text-yellow-800">
                      Configuration has been modified from the original test
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              {isModified() ? 'Load Modified Configuration' : 'Load Original Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Determinism Grade Modal Component
const DeterminismGradeModal = ({ testItem, grade, onClose }) => {
  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString()
  }

  const getGradeDescription = (gradeValue) => {
    switch (gradeValue) {
      case 'A': return 'Highly Deterministic (>90% consistency)'
      case 'B': return 'Good Determinism (70-90% consistency)'
      case 'C': return 'Moderate Determinism (50-70% consistency)'
      case 'D': return 'Low Determinism (30-50% consistency)'
      case 'F': return 'Non-deterministic (<30% consistency)'
      default: return 'Unknown grade'
    }
  }

  const getGradeColor = (gradeValue) => {
    switch (gradeValue) {
      case 'A': return 'bg-green-50 border-green-200 text-green-800'
      case 'B': return 'bg-blue-50 border-blue-200 text-blue-800'
      case 'C': return 'bg-yellow-50 border-yellow-200 text-yellow-800'
      case 'D': return 'bg-orange-50 border-orange-200 text-orange-800'
      case 'F': return 'bg-red-50 border-red-200 text-red-800'
      default: return 'bg-gray-50 border-gray-200 text-gray-800'
    }
  }

  const formatPercentage = (value) => {
    if (typeof value !== 'number') return 'N/A'
    return `${(value * 100).toFixed(1)}%`
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Determinism Evaluation Details
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Grade Summary */}
          <div className={`p-6 rounded-lg border-2 mb-6 ${getGradeColor(grade.grade)}`}>
            <div className="text-center mb-4">
              <div className="text-4xl font-bold mb-2">Grade: {grade.grade}</div>
              <div className="text-lg opacity-90">
                {getGradeDescription(grade.grade)}
              </div>
            </div>

            {/* Summary Notes */}
            {grade.notes && (
              <div className="text-sm opacity-90 text-center italic">
                "{grade.notes}"
              </div>
            )}
          </div>



          {/* Consistency Metrics */}
          {grade.metrics ? (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Detailed Analysis</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                  <div className="text-sm font-medium text-blue-800 mb-1">Decision Consistency</div>
                  <div className="text-2xl font-bold text-blue-900">
                    {formatPercentage(grade.metrics.decision_consistency_rate)}
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    How often the model made the same decisions
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                  <div className="text-sm font-medium text-green-800 mb-1">Structure Consistency</div>
                  <div className="text-2xl font-bold text-green-900">
                    {formatPercentage(grade.metrics.structure_consistency_rate)}
                  </div>
                  <div className="text-xs text-green-700 mt-1">
                    How consistent the response format was
                  </div>
                </div>

                <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg">
                  <div className="text-sm font-medium text-purple-800 mb-1">Semantic Equivalence</div>
                  <div className="text-2xl font-bold text-purple-900">
                    {formatPercentage(grade.metrics.semantic_equivalence_rate)}
                  </div>
                  <div className="text-xs text-purple-700 mt-1">
                    How similar the meaning was across responses
                  </div>
                </div>

                <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
                  <div className="text-sm font-medium text-orange-800 mb-1">Exact Text Match</div>
                  <div className="text-2xl font-bold text-orange-900">
                    {formatPercentage(grade.metrics.exact_text_rate)}
                  </div>
                  <div className="text-xs text-orange-700 mt-1">
                    How often responses were identical
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-center">
                <div className="text-sm text-gray-600">Analyzed Responses</div>
                <div className="text-xl font-bold text-gray-900">{grade.metrics.n_runs}</div>
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Analysis Summary</h4>
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <div className="text-sm text-blue-800">
                  <p className="mb-2"><strong>Grade:</strong> {grade.grade}</p>
                  {grade.reasoning && <p><strong>Analysis:</strong> {grade.reasoning}</p>}
                </div>
              </div>
              {grade.variance && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-center">
                    <div className="text-sm text-gray-600">Responses</div>
                    <div className="text-lg font-bold text-gray-900">{grade.variance.responseCount}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-center">
                    <div className="text-sm text-gray-600">Unique</div>
                    <div className="text-lg font-bold text-gray-900">{grade.variance.uniqueResponses}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-center">
                    <div className="text-sm text-gray-600">Avg Length</div>
                    <div className="text-lg font-bold text-gray-900">{grade.variance.averageLength}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tool Usage Consistency Section */}
          {grade.metrics && grade.metrics.tool_consistency_rate !== undefined && (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Tool Usage Consistency</span>
              </h4>

              {/* Tool Usage Score from Grader */}
              <div className="bg-gradient-to-r from-primary-50 to-secondary-50 border border-primary-200 p-4 rounded-lg mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-primary-800">Tool Usage Consistency</div>
                  <div className="text-2xl font-bold text-primary-900">
                    {formatPercentage(grade.metrics.tool_consistency_rate)}
                  </div>
                </div>
                <div className="text-xs text-primary-700">
                  Evaluated by grader LLM as part of overall determinism assessment
                </div>
                <div className="w-full bg-primary-200 rounded-full h-2 mt-2">
                  <div
                    className="h-2 bg-primary-600 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, grade.metrics.tool_consistency_rate * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          )}



          {/* Notable Variations */}
          {grade.notable_variations && grade.notable_variations.length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Notable Variations</h4>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <ul className="text-sm text-yellow-800 space-y-1">
                  {grade.notable_variations.map((variation, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-yellow-600 mr-2">•</span>
                      {variation}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Evaluation Summary */}
          {grade.timestamp && (
            <div className="mb-6 border-t border-gray-200 pt-4">
              <div className="text-sm text-gray-600 text-center">
                <span className="font-medium">Evaluation completed:</span> {formatTimestamp(grade.timestamp)}
              </div>
            </div>
          )}

          {/* Additional Information */}
          {grade.fallbackAnalysis && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h5 className="text-sm font-medium text-yellow-800">Statistical Analysis</h5>
                  <p className="text-sm text-yellow-700 mt-1">
                    This evaluation was performed using statistical analysis because the grader LLM was unavailable.
                    The results are based on response uniqueness and length variance patterns.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Determinism Grade Badge Component
const DeterminismGradeBadge = ({ grade, onClick }) => {
  if (!grade) return null

  const getGradeColor = (gradeValue) => {
    switch (gradeValue) {
      case 'A': return 'bg-primary-100 text-primary-800 border-primary-200'
      case 'B': return 'bg-secondary-100 text-secondary-800 border-secondary-200'
      case 'C': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'D': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'F': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getGradeTitle = (gradeValue) => {
    const baseTitle = `Determinism Grade: ${gradeValue}`
    switch (gradeValue) {
      case 'A': return `${baseTitle} - Highly deterministic`
      case 'B': return `${baseTitle} - Good determinism`
      case 'C': return `${baseTitle} - Moderate determinism`
      case 'D': return `${baseTitle} - Low determinism`
      case 'F': return `${baseTitle} - Non-deterministic`
      default: return baseTitle
    }
  }

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${getGradeColor(grade.grade)}`}
      title={getGradeTitle(grade.grade)}
    >
      <span className="mr-1">🎯</span>
      <span className="font-bold">{grade.grade}</span>
      {grade.fallbackAnalysis && (
        <span className="ml-1" title="Statistical analysis (grader LLM unavailable)">*</span>
      )}
    </button>
  )
}

export default History
