import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import DatasetSelector from './DatasetSelector'
import { scenarioService } from '../services/scenarioService.js'

const ConditionalDatasetSelector = ({
  scenario,
  selectedDataset,
  onDatasetSelect,
  validationError
}) => {
  const [shouldShow, setShouldShow] = useState(false)
  const [scenarioDatasets, setScenarioDatasets] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    checkDatasetVisibility()
  }, [scenario])

  const checkDatasetVisibility = async () => {
    if (!scenario) {
      setShouldShow(false)
      setScenarioDatasets([])
      return
    }

    setIsLoading(true)

    try {
      // Check if scenario has datasets
      const shouldShowDatasets = scenarioService.shouldShowDatasetSelector(scenario)
      setShouldShow(shouldShowDatasets)

      if (shouldShowDatasets) {
        // Load scenario datasets
        const datasets = await scenarioService.getDatasets(scenario)
        setScenarioDatasets(datasets)
      } else {
        setScenarioDatasets([])
      }
    } catch (error) {
      console.error('Error checking dataset visibility:', error)
      setShouldShow(false)
      setScenarioDatasets([])
    } finally {
      setIsLoading(false)
    }
  }

  // Don't render anything if datasets shouldn't be shown
  if (!shouldShow) {
    return null
  }

  // Show loading state while checking scenario
  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Select Dataset</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          <span className="ml-2 text-sm text-gray-600">Loading scenario datasets...</span>
        </div>
      </div>
    )
  }

  // Render the DatasetSelector component when datasets are available
  return (
    <DatasetSelector
      selectedDataset={selectedDataset}
      onDatasetSelect={onDatasetSelect}
      validationError={validationError}
    />
  )
}

ConditionalDatasetSelector.propTypes = {
  scenario: PropTypes.string,
  selectedDataset: PropTypes.shape({
    type: PropTypes.string,
    option: PropTypes.string,
    content: PropTypes.string
  }).isRequired,
  onDatasetSelect: PropTypes.func.isRequired,
  validationError: PropTypes.string
}

ConditionalDatasetSelector.defaultProps = {
  scenario: null,
  validationError: null
}

export default ConditionalDatasetSelector
