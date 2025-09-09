import React, { useState } from 'react'

const History = ({ history, onLoadFromHistory }) => {
  const [selectedItem, setSelectedItem] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterModel, setFilterModel] = useState('')

  // Get unique models for filtering
  const uniqueModels = [...new Set(history.map(item => item.modelId))].sort()

  // Filter history based on search and model filter
  const filteredHistory = history.filter(item => {
    const matchesSearch = !searchTerm ||
      item.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.datasetType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.response.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesModel = !filterModel || item.modelId === filterModel

    return matchesSearch && matchesModel
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

  const handleViewDetails = (item) => {
    setSelectedItem(selectedItem?.id === item.id ? null : item)
  }

  if (history.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test History</h3>
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-600">No test history yet</p>
          <p className="text-sm text-gray-500 mt-1">Run some tests to see your history here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test History</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <input
              id="search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search prompts, datasets, or responses..."
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
        </div>

        <div className="text-sm text-gray-600">
          Showing {filteredHistory.length} of {history.length} tests
        </div>
      </div>

      {/* History List */}
      <div className="space-y-4">
        {filteredHistory.map((item) => (
          <div key={item.id} className="card">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {item.modelId.split('.')[0]}
                  </span>
                  <span className="text-sm text-gray-500">
                    {formatTimestamp(item.timestamp)}
                  </span>
                </div>

                <div className="mb-2">
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    Dataset: {item.datasetType}/{item.datasetOption}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Prompt:</span> {truncateText(item.prompt)}
                  </p>
                </div>

                {selectedItem?.id === item.id && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <h5 className="font-medium text-gray-700 mb-1">Full Prompt:</h5>
                      <div className="bg-blue-50 border border-blue-200 rounded p-3">
                        <pre className="text-sm text-blue-800 whitespace-pre-wrap">
                          {item.prompt}
                        </pre>
                      </div>
                    </div>

                    <div>
                      <h5 className="font-medium text-gray-700 mb-1">Response:</h5>
                      <div className="bg-gray-50 border border-gray-200 rounded p-3 max-h-64 overflow-y-auto">
                        <div className="text-sm text-gray-800 whitespace-pre-wrap">
                          {item.response}
                        </div>
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
                <button
                  onClick={() => handleLoadTest(item)}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  Load Test
                </button>
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
            }}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium mt-2"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )
}

export default History