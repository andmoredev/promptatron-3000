import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import HelpTooltip from './HelpTooltip';
import { datasetToolIntegrationService } from '../services/datasetToolIntegrationService.js';
import { getToolServiceForDatasetType } from '../utils/toolServiceMapping.js';
import { retryWithBackoff } from '../utils/errorHandling.js';

const DatasetSelector = ({ selectedDataset, onDatasetSelect, validationError }) => {
  const [datasetTypes, setDatasetTypes] = useState([]);
  const [datasetOptions, setDatasetOptions] = useState([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [error, setError] = useState(null);
  const [toolConfigSummary, setToolConfigSummary] = useState(null);
  const [seedDataMode, setSeedDataMode] = useState(false);
  const [isResettingData, setIsResettingData] = useState(false);
  const [datasetManifest, setDatasetManifest] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [operationProgress, setOperationProgress] = useState(null);

  useEffect(() => {
    loadDatasetTypes();
    // Initialize dataset tool integration service
    datasetToolIntegrationService.initialize();
  }, []);

  useEffect(() => {
    // Only load options if we don't already have them and type is set
    // This prevents duplicate loading when handleTypeChange already loaded them
    if (selectedDataset.type && datasetOptions.length === 0) {
      loadDatasetOptions(selectedDataset.type);
    } else if (!selectedDataset.type) {
      setDatasetOptions([]);
    }
  }, [selectedDataset.type, datasetOptions.length]);

  // Auto-load content when dataset is set from history (type and option exist but content is null)
  useEffect(() => {
    if (selectedDataset.type && selectedDataset.option && selectedDataset.content === null) {
      loadDatasetContent(selectedDataset.type, selectedDataset.option);
    }
  }, [selectedDataset.type, selectedDataset.option, selectedDataset.content]);

  // Note: Tool configuration summary loading is now handled explicitly in loadDatasetOptions and handleTypeChange
  // Clear tool config summary when dataset type is cleared
  useEffect(() => {
    if (!selectedDataset.type) {
      setToolConfigSummary(null);
    }
  }, [selectedDataset.type]);

  // Note: Tool configuration loading is now handled in loadDatasetOptions and handleTypeChange
  // to ensure it happens after manifest processing

  const loadDatasetTypes = async () => {
    setIsLoadingTypes(true);
    setError(null);

    try {
      const manifestResponse = await fetch('/datasets/manifest.json');
      if (!manifestResponse.ok) {
        throw new Error(`Failed to load dataset manifest: ${manifestResponse.status}. Please ensure /datasets/manifest.json exists.`);
      }

      const manifest = await manifestResponse.json();
      if (!manifest.types || !Array.isArray(manifest.types)) {
        throw new Error('Invalid manifest format: expected "types" array in /datasets/manifest.json');
      }

      if (manifest.types.length === 0) {
        throw new Error('No dataset types found in manifest.json');
      }

      const sortedTypes = [...manifest.types].sort((a, b) => a.localeCompare(b));
      setDatasetTypes(sortedTypes);
    } catch (err) {
      console.error('Error loading dataset types:', err);
      setError(`Failed to load dataset types: ${err.message}`);
      setDatasetTypes([]);
    } finally {
      setIsLoadingTypes(false);
    }
  };

  const loadDatasetOptions = async (type) => {
    setIsLoadingOptions(true);
    setError(null);

    try {
      // Use the enhanced dataset manifest loading from integration service
      const manifest = await datasetToolIntegrationService.loadDatasetManifest(type);
      setDatasetManifest(manifest);

      // Determine if this is a seed data dataset
      const isSeedDataset = manifest.datasetMode === 'seed';
      setSeedDataMode(isSeedDataset);

      if (isSeedDataset) {
        // Handle seed data mode
        await loadSeedData(type, manifest);
      } else {
        // Handle file-based mode (existing logic)
        if (!manifest.files || !Array.isArray(manifest.files)) {
          throw new Error(`Invalid manifest format: expected "files" array in /datasets/${type}/manifest.json`);
        }

        if (manifest.files.length === 0) {
          throw new Error(`No dataset files found in ${type}/manifest.json`);
        }

        // Filter for supported file types and sort
        const supportedOptions = manifest.files.filter(file =>
          file.endsWith('.json') || file.endsWith('.csv')
        );

        if (supportedOptions.length === 0) {
          throw new Error(`No supported dataset files (.json, .csv) found in ${type}/manifest.json`);
        }

        const sortedOptions = [...supportedOptions].sort((a, b) => a.localeCompare(b));
        setDatasetOptions(sortedOptions);
      }

      // Ensure tool configuration is loaded after manifest processing
      try {
        await datasetToolIntegrationService.reloadToolConfigurationForDataset(type);
        loadToolConfigurationSummary({ type });
      } catch (toolError) {
        console.warn(`Failed to reload tool configuration for ${type}:`, toolError);
        // Still try to load summary with existing configuration
        loadToolConfigurationSummary({ type });
      }
    } catch (err) {
      console.error('Error loading dataset options:', err);
      setError(`Failed to load dataset options: ${err.message}`);
      setDatasetOptions([]);
    } finally {
      setIsLoadingOptions(false);
    }
  };

  const loadToolConfigurationSummary = async (dataset) => {
    try {
      const summary = await datasetToolIntegrationService.getToolConfigurationSummary(dataset);
      setToolConfigSummary(summary);
    } catch (err) {
      console.error('Error loading tool configuration summary:', err);
      setToolConfigSummary({
        hasTools: false,
        toolCount: 0,
        toolNames: [],
        status: 'error',
        message: `Error loading tool configuration: ${err.message}`,
        datasetType: dataset?.type || null
      });
    }
  };

  const showSuccessMessage = (message, duration = 2000) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), duration);
  };

  const showOperationProgress = (message) => {
    setOperationProgress(message);
  };

  const clearOperationProgress = () => {
    setOperationProgress(null);
  };

  const initializeToolServiceWithRetry = async (type) => {
    const toolService = getToolServiceForDatasetType(type);
    if (!toolService || typeof toolService.initialize !== 'function') {
      return { success: false, message: `No tool service available for ${type}`, service: null };
    }

    try {
      const result = await retryWithBackoff(
        async () => {
          // Get the tool configuration for this dataset type
          console.log(`Getting tool configuration for ${type}...`);
          let toolConfig = null;
          try {
            const toolConfigResult = await datasetToolIntegrationService.getToolConfigurationForDataset({ type });
            console.log(`Tool config result for ${type}:`, { hasToolConfig: toolConfigResult.hasToolConfig, fallbackMode: toolConfigResult.fallbackMode });
            if (toolConfigResult.hasToolConfig) {
              toolConfig = toolConfigResult.toolConfig;
              console.log(`Tool config loaded for ${type}, tools count:`, toolConfig?.tools?.length || 0);
            } else {
              console.log(`No tool config available for ${type}:`, toolConfigResult.message);
            }
          } catch (configError) {
            console.warn(`Failed to get tool configuration for ${type}:`, configError);
            throw new Error(`Tool configuration loading failed: ${configError.message}`);
          }

          // Initialize the tool service with the configuration
          if (toolConfig) {
            console.log(`Initializing ${type} tool service with config...`);
            await toolService.initialize(toolConfig);
            console.log(`${type} tool service initialized successfully`);
          } else {
            throw new Error(`No tool configuration available for ${type}`);
          }

          return { success: true, message: `Tool service initialized for ${type}`, service: toolService };
        },
        {
          maxRetries: 2,
          baseDelay: 1000,
          onRetry: (error, attempt, delay) => {
            console.log(`Retrying tool service initialization for ${type} (attempt ${attempt}, delay: ${delay}ms):`, error.message);
            // Don't show error messages during retry attempts - only log to console
          }
        }
      );
      return result;
    } catch (error) {
      return {
        success: false,
        message: `Tool service initialization failed after retries: ${error.message}`,
        service: null,
        originalError: error
      };
    }
  };

  const handleTypeChange = async (type) => {
    // First, clear the current selection
    onDatasetSelect({
      type: type,
      option: '',
      content: null
    });

    // Reset seed data mode state
    setSeedDataMode(false);
    setDatasetManifest(null);

    // If a type is selected, load its options and auto-select the first one
    if (type) {
      setIsLoadingOptions(true);
      setError(null);

      try {
        // Use the enhanced dataset manifest loading from integration service
        const manifest = await datasetToolIntegrationService.loadDatasetManifest(type);
        setDatasetManifest(manifest);

        // Determine if this is a seed data dataset
        const isSeedDataset = manifest.datasetMode === 'seed';
        setSeedDataMode(isSeedDataset);

        if (isSeedDataset) {
          // Handle seed data mode
          await loadSeedData(type, manifest);
        } else {
          // Handle file-based mode (existing logic)
          if (!manifest.files || !Array.isArray(manifest.files)) {
            throw new Error(`Invalid manifest format: expected "files" array in /datasets/${type}/manifest.json`);
          }

          if (manifest.files.length === 0) {
            throw new Error(`No dataset files found in ${type}/manifest.json`);
          }

          // Filter for supported file types and sort
          const supportedOptions = manifest.files.filter(file =>
            file.endsWith('.json') || file.endsWith('.csv')
          );

          if (supportedOptions.length === 0) {
            throw new Error(`No supported dataset files (.json, .csv) found in ${type}/manifest.json`);
          }

          const sortedOptions = [...supportedOptions].sort((a, b) => a.localeCompare(b));
          setDatasetOptions(sortedOptions);

          // Auto-select the first option and load its content
          const firstOption = sortedOptions[0];
          await loadDatasetContent(type, firstOption);
        }

        // Ensure tool configuration is loaded after manifest processing
        try {
          await datasetToolIntegrationService.reloadToolConfigurationForDataset(type);
          loadToolConfigurationSummary({ type });
        } catch (toolError) {
          console.warn(`Failed to reload tool configuration for ${type}:`, toolError);
          // Still try to load summary with existing configuration
          loadToolConfigurationSummary({ type });
        }

      } catch (err) {
        console.error('Error loading dataset options:', err);
        setError(`Failed to load dataset options: ${err.message}`);
        setDatasetOptions([]);
      } finally {
        setIsLoadingOptions(false);
      }
    }
  };

  const loadDatasetContent = async (type, option) => {
    if (!type || !option) return null;

    try {
      // Load actual dataset content from file
      const response = await fetch(`/datasets/${type}/${option}`);
      if (!response.ok) {
        throw new Error(`Failed to load dataset file: ${response.status}`);
      }

      let content;
      if (option.endsWith('.json')) {
        // Parse JSON files and validate format
        const jsonData = await response.json();
        if (typeof jsonData !== 'object') {
          throw new Error('Invalid JSON format: expected object or array');
        }
        content = JSON.stringify(jsonData, null, 2);
      } else if (option.endsWith('.csv')) {
        // Load CSV files as text
        content = await response.text();
        if (!content.trim()) {
          throw new Error('CSV file is empty');
        }
      } else {
        throw new Error('Unsupported file format');
      }

      // Update the dataset with loaded content
      onDatasetSelect({
        type: type,
        option: option,
        content: content
      });

      return content;
    } catch (err) {
      console.error('Error loading dataset content:', err);
      setError(`Failed to load dataset content: ${err.message}`);
      return null;
    }
  };

  const loadSeedData = async (type, manifest, retryCount = 0) => {
    const maxRetries = 2;

    try {
      setIsLoadingOptions(true);
      setError(null);
      clearOperationProgress();

      if (retryCount === 0) {
        showOperationProgress('Loading...');
      }

      // Initialize the tool service to load seed data with enhanced error handling and retry
      let toolServiceInitialized = false;
      let toolServiceError = null;

      if (retryCount === 0) {
        showOperationProgress('Initializing...');
      }

      const initResult = await initializeToolServiceWithRetry(type);
      if (initResult.success) {
        toolServiceInitialized = true;
        console.log(`Tool service successfully initialized for ${type}`);
        // Clear any error messages from retry attempts
        setError(null);
        if (retryCount === 0) {
          showOperationProgress('Loading data...');
        }
      } else {
        toolServiceError = initResult.message;
        console.warn(`Tool service initialization failed after all retries for ${type}:`, initResult.originalError || initResult.message);

        if (retryCount === 0) {
          showOperationProgress('Loading data...');
        }

        // Only show warning if this is the initial load and all retries are exhausted
        if (retryCount === 0) {
          setError(`Warning: Tool service initialization failed after retries. Seed data will be loaded without tool capabilities.`);
          setTimeout(() => setError(null), 5000); // Clear warning after 5 seconds
        }
      }

      // Validate seed data configuration
      if (!manifest.seedDataConfig || !manifest.seedDataConfig.dataFile) {
        throw new Error('Seed data configuration is missing or invalid. Please check the dataset manifest.');
      }

      // Load the seed data file for display with enhanced error handling
      const seedDataUrl = `/datasets/${type}/${manifest.seedDataConfig.dataFile}`;
      console.log(`Loading seed data from: ${seedDataUrl}`);

      if (retryCount === 0) {
        showOperationProgress('Loading data...');
      }

      const seedDataResponse = await fetch(seedDataUrl);
      if (!seedDataResponse.ok) {
        if (seedDataResponse.status === 404) {
          throw new Error(`Seed data file not found: ${manifest.seedDataConfig.dataFile}. Please ensure the file exists in the dataset directory.`);
        } else {
          throw new Error(`Failed to load seed data file: ${seedDataResponse.status} ${seedDataResponse.statusText}`);
        }
      }

      let seedData;
      try {
        seedData = await seedDataResponse.json();
      } catch (parseError) {
        throw new Error(`Invalid seed data format: The file contains invalid JSON. Please check the file format.`);
      }

      if (!seedData || typeof seedData !== 'object') {
        throw new Error('Invalid seed data format: Expected JSON object or array.');
      }

      // Format seed data as JSON string for consistent display
      const content = JSON.stringify(seedData, null, 2);

      // Update the dataset with loaded seed data
      onDatasetSelect({
        type: type,
        option: manifest.seedDataConfig.dataFile,
        content: content
      });

      // Clear progress and show success message
      clearOperationProgress();

      console.log(`Seed data loading completed for ${type}:`, {
        success: true,
        toolServiceInitialized,
        dataSize: content.length
      });

      return content;
    } catch (err) {
      console.error('Error loading seed data:', err);
      clearOperationProgress();

      // Implement retry logic for network-related errors
      if (retryCount < maxRetries && (
        err.message.includes('Failed to load seed data file') ||
        err.message.includes('network') ||
        err.message.includes('fetch')
      )) {
        console.log(`Retrying seed data load for ${type} (attempt ${retryCount + 1}/${maxRetries})`);
        setError(`Loading seed data... (attempt ${retryCount + 1}/${maxRetries})`);

        // Wait before retry with exponential backoff
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));

        return loadSeedData(type, manifest, retryCount + 1);
      }

      // Provide specific error messages based on error type
      let userFriendlyMessage = `Failed to load seed data: ${err.message}`;

      if (err.message.includes('not found')) {
        userFriendlyMessage = `Seed data file not found. Please ensure ${manifest.seedDataConfig?.dataFile || 'the seed data file'} exists in the ${type} dataset directory.`;
      } else if (err.message.includes('invalid JSON')) {
        userFriendlyMessage = `Seed data file contains invalid JSON format. Please check the file syntax.`;
      } else if (err.message.includes('configuration is missing')) {
        userFriendlyMessage = `Dataset configuration error: Seed data is not properly configured for this dataset type.`;
      } else if (err.message.includes('network') || err.message.includes('fetch')) {
        userFriendlyMessage = `Network error loading seed data. Please check your connection and try again.`;
      }

      setError(userFriendlyMessage);

      // Provide fallback behavior - set empty dataset to allow user to continue
      onDatasetSelect({
        type: type,
        option: manifest.seedDataConfig?.dataFile || 'seed-data.json',
        content: JSON.stringify({ error: 'Failed to load seed data', message: err.message }, null, 2)
      });

      return null;
    } finally {
      setIsLoadingOptions(false);
      clearOperationProgress();
    }
  };

  const handleResetData = async (retryCount = 0) => {
    const maxRetries = 2;
    const originalContent = selectedDataset.content; // Store current state for fallback

    try {
      setIsResettingData(true);
      setError(null);
      setSuccessMessage(null);
      clearOperationProgress();

      if (retryCount === 0) {
        showOperationProgress('Resetting...');
      }

      // Validate that we have the necessary information
      if (!selectedDataset.type) {
        throw new Error('No dataset type selected for reset operation');
      }

      if (!datasetManifest || !datasetManifest.seedDataConfig) {
        throw new Error('Dataset manifest or seed data configuration is missing');
      }

      // Get tool service with enhanced validation
      const toolService = getToolServiceForDatasetType(selectedDataset.type);
      if (!toolService) {
        throw new Error(`No tool service available for dataset type: ${selectedDataset.type}. Reset functionality requires a tool service.`);
      }

      if (typeof toolService.resetDemoData !== 'function') {
        throw new Error(`Reset functionality is not implemented for dataset type: ${selectedDataset.type}. The tool service does not support data reset.`);
      }

      // Attempt to reset data with retry logic
      try {
        console.log(`Attempting to reset data for ${selectedDataset.type} (attempt ${retryCount + 1}/${maxRetries + 1})`);

        if (retryCount === 0) {
          showOperationProgress('Resetting...');
        } else {
          showOperationProgress(`Retrying...`);
        }

        await retryWithBackoff(
          async () => {
            await toolService.resetDemoData();
          },
          {
            maxRetries: 1, // We handle outer retry logic ourselves
            baseDelay: 1000,
            onRetry: (error, attempt, delay) => {
              console.log(`Retrying reset operation (attempt ${attempt}, delay: ${delay}ms)`);
              showOperationProgress('Retrying...');
            }
          }
        );

        console.log(`Data reset successful for ${selectedDataset.type}`);
        showOperationProgress('Reloading...');
      } catch (resetError) {
        // Check if this is a retryable error
        const isRetryable = resetError.message.includes('network') ||
          resetError.message.includes('timeout') ||
          resetError.message.includes('connection') ||
          resetError.message.includes('service unavailable');

        if (isRetryable && retryCount < maxRetries) {
          console.log(`Reset operation failed, retrying... (attempt ${retryCount + 1}/${maxRetries})`);
          setError(`Reset operation failed, retrying... (attempt ${retryCount + 1}/${maxRetries})`);

          // Wait before retry with exponential backoff
          const delay = Math.pow(2, retryCount) * 1500;
          await new Promise(resolve => setTimeout(resolve, delay));

          return handleResetData(retryCount + 1);
        }

        // Not retryable or max retries reached
        throw new Error(`Reset operation failed: ${resetError.message}`);
      }

      // Reload the seed data for display
      try {
        console.log(`Reloading seed data after reset for ${selectedDataset.type}`);
        await loadSeedData(selectedDataset.type, datasetManifest);
      } catch (reloadError) {
        console.warn('Failed to reload seed data after reset:', reloadError);
        // Don't fail the entire operation if reload fails
        setError(`Data was reset successfully, but failed to reload display: ${reloadError.message}. Please refresh the page.`);
        setTimeout(() => setError(null), 8000);
        return;
      }

      // Clear progress and show success feedback
      clearOperationProgress();
      showSuccessMessage(`Data reset complete`, 2000);

    } catch (err) {
      console.error('Error resetting data:', err);
      clearOperationProgress();

      // Provide specific error messages based on error type
      let userFriendlyMessage = `Failed to reset data: ${err.message}`;

      if (err.message.includes('No tool service available')) {
        userFriendlyMessage = `Reset functionality is not available for this dataset type. The ${selectedDataset.type} dataset does not have an associated tool service.`;
      } else if (err.message.includes('not implemented')) {
        userFriendlyMessage = `Reset functionality is not supported for this dataset type. Please contact support if you need this feature.`;
      } else if (err.message.includes('network') || err.message.includes('connection')) {
        userFriendlyMessage = `Network error during reset operation. Please check your connection and try again.`;
      } else if (err.message.includes('timeout')) {
        userFriendlyMessage = `Reset operation timed out. Please try again or contact support if the issue persists.`;
      } else if (err.message.includes('service unavailable')) {
        userFriendlyMessage = `The reset service is temporarily unavailable. Please try again in a few minutes.`;
      }

      setError(userFriendlyMessage);

      // Maintain current state when reset fails - don't change the dataset content
      console.log('Maintaining current dataset state due to reset failure');

      // Offer retry option for certain error types
      if (err.message.includes('network') || err.message.includes('timeout') || err.message.includes('service unavailable')) {
        setTimeout(() => {
          if (retryCount < maxRetries) {
            setError(`${userFriendlyMessage} Click the reset button to try again.`);
          }
        }, 3000);
      }

    } finally {
      setIsResettingData(false);
      clearOperationProgress();
    }
  };

  const handleOptionChange = async (option) => {
    const newDataset = {
      type: selectedDataset.type,
      option: option,
      content: null
    };

    if (option) {
      await loadDatasetContent(selectedDataset.type, option);
    } else {
      onDatasetSelect(newDataset);
    }
  };

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

      {successMessage && (
        <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded">
          <div className="flex items-center space-x-2">
            <div className="h-1.5 w-1.5 bg-green-500 rounded-full"></div>
            <p className="text-xs text-green-700">{successMessage}</p>
          </div>
        </div>
      )}

      {operationProgress && (
        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600"></div>
            <p className="text-xs text-blue-700">{operationProgress}</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Dataset Type Selection */}
        <div>
          <label htmlFor="dataset-type" className="block text-sm font-medium text-gray-700 mb-2">
            <div className="flex items-center space-x-2">
              <span>Dataset Type</span>
              {seedDataMode && (
                <button
                  onClick={handleResetData}
                  disabled={isResettingData || isLoadingOptions}
                  className="inline-flex items-center justify-center h-5 w-5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ml-1"
                  title="Reset seed data to original state"
                >
                  {isResettingData ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-600"></div>
                  ) : (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                </button>
              )}
              {isLoadingTypes && (
                <span className="ml-2 text-xs text-blue-600">Loading types...</span>
              )}
            </div>
          </label>
          <select
            id="dataset-type"
            value={selectedDataset.type}
            onChange={(e) => handleTypeChange(e.target.value)}
            className={`select-field ${validationError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
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

        {/* Dataset Option Selection or Reset Button */}
        {selectedDataset.type && (
          <div>
            {seedDataMode ? (
              // Seed data mode - just show loading indicator if needed
              isLoadingOptions ? (
                <div className="mt-2 flex items-center text-sm text-blue-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Loading seed data...
                </div>
              ) : null
            ) : (
              // File-based mode - show file picker
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
                  className={`select-field ${validationError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
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
  );
};

DatasetSelector.propTypes = {
  selectedDataset: PropTypes.shape({
    type: PropTypes.string,
    option: PropTypes.string,
    content: PropTypes.string
  }).isRequired,
  onDatasetSelect: PropTypes.func.isRequired,
  validationError: PropTypes.string
};

export default DatasetSelector;
