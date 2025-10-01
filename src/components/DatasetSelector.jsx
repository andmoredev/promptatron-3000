import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import HelpTooltip from './HelpTooltip'
import { datasetToolIntegrationService } from '../services/datasetToolIntegrationService.js'

const DatasetSelector = ({ selectedDataset, onDatasetSelect, validationError }) => {
  const [datasetTypes, setDatasetTypes] = useState([])
  const [datasetOptions, setDatasetOptions] = useState([])
  const [isLoadingTypes, setIsLoadingTypes] = useState(false)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [error, setError] = useState(null)
  const [toolConfigSummary, setToolConfigSummary] = useState(null)

  useEffect(() => {
    loadDatasetTypes()
    // Initialize dataset tool integration service
    datasetToolIntegrationService.initialize()
  }, [])

  useEffect(() => {
    // Only load options if we don't already have them and type is set
    // This prevents duplicate loading when handleTypeChange already loaded them
    if (selectedDataset.type && datasetOptions.length === 0) {
      loadDatasetOptions(selectedDataset.type)
    } else if (!selectedDataset.type) {
      setDatasetOptions([])
    }
  }, [selectedDataset.type, datasetOptions.length])

  // Auto-load content when dataset is set from history (type and option exist but content is null)
  useEffect(() => {
    if (selectedDataset.type && selectedDataset.option && selectedDataset.content === null) {
      loadDatasetContent(selectedDataset.type, selectedDataset.option)
    }
  }, [selectedDataset.type, selectedDataset.option, selectedDataset.content])

  // Load tool configuration summary when dataset type changes
  useEffect(() => {
    if (selectedDataset.type) {
      loadToolConfigurationSummary(selectedDataset)
    } else {
      setToolConfigSummary(null)
    }
  }, [selectedDataset.type])

  // Force reload tool configuration when component mounts with existing dataset (handles page refresh)
  useEffect(() => {
    const forceReloadOnMount = async () => {
      if (selectedDataset.type) {
        try {
          await datasetToolIntegrationService.reloadToolConfigurationForDataset(selectedDataset.type)

          // Load the tool configuration summary after reload
          loadToolConfigurationSummary(selectedDataset)
        } catch (error) {
          console.warn(`Failed to reload tool configuration for ${selectedDataset.type}:`, error)
          // Still try to load summary with existing configuration
          loadToolConfigurationSummary(selectedDataset)
        }
      }
    }

    // Only run this on mount, and only if we have a dataset type
    if (selectedDataset.type) {
      forceReloadOnMount()
    }
  }, []) // Empty dependency array - only run on mount

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
      // Use the enhanced dataset manifest loading from integration service
      const manifest = await datasetToolIntegrationService.loadDatasetManifest(type)

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

  const loadToolConfigurationSummary = async (dataset) => {
    try {
      const summary = await datasetToolIntegrationService.getToolConfigurationSummary(dataset)
      setToolConfigSummary(summary)
    } catch (err) {
      console.error('Error loading tool configuration summary:', err)
      setToolConfigSummary({
        hasTools: false,
        toolCount: 0,
        toolNames: [],
        status: 'error',
        message: `Error loading tool configuration: ${err.message}`,
        datasetType: dataset?.type || null
      })
    }
  }

  const handleTypeChange = async (type) => {
    // First, clear the current selection
    onDatasetSelect({
      type: type,
      option: '',
      content: null
    })

    // If a type is selected, load its options and auto-select the first one
    if (type) {
      setIsLoadingOptions(true)
      setError(null)

      try {
        // Use the enhanced dataset manifest loading from integration service
        const manifest = await datasetToolIntegrationService.loadDatasetManifest(type)

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

        // Auto-select the first option and load its content
        const firstOption = sortedOptions[0]
        await loadDatasetContent(type, firstOption)

      } catch (err) {
        console.error('Error loading dataset options:', err)
        setError(`Failed to load dataset options: ${err.message}`)
        setDatasetOptions([])
      } finally {
        setIsLoadingOptions(false)
      }
    }
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
          content="Choose a scenario and specific dataset file. Scenarios are organized in the public/scenarios/ folder with their own datasets. You can add your own scenarios and CSV files to test with custom data."
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

        {/* Tool Configuration Summary */}
        {selectedDataset.type && toolConfigSummary && (
          <div className="mt-4 p-3 rounded-lg border">
            <div className="flex items-center space-x-2 mb-2">
              <h4 className="text-sm font-medium text-gray-700">Tool Configuration</h4>
              <HelpTooltip
                content="Shows whether AI models will have access to tools when analyzing this dataset. Tools allow models to take actions like freezing accounts in fraud detection scenarios."
                position="right"
              />
            </div>

            {toolConfigSummary.hasTools ? (
              <div className="bg-green-50 border border-green-200 rounded p-2">
                <div className="flex items-center space-x-2">
                  <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-green-800 font-medium">
                    {toolConfigSummary.toolCount} tool{toolConfigSummary.toolCount !== 1 ? 's' : ''} available
                  </span>
                </div>
                {toolConfigSummary.toolNames.length > 0 && (
                  <div className="mt-1 text-xs text-green-700">
                    Tools: {toolConfigSummary.toolNames.join(', ')}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded p-2">
                <div className="flex items-center space-x-2">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-gray-600">
                    {toolConfigSummary.message || 'No tools configured for this dataset'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Validation Error */}
      {validationError && (
        <p className="mt-1 text-sm text-red-600">{validationError}</p>
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
