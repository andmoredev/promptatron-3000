import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import HelpTooltip from './HelpTooltip'

const DatasetSelector = ({ selectedDataset, onDatasetSelect, validationError }) => {
  const [datasetTypes, setDatasetTypes] = useState([])
  const [datasetOptions, setDatasetOptions] = useState([])
  const [isLoadingTypes, setIsLoadingTypes] = useState(false)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [error, setError] = useState(null)

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

  // Auto-load content when dataset is set from history (type and option exist but content is null)
  useEffect(() => {
    if (selectedDataset.type && selectedDataset.option && selectedDataset.content === null) {
      loadDatasetContent(selectedDataset.type, selectedDataset.option)
    }
  }, [selectedDataset.type, selectedDataset.option, selectedDataset.content])

  const loadDatasetTypes = async () => {
    setIsLoadingTypes(true)
    setError(null)

    try {
      const manifestResponse = await fetch('/datasets/manifest.json')
      if (!manifestResponse.ok) {
        throw new Error(`Failed to load dataset manifest: ${manifestResponse.status}. Please ensure /datasets/manifest.json exists.`)
      }

      const manifest = await manifestResponse.json()
      if (!manifest.types || !Array.isArray(manifest.types)) {
        throw new Error('Invalid manifest format: expected "types" array in /datasets/manifest.json')
      }

      if (manifest.types.length === 0) {
        throw new Error('No dataset types found in manifest.json')
      }

      const sortedTypes = [...manifest.types].sort((a, b) => a.localeCompare(b))
      setDatasetTypes(sortedTypes)
    } catch (err) {
      console.error('Error loading dataset types:', err)
      setError(`Failed to load dataset types: ${err.message}`)
      setDatasetTypes([])
    } finally {
      setIsLoadingTypes(false)
    }
  }

  const loadDatasetOptions = async (type) => {
    setIsLoadingOptions(true)
    setError(null)

    try {
      const manifestResponse = await fetch(`/datasets/${type}/manifest.json`)
      if (!manifestResponse.ok) {
        throw new Error(`Failed to load dataset manifest: ${manifestResponse.status}. Please ensure /datasets/${type}/manifest.json exists.`)
      }

      const manifest = await manifestResponse.json()
      if (!manifest.files || !Array.isArray(manifest.files)) {
        throw new Error(`Invalid manifest format: expected "files" array in /datasets/${type}/manifest.json`)
      }

      if (manifest.files.length === 0) {
        throw new Error(`No dataset files found in ${type}/manifest.json`)
      }

      // Filter for supported file types and sort
      const supportedOptions = manifest.files.filter(file =>
        file.endsWith('.json') || file.endsWith('.csv')
      )

      if (supportedOptions.length === 0) {
        throw new Error(`No supported dataset files (.json, .csv) found in ${type}/manifest.json`)
      }

      const sortedOptions = [...supportedOptions].sort((a, b) => a.localeCompare(b))
      setDatasetOptions(sortedOptions)
    } catch (err) {
      console.error('Error loading dataset options:', err)
      setError(`Failed to load dataset options: ${err.message}`)
      setDatasetOptions([])
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

  const loadDatasetContent = async (type, option) => {
    if (!type || !option) return null

    try {
      // Load actual dataset content from file
      const response = await fetch(`/datasets/${type}/${option}`)
      if (!response.ok) {
        throw new Error(`Failed to load dataset file: ${response.status}`)
      }

      let content
      if (option.endsWith('.json')) {
        // Parse JSON files and validate format
        const jsonData = await response.json()
        if (typeof jsonData !== 'object') {
          throw new Error('Invalid JSON format: expected object or array')
        }
        content = JSON.stringify(jsonData, null, 2)
      } else if (option.endsWith('.csv')) {
        // Load CSV files as text
        content = await response.text()
        if (!content.trim()) {
          throw new Error('CSV file is empty')
        }
      } else {
        throw new Error('Unsupported file format')
      }

      // Update the dataset with loaded content
      onDatasetSelect({
        type: type,
        option: option,
        content: content
      })

      return content
    } catch (err) {
      console.error('Error loading dataset content:', err)
      setError(`Failed to load dataset content: ${err.message}`)
      return null
    }
  }

  const handleOptionChange = async (option) => {
    const newDataset = {
      type: selectedDataset.type,
      option: option,
      content: null
    }

    if (option) {
      await loadDatasetContent(selectedDataset.type, option)
    } else {
      onDatasetSelect(newDataset)
    }
  }

  return (
    <div className="card">
      <div className="flex items-center space-x-2 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Select Dataset</h3>
        <HelpTooltip
          content="Choose a dataset type (use case) and specific dataset file. Datasets are organized by use case in the public/datasets/ folder. You can add your own CSV files to test with custom data."
          position="right"
        />
      </div>

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
            {isLoadingTypes && (
              <span className="ml-2 text-xs text-blue-600">Loading types...</span>
            )}
          </label>
          <select
            id="dataset-type"
            value={selectedDataset.type}
            onChange={(e) => handleTypeChange(e.target.value)}
            className={`select-field ${
              validationError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
            }`}
            disabled={isLoadingTypes}
          >
            <option value="">
              {isLoadingTypes ? 'Loading dataset types...' : 'Choose a dataset type...'}
            </option>
            {datasetTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </option>
            ))}
          </select>
          {isLoadingTypes && (
            <div className="mt-2 flex items-center text-sm text-blue-600">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              Scanning datasets directory...
            </div>
          )}
        </div>

        {/* Dataset Option Selection */}
        {selectedDataset.type && (
          <div>
            <label htmlFor="dataset-option" className="block text-sm font-medium text-gray-700 mb-2">
              Dataset File
              {isLoadingOptions && (
                <span className="ml-2 text-xs text-blue-600">Loading files...</span>
              )}
            </label>
            <select
              id="dataset-option"
              value={selectedDataset.option}
              onChange={(e) => handleOptionChange(e.target.value)}
              className={`select-field ${
                validationError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
              }`}
              disabled={isLoadingOptions}
            >
              <option value="">
                {isLoadingOptions ? 'Loading dataset files...' : 'Choose a dataset file...'}
              </option>
              {datasetOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {isLoadingOptions && (
              <div className="mt-2 flex items-center text-sm text-blue-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                Scanning {selectedDataset.type} directory...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Validation Error */}
      {validationError && (
        <p className="mt-1 text-sm text-red-600">{validationError}</p>
      )}

      {/* Dataset Preview */}
      {selectedDataset.type && selectedDataset.option && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">
            <span className="font-medium">Selected:</span> {selectedDataset.type}/{selectedDataset.option}
          </p>
          {selectedDataset.content && (
            <div className="mt-2">
              <p className="text-xs text-green-700 font-medium">Preview:</p>
              <div className="text-xs text-green-700 mt-1 font-mono bg-green-100 p-2 rounded overflow-hidden">
                <pre className="whitespace-pre-wrap break-words overflow-hidden text-xs">
                  {selectedDataset.content.substring(0, 200)}...
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

DatasetSelector.propTypes = {
  selectedDataset: PropTypes.shape({
    type: PropTypes.string,
    option: PropTypes.string,
    content: PropTypes.string
  }).isRequired,
  onDatasetSelect: PropTypes.func.isRequired,
  validationError: PropTypes.string
}

export default DatasetSelector