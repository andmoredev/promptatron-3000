import React, { useState, useEffect } from 'react'

const DatasetSelector = ({ selectedDataset, onDatasetSelect }) => {
  const [datasetTypes, setDatasetTypes] = useState([])
  const [datasetOptions, setDatasetOptions] = useState([])
  const [isLoadingTypes, setIsLoadingTypes] = useState(false)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [error, setError] = useState(null)

  // Placeholder dataset structure - will be replaced with actual file system scanning
  const placeholderDatasets = {
    'enterprise-fraud': ['international.csv', 'mixed.csv', 'retail.csv'],
    'customer-support': ['tickets.json', 'responses.json'],
    'content-analysis': ['articles.json', 'reviews.json']
  }

  useEffect(() => {
    loadDatasetTypes()
  }, [])

  useEffect(() => {
    if (selectedDataset.type) {
      loadDatasetOptions(selectedDataset.type)
    } else {
      setDatasetOptions([])
    }
  }, [selectedDataset.type])

  const loadDatasetTypes = async () => {
    setIsLoadingTypes(true)
    setError(null)

    try {
      // TODO: Replace with actual directory scanning in later tasks
      await new Promise(resolve => setTimeout(resolve, 300))
      setDatasetTypes(Object.keys(placeholderDatasets))
    } catch (err) {
      setError('Failed to load dataset types')
      setDatasetTypes(Object.keys(placeholderDatasets))
    } finally {
      setIsLoadingTypes(false)
    }
  }

  const loadDatasetOptions = async (type) => {
    setIsLoadingOptions(true)
    setError(null)

    try {
      // TODO: Replace with actual file scanning in later tasks
      await new Promise(resolve => setTimeout(resolve, 200))
      setDatasetOptions(placeholderDatasets[type] || [])
    } catch (err) {
      setError('Failed to load dataset options')
      setDatasetOptions(placeholderDatasets[type] || [])
    } finally {
      setIsLoadingOptions(false)
    }
  }

  const handleTypeChange = (type) => {
    onDatasetSelect({
      type: type,
      option: '',
      content: null
    })
  }

  const handleOptionChange = async (option) => {
    const newDataset = {
      type: selectedDataset.type,
      option: option,
      content: null
    }

    if (option) {
      try {
        // TODO: Replace with actual file loading in later tasks
        newDataset.content = `Sample content for ${selectedDataset.type}/${option}`
      } catch (err) {
        setError('Failed to load dataset content')
      }
    }

    onDatasetSelect(newDataset)
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Dataset</h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        {/* Dataset Type Selection */}
        <div>
          <label htmlFor="dataset-type" className="block text-sm font-medium text-gray-700 mb-2">
            Dataset Type
          </label>
          <select
            id="dataset-type"
            value={selectedDataset.type}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="select-field"
            disabled={isLoadingTypes}
          >
            <option value="">Choose a dataset type...</option>
            {datasetTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </option>
            ))}
          </select>
        </div>

        {/* Dataset Option Selection */}
        {selectedDataset.type && (
          <div>
            <label htmlFor="dataset-option" className="block text-sm font-medium text-gray-700 mb-2">
              Dataset File
            </label>
            <select
              id="dataset-option"
              value={selectedDataset.option}
              onChange={(e) => handleOptionChange(e.target.value)}
              className="select-field"
              disabled={isLoadingOptions}
            >
              <option value="">Choose a dataset file...</option>
              {datasetOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {isLoadingOptions && (
              <p className="text-sm text-gray-500 mt-1">Loading options...</p>
            )}
          </div>
        )}
      </div>

      {/* Dataset Preview */}
      {selectedDataset.type && selectedDataset.option && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">
            <span className="font-medium">Selected:</span> {selectedDataset.type}/{selectedDataset.option}
          </p>
          {selectedDataset.content && (
            <div className="mt-2">
              <p className="text-xs text-green-700 font-medium">Preview:</p>
              <p className="text-xs text-green-700 mt-1 font-mono bg-green-100 p-2 rounded">
                {selectedDataset.content.substring(0, 100)}...
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DatasetSelector