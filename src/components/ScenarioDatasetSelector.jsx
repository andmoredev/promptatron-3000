import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import HelpTooltip from './HelpTooltip';
import { scenarioService } from '../services/scenarioService.js';

const ScenarioDatasetSelector = ({ selectedScenario, selectedDataset, onDatasetSelect, validationError }) => {
  const [datasets, setDatasets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (selectedScenario) {
      loadDatasets();
    } else {
      setDatasets([]);
      setError(null);
    }
  }, [selectedScenario]);

  // Auto-load content when dataset is selected from history (has id but no content)
  useEffect(() => {
    if (selectedScenario && selectedDataset.id && selectedDataset.content === null) {
      loadDatasetContent(selectedDataset.id);
    }
  }, [selectedScenario, selectedDataset.id, selectedDataset.content]);

  const loadDatasets = async () => {
    if (!selectedScenario) return;

    setIsLoading(true);
    setError(null);

    try {
      // Ensure scenario service is initialized
      if (!scenarioService.isInitialized) {
        await scenarioService.initialize();
      }

      // Get datasets from the scenario
      const scenarioDatasets = await scenarioService.getDatasets(selectedScenario);

      if (!scenarioDatasets || scenarioDatasets.length === 0) {
        setDatasets([]);
        setError('No datasets available for this scenario');
        return;
      }

      setDatasets(scenarioDatasets);
      console.log(`[ScenarioDatasetSelector] Loaded ${scenarioDatasets.length} datasets for scenario: ${selectedScenario}`);

    } catch (err) {
      console.error('Error loading datasets:', err);
      setError(`Failed to load datasets: ${err.message}`);
      setDatasets([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDatasetContent = async (datasetId) => {
    if (!selectedScenario || !datasetId) return;

    try {
      setError(null);

      // Get the dataset content from the scenario service
      const content = await scenarioService.getDatasetContent(selectedScenario, datasetId);

      // Find the dataset info for the selected dataset
      const dataset = datasets.find(d => d.id === datasetId);

      // Update the dataset selection with loaded content
      onDatasetSelect({
        id: datasetId,
        name: dataset?.name || datasetId,
        content: content
      });

      console.log(`[ScenarioDatasetSelector] Loaded content for dataset: ${datasetId}`);

    } catch (err) {
      console.error('Error loading dataset content:', err);
      setError(`Failed to load dataset content: ${err.message}`);

      // Set error content to allow user to see what went wrong
      onDatasetSelect({
        id: datasetId,
        name: datasets.find(d => d.id === datasetId)?.name || datasetId,
        content: `Error loading dataset: ${err.message}`
      });
    }
  };

  const handleDatasetChange = async (datasetId) => {
    if (!datasetId) {
      // Clear selection
      onDatasetSelect({
        id: '',
        name: '',
        content: null
      });
      return;
    }

    // Find the dataset info
    const dataset = datasets.find(d => d.id === datasetId);

    // Set the selection with loading state
    onDatasetSelect({
      id: datasetId,
      name: dataset?.name || datasetId,
      content: null // Will be loaded by loadDatasetContent
    });

    // Load the content
    await loadDatasetContent(datasetId);
  };

  const handleRetry = () => {
    setError(null);
    loadDatasets();
  };

  if (!selectedScenario) {
    return null; // Don't render if no scenario is selected
  }

  return (
    <div className="card">
      <div className="flex items-center space-x-2 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Select Dataset</h3>
        <HelpTooltip
          content="Choose a dataset from the selected scenario. Each scenario includes its own datasets that are relevant to that specific use case."
          position="right"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-800">{error}</p>
            <button
              onClick={handleRetry}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Dataset Selection */}
        <div>
          <label htmlFor="dataset-select" className="block text-sm font-medium text-gray-700 mb-2">
            Available Datasets
            {isLoading && (
              <span className="ml-2 text-xs text-blue-600">Loading datasets...</span>
            )}
          </label>
          <select
            id="dataset-select"
            value={selectedDataset.id || ''}
            onChange={(e) => handleDatasetChange(e.target.value)}
            className={`select-field ${
              validationError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
            }`}
            disabled={isLoading || datasets.length === 0}
          >
            <option value="">
              {isLoading ? 'Loading datasets...' :
               datasets.length === 0 ? 'No datasets available' :
               'Choose a dataset...'}
            </option>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.name}
              </option>
            ))}
          </select>
          {isLoading && (
            <div className="mt-2 flex items-center text-sm text-blue-600">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              Loading scenario datasets...
            </div>
          )}
        </div>

        {/* Dataset Information */}
        {selectedDataset.id && (
          <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              {selectedDataset.name}
            </h4>
            {(() => {
              const dataset = datasets.find(d => d.id === selectedDataset.id);
              return dataset?.description && (
                <p className="text-xs text-gray-600 mb-2">
                  {dataset.description}
                </p>
              );
            })()}
            <div className="flex items-center space-x-4 text-xs text-gray-500">
              <span>Dataset ID: {selectedDataset.id}</span>
              {selectedDataset.content && (
                <span>
                  Size: {(selectedDataset.content.length / 1024).toFixed(1)}KB
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Validation Error */}
      {validationError && (
        <p className="mt-1 text-sm text-red-600">{validationError}</p>
      )}
    </div>
  );
};

ScenarioDatasetSelector.propTypes = {
  selectedScenario: PropTypes.string,
  selectedDataset: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    content: PropTypes.string
  }).isRequired,
  onDatasetSelect: PropTypes.func.isRequired,
  validationError: PropTypes.string
};

ScenarioDatasetSelector.defaultProps = {
  selectedScenario: null,
  validationError: null
};

export default ScenarioDatasetSelector;
