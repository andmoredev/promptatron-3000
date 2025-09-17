import { useState, useEffect, useCallback, useMemo } from 'react';
import ModelSelector from './components/ModelSelector';
import DatasetSelector from './components/DatasetSelector';
import PromptEditor from './components/PromptEditor';
import TestResults from './components/TestResults';
import History from './components/History';
import Comparison from './components/Comparison';
import ErrorBoundary from './components/ErrorBoundary';
import BrowserCompatibility from './components/BrowserCompatibility';
import HelpGuide from './components/HelpGuide';
import LoadingSpinner from './components/LoadingSpinner';
import ProgressBar from './components/ProgressBar';
import ThemeProvider from './components/ThemeProvider';
import { RobotGraphicContainer } from './components/RobotGraphic';
import StreamingPerformanceMonitor from './components/StreamingPerformanceMonitor';
import { bedrockService } from './services/bedrockService';
import { datasetToolIntegrationService } from './services/datasetToolIntegrationService';
import { useHistory } from './hooks/useHistory';
import { validateForm } from './utils/formValidation';
import { handleError, retryWithBackoff } from './utils/errorHandling';
import { loadFormState, saveFormState, createDebouncedSave, clearFormState, hasFormState } from './utils/formStateStorage';


function App() {
  // Load saved form state on initialization
  const savedFormState = useMemo(() => loadFormState(), []);

  // Core state management for the test harness (initialized from saved state)
  const [selectedModel, setSelectedModel] = useState(savedFormState.selectedModel);
  const [selectedDataset, setSelectedDataset] = useState(savedFormState.selectedDataset);
  const [systemPrompt, setSystemPrompt] = useState(savedFormState.systemPrompt);
  const [userPrompt, setUserPrompt] = useState(savedFormState.userPrompt);
  const [testResults, setTestResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('test');
  const [validationErrors, setValidationErrors] = useState({});
  const [touchedFields, setTouchedFields] = useState({});
  const [selectedForComparison, setSelectedForComparison] = useState([]);
  const [retryCount, setRetryCount] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [progressValue, setProgressValue] = useState(0);

  // Streaming-related state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingProgress, setStreamingProgress] = useState(null);
  const [isRequestPending, setIsRequestPending] = useState(false);
  const [streamingError, setStreamingError] = useState(null);

  // Tool usage detection during streaming
  const [streamingToolUsage, setStreamingToolUsage] = useState({
    detected: false,
    activeTools: [],
    completedTools: []
  });

  // Debug flags
  const [isRobotDebugEnabled, setIsRobotDebugEnabled] = useState(false);
  const [isStreamingDebugEnabled, setIsStreamingDebugEnabled] = useState(false);



  // Determinism evaluation state (initialized from saved state)
  const [determinismEnabled, setDeterminismEnabled] = useState(savedFormState.determinismEnabled);

  // Streaming preference state (initialized from saved state)
  const [streamingEnabled, setStreamingEnabled] = useState(savedFormState.streamingEnabled);

  // Use the history hook for managing test history
  const { saveTestResult } = useHistory();

  // Helper function to generate user-friendly validation messages
  const getValidationGuidance = (errors) => {
    const guidance = [];

    if (errors.systemPrompt && errors.userPrompt) {
      guidance.push("Both system and user prompts are required. The system prompt defines the AI's role, while the user prompt contains your specific request.");
    } else if (errors.systemPrompt) {
      guidance.push("System prompt is missing. This defines how the AI should behave and what expertise it should use.");
    } else if (errors.userPrompt) {
      guidance.push("User prompt is missing. This should contain your specific question or request about the data.");
    }

    if (errors.model) {
      guidance.push("Please select an AI model to process your request.");
    }

    if (errors.dataset) {
      guidance.push("Please select a dataset to analyze.");
    }

    return guidance;
  };

  // Enhanced form validation function with detailed checking
  const isFormValid = () => {
    const hasValidationErrors = Object.keys(validationErrors).length > 0;
    const hasRequiredFields = selectedModel &&
      userPrompt.trim() &&
      selectedDataset.type &&
      selectedDataset.option &&
      selectedDataset.content;

    return !hasValidationErrors && hasRequiredFields;
  };



  // Clear error and streaming state when user makes changes
  useEffect(() => {
    if (error) {
      setError(null);
    }
  }, [selectedModel, selectedDataset, systemPrompt, userPrompt]);

  // Real-time validation using enhanced validation utility
  useEffect(() => {
    const formData = {
      selectedModel,
      systemPrompt,
      userPrompt,
      selectedDataset
    };

    const validationResult = validateForm(formData);

    // Only show validation errors for fields that have been touched
    const filteredErrors = {};
    Object.keys(validationResult.errors).forEach(field => {
      if (touchedFields[field]) {
        filteredErrors[field] = validationResult.errors[field];
      }
    });

    setValidationErrors(filteredErrors);
  }, [selectedModel, systemPrompt, userPrompt, selectedDataset, touchedFields]);

  // Create debounced save function for form state persistence (silent background saving)
  const debouncedSave = useMemo(() => createDebouncedSave(1500), []);

  // Auto-save form state when key fields change
  useEffect(() => {
    const formState = {
      selectedModel,
      selectedDataset,
      systemPrompt,
      userPrompt,
      determinismEnabled,
      streamingEnabled
    };

    // Only save if we have some meaningful data (avoid saving empty initial state)
    if (selectedModel || systemPrompt || userPrompt || selectedDataset.type) {
      debouncedSave(formState);
    }
  }, [selectedModel, selectedDataset, systemPrompt, userPrompt, determinismEnabled, streamingEnabled, debouncedSave]);

  // Auto-reload dataset content when form is restored from localStorage
  useEffect(() => {
    // Only trigger on initial load if we have a saved dataset selection but no content
    if (savedFormState.selectedDataset.type &&
      savedFormState.selectedDataset.option &&
      !selectedDataset.content &&
      selectedDataset.type === savedFormState.selectedDataset.type &&
      selectedDataset.option === savedFormState.selectedDataset.option) {

      // The DatasetSelector component will handle reloading the content
      // We just need to ensure the selection is properly set
      console.log('Dataset selection restored from localStorage, content will be reloaded by DatasetSelector');
    }
  }, []); // Only run on mount

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl/Cmd + Enter: Run test
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (isFormValid() && !isLoading) {
          handleRunTest();
        }
      }

      // Ctrl/Cmd + H: Switch to History tab
      if ((event.ctrlKey || event.metaKey) && event.key === 'h') {
        event.preventDefault();
        setActiveTab('history');
      }

      // Ctrl/Cmd + T: Switch to Test tab
      if ((event.ctrlKey || event.metaKey) && event.key === 't') {
        event.preventDefault();
        setActiveTab('test');
      }

      // Ctrl/Cmd + C: Switch to Comparison tab (when available)
      if ((event.ctrlKey || event.metaKey) && event.key === 'c' && selectedForComparison.length > 0) {
        event.preventDefault();
        setActiveTab('comparison');
      }

      // Escape: Clear current selection or close modals
      if (event.key === "Escape") {
        if (selectedForComparison.length > 0) {
          setSelectedForComparison([]);
        }
        if (error) {
          setError(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFormValid, isLoading, selectedForComparison.length, error]);

  const validateTestConfiguration = () => {
    const formData = {
      selectedModel,
      systemPrompt,
      userPrompt,
      selectedDataset
    };

    const validationResult = validateForm(formData);

    if (!validationResult.isValid) {
      // Create more specific error messages for dual prompt validation
      const errors = [];

      if (validationResult.errors.model) {
        errors.push(`Model selection: ${validationResult.errors.model}`);
      }

      if (validationResult.errors.systemPrompt) {
        errors.push(`System prompt: ${validationResult.errors.systemPrompt}`);
      }

      if (validationResult.errors.userPrompt) {
        errors.push(`User prompt: ${validationResult.errors.userPrompt}`);
      }

      if (validationResult.errors.dataset) {
        errors.push(`Dataset: ${validationResult.errors.dataset}`);
      }

      return errors;
    }

    return [];
  };

  const handleRunTest = async () => {
    // Comprehensive validation with enhanced error messaging
    const validationErrorsList = validateTestConfiguration();
    if (validationErrorsList.length > 0) {
      const guidance = getValidationGuidance(validationErrors);

      // Create a more user-friendly error message
      let errorMessage = 'Cannot run test due to validation errors:\n\n';
      errorMessage += validationErrorsList.map(error => `• ${error}`).join('\n');

      if (guidance.length > 0) {
        errorMessage += '\n\n💡 Quick Tips:\n';
        errorMessage += guidance.map(tip => `• ${tip}`).join('\n');
      }

      const errorInfo = handleError(
        new Error(errorMessage),
        {
          component: 'App',
          action: 'validateTestConfiguration',
          validationErrors: validationErrors,
          fieldCount: Object.keys(validationErrors).length
        }
      );
      setError(errorInfo.userMessage);
      return;
    }

    setIsLoading(true);
    setError(null);
    setRetryCount(0);
    setProgressStatus('Initializing...');
    setProgressValue(10);

    try {
      console.log("Running test with:", {
        model: selectedModel,
        dataset: selectedDataset,
        systemPrompt: systemPrompt,
        userPrompt: userPrompt
      });

      // Use retry with backoff for the test execution
      const testResult = await retryWithBackoff(
        async () => {
          // Ensure BedrockService is ready
          setProgressStatus('Connecting to AWS Bedrock...');
          setProgressValue(25);

          if (!bedrockService.isReady()) {
            const initResult = await bedrockService.initialize();
            if (!initResult.success) {
              throw new Error(`AWS Bedrock initialization failed: ${initResult.message}`);
            }
          }

          // Get tool configuration for the selected dataset with enhanced error handling
          setProgressStatus('Loading tool configuration...');
          setProgressValue(40);

          let toolConfig = null;
          let toolConfigurationStatus = null;

          try {
            const toolConfigResult = await datasetToolIntegrationService.getToolConfigurationForDataset(selectedDataset);
            toolConfigurationStatus = toolConfigResult;

            if (toolConfigResult.hasToolConfig) {
              toolConfig = toolConfigResult.toolConfig;
              console.log(`Tool configuration loaded for ${selectedDataset.type}:`, {
                toolCount: toolConfig.tools?.length || 0,
                toolNames: toolConfig.tools?.map(t => t.toolSpec.name) || [],
                hasWarnings: toolConfigResult.warnings?.length > 0,
                gracefulDegradation: toolConfigResult.gracefulDegradation
              });

              // Show warnings if any
              if (toolConfigResult.warnings?.length > 0) {
                console.warn('Tool configuration warnings:', toolConfigResult.warnings);
              }
            } else {
              console.log(`No tool configuration for ${selectedDataset.type}: ${toolConfigResult.message}`);

              // Check if this is an error condition or expected behavior
              if (toolConfigResult.errors?.length > 0) {
                console.warn('Tool configuration errors:', toolConfigResult.errors);
              }

              if (toolConfigResult.gracefulDegradation) {
                console.info('Using graceful degradation - analysis will proceed without tools');
              }
            }
          } catch (toolError) {
            console.warn('Failed to load tool configuration, proceeding without tools:', toolError.message);

            // Create a fallback status for error display
            toolConfigurationStatus = {
              hasToolConfig: false,
              fallbackMode: true,
              message: `Tool configuration failed: ${toolError.message}`,
              errors: [toolError.message],
              warnings: [],
              gracefulDegradation: true
            };
          }

          setProgressStatus('Sending request to model...');
          setProgressValue(50);

          let response;
          let streamingMetrics = null;

          if (streamingEnabled) {
            // Use streaming mode
            setIsStreaming(true);
            setStreamingContent('');
            setStreamingError(null);
            setStreamingToolUsage({
              detected: false,
              activeTools: [],
              completedTools: []
            });

            const startTime = Date.now();
            let tokensReceived = 0;
            let firstTokenTime = null;

            response = await bedrockService.invokeModelStream(
              selectedModel,
              systemPrompt,
              userPrompt,
              selectedDataset.content,
              // onToken callback
              (token, fullText, metadata = {}) => {
                if (!firstTokenTime) {
                  firstTokenTime = Date.now();
                }
                tokensReceived++;
                setStreamingContent(prev => prev + token);
                setStreamingProgress({
                  tokensReceived,
                  startTime,
                  firstTokenLatency: firstTokenTime - startTime,
                  duration: Date.now() - startTime
                });

                // Handle tool usage detection during streaming
                if (metadata.toolUsageDetected) {
                  setStreamingToolUsage(prev => {
                    const updated = { ...prev, detected: true };

                    if (metadata.toolUseStarted) {
                      updated.activeTools = [...prev.activeTools, {
                        ...metadata.toolUseStarted,
                        status: 'started',
                        timestamp: new Date().toISOString()
                      }];
                    }

                    if (metadata.toolUseProgress) {
                      updated.activeTools = prev.activeTools.map(tool =>
                        tool.toolUseId === metadata.toolUseProgress.toolUseId
                          ? { ...tool, currentInput: metadata.toolUseProgress.currentInput, status: 'in_progress' }
                          : tool
                      );
                    }

                    if (metadata.toolUseCompleted) {
                      updated.activeTools = prev.activeTools.filter(
                        tool => tool.toolUseId !== metadata.toolUseCompleted.toolUseId
                      );
                      updated.completedTools = [...prev.completedTools, {
                        ...metadata.toolUseCompleted,
                        status: 'completed',
                        timestamp: new Date().toISOString()
                      }];
                    }

                    return updated;
                  });
                }
              },
              // onComplete callback
              (finalResponse) => {
                const endTime = Date.now();
                streamingMetrics = {
                  streamDuration: endTime - startTime,
                  firstTokenLatency: firstTokenTime - startTime,
                  totalTokens: tokensReceived,
                  averageTokensPerSecond: tokensReceived / ((endTime - startTime) / 1000)
                };
                setIsStreaming(false);
              },
              // onError callback
              (error) => {
                setStreamingError(error.message);
                setIsStreaming(false);
              },
              toolConfig // Pass tool configuration to streaming method
            );
          } else {
            // Use standard non-streaming mode
            response = await bedrockService.invokeModel(
              selectedModel,
              systemPrompt,
              userPrompt,
              selectedDataset.content,
              toolConfig // Pass tool configuration to standard method
            );
          }

          setProgressStatus('Processing response...');
          setProgressValue(75);

          return {
            id: Date.now().toString(),
            modelId: selectedModel,
            systemPrompt: systemPrompt,
            userPrompt: userPrompt,
            prompt: userPrompt, // Legacy field for backward compatibility
            datasetType: selectedDataset.type,
            datasetOption: selectedDataset.option,
            response: response.text,
            usage: response.usage,
            isStreamed: streamingEnabled,
            streamingMetrics: streamingMetrics,
            toolUsage: response.toolUsage || null, // Include tool usage data from response
            toolConfigurationStatus: toolConfigurationStatus, // Include tool configuration status
            timestamp: new Date().toISOString()
          };
        },
        {
          maxRetries: 2,
          baseDelay: 1000,
          onRetry: (error, attempt, delay) => {
            console.log(`Retrying test execution (attempt ${attempt}) after ${delay}ms:`, error.message);
            setRetryCount(attempt);
          }
        }
      );

      setProgressStatus('Saving results...');
      setProgressValue(90);

      setTestResults(testResult);
      setRetryCount(0);

      // Save to history using the history service
      await saveTestResult(testResult);

      setProgressStatus('Complete!');
      setProgressValue(100);

      // Reset streaming state
      setIsStreaming(false);
      setStreamingContent('');
      setStreamingProgress(null);
      setStreamingError(null);
      setStreamingToolUsage({
        detected: false,
        activeTools: [],
        completedTools: []
      });

    } catch (err) {
      console.error('Test execution failed:', err);

      // Use enhanced error handling with streaming context
      const errorInfo = handleError(err, {
        component: "App",
        action: "runTest",
        model: selectedModel,
        datasetType: selectedDataset.type,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length
      });

      setError(errorInfo.userMessage);
      setRetryCount(0);
    } finally {
      setIsLoading(false);
      setProgressStatus('');
      setProgressValue(0);

      // Reset streaming state in all cases
      setIsStreaming(false);
      setStreamingContent('');
      setStreamingProgress(null);
      setStreamingError(null);
      setStreamingToolUsage({
        detected: false,
        activeTools: [],
        completedTools: []
      });
    }
  };

  const handleLoadFromHistory = (historyItem) => {
    setSelectedModel(historyItem.modelId);
    setSelectedDataset({
      type: historyItem.datasetType,
      option: historyItem.datasetOption,
      content: null // Will be loaded when dataset selector processes this
    });

    // Load dual prompt format with backward compatibility
    if (
      historyItem.systemPrompt !== undefined ||
      historyItem.userPrompt !== undefined
    ) {
      // New dual prompt format
      setSystemPrompt(historyItem.systemPrompt || '');
      setUserPrompt(historyItem.userPrompt || '');
    } else if (historyItem.prompt) {
      // Legacy single prompt format - treat as user prompt with empty system prompt
      setSystemPrompt('');
      setUserPrompt(historyItem.prompt);
    } else {
      // Fallback for entries with no prompt data
      setSystemPrompt('');
      setUserPrompt('');
    }

    // Mark all fields as touched when loading from history
    setTouchedFields({
      model: true,
      dataset: true,
      systemPrompt: true,
      userPrompt: true
    });

    setActiveTab('test');
  };

  const handleCompareTests = (tests) => {
    setSelectedForComparison(tests);
    if (tests.length > 0) {
      setActiveTab('comparison');
    }
  };

  const handleRemoveFromComparison = (testId) => {
    setSelectedForComparison(prev => prev.filter(test => test.id !== testId));
  };

  const handleClearComparison = () => {
    setSelectedForComparison([]);
  };

  // Mark fields as touched when user interacts with them
  const markFieldAsTouched = (fieldName) => {
    setTouchedFields(prev => ({
      ...prev,
      [fieldName]: true
    }));
  };

  // Enhanced handlers that mark fields as touched
  const handleModelSelect = (modelId) => {
    setSelectedModel(modelId);
    markFieldAsTouched('model');
  };

  const handleDatasetSelect = (dataset) => {
    setSelectedDataset(dataset);
    markFieldAsTouched('dataset');
  };

  const handleSystemPromptChange = (prompt) => {
    setSystemPrompt(prompt);
    markFieldAsTouched('systemPrompt');
  };

  const handleUserPromptChange = (prompt) => {
    setUserPrompt(prompt);
    markFieldAsTouched('userPrompt');
  };

  const handleClearSavedSettings = () => {
    if (confirm('Are you sure you want to clear all saved settings? This will reset the form to default values.')) {
      clearFormState();
      // Reset form to default values
      setSelectedModel('');
      setSelectedDataset({ type: '', option: '', content: null });
      setSystemPrompt('');
      setUserPrompt('');
      setDeterminismEnabled(true);
      setStreamingEnabled(true);
      // Clear touched fields
      setTouchedFields({});
      setValidationErrors({});
    }
  };

  // Theme configuration with null-checking
  const themeConfig = {
    colors: {
      primary: {
        50: "#f0f9f0",
        100: "#e6f3d5",
        500: "#5c8c5a",
        600: "#5c8c5a",
        700: "#4a7348",
      },
      secondary: {
        100: "#e6f3d5",
        200: "#d4ecc8",
        300: "#b8d8b4",
        500: "#9ecc8c",
        700: "#739965",
        800: "#5e7d53",
      },
      tertiary: {
        50: '#e6f3d5',
        100: '#e6f3d5',
        500: '#e6f3d5'
      }
    }
  };

  return (
    <ErrorBoundary>
      <ThemeProvider theme={themeConfig}>
        <BrowserCompatibility>
          <div className="min-h-screen bg-gradient-to-br from-tertiary-50 to-secondary-100">
            {/* Sticky Header */}
            <div className="sticky top-0 z-50 bg-gradient-to-br from-tertiary-50 to-secondary-100 border-b border-secondary-200 shadow-sm">
              <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
                {/* Header with Robot */}
                <div className="text-center mb-3 relative">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                    <div className="flex-shrink-0 order-2 sm:order-1">
                      <RobotGraphicContainer
                        appState={{
                          isLoading,
                          error,
                          progressStatus,
                          progressValue,
                          testResults,
                          isStreaming,
                          streamingContent,
                          streamingProgress,
                          isRequestPending,
                          streamingError,
                        }}
                        size="md"
                        className="mx-auto"
                        enableDebug={isRobotDebugEnabled}
                        options={{
                          talkingDuration: 2000,
                          debounceDelay: 100,
                          enableTransitions: true,
                        }}
                      />
                    </div>
                    <div className="order-1 sm:order-2">
                      <h1 className="text-2xl md:text-3xl font-bold text-primary-700 mb-1">
                        Promptatron 3000
                      </h1>
                      <p className="text-sm md:text-base text-secondary-700 px-2">
                        Building enterprise-grade AI agents before it was cool
                      </p>
                    </div>
                  </div>
                </div>

                {/* Navigation Tabs */}
                <div className="flex justify-center px-4">
                  <div className="bg-white rounded-lg p-1 shadow-sm border border-gray-200 flex flex-wrap sm:flex-nowrap">
                    <button
                      onClick={() => setActiveTab('test')}
                      className={`px-3 sm:px-4 py-1.5 rounded-md font-medium transition-colors duration-200 text-sm ${activeTab === 'test'
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                      Test
                    </button>
                    <button
                      onClick={() => setActiveTab('history')}
                      className={`px-3 sm:px-4 py-1.5 rounded-md font-medium transition-colors duration-200 text-sm ${activeTab === 'history'
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                      History
                    </button>
                    <button
                      onClick={() => setActiveTab('comparison')}
                      className={`px-3 sm:px-4 py-1.5 rounded-md font-medium transition-colors duration-200 relative text-sm ${activeTab === 'comparison'
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                      Comparison
                      {selectedForComparison.length > 0 && (
                        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                          {selectedForComparison.length}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* Main Content Area */}
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
              {/* Main Content */}
              {activeTab === 'test' && (
                <div className="max-w-7xl mx-auto animate-fade-in">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
                    {/* Left Column - Configuration */}
                    <div className="space-y-6 animate-slide-up">


                      <ModelSelector
                        selectedModel={selectedModel}
                        onModelSelect={handleModelSelect}
                        validationError={validationErrors.model}
                        externalError={error}
                      />

                      <DatasetSelector
                        selectedDataset={selectedDataset}
                        onDatasetSelect={handleDatasetSelect}
                        validationError={validationErrors.dataset}
                      />

                      <PromptEditor
                        systemPrompt={systemPrompt}
                        userPrompt={userPrompt}
                        onSystemPromptChange={handleSystemPromptChange}
                        onUserPromptChange={handleUserPromptChange}
                        systemPromptError={validationErrors.systemPrompt}
                        userPromptError={validationErrors.userPrompt}
                      />

                      {/* Advanced Options */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
                        {/* Determinism Evaluation Toggle */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            <div>
                              <h3 className="text-sm font-medium text-gray-900">Determinism Evaluation</h3>
                              <p className="text-xs text-gray-500">Analyze response consistency across multiple runs</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setDeterminismEnabled(!determinismEnabled)}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${determinismEnabled ? 'bg-primary-600' : 'bg-gray-200'
                              }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${determinismEnabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                          </button>
                        </div>

                        {/* Streaming Toggle */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <div>
                              <h3 className="text-sm font-medium text-gray-900">Streaming Response</h3>
                              <p className="text-xs text-gray-500">Show response as it's generated in real-time</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setStreamingEnabled(!streamingEnabled)}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${streamingEnabled ? 'bg-primary-600' : 'bg-gray-200'
                              }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${streamingEnabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                          </button>
                        </div>

                        {/* Clear Saved Settings */}
                        {hasFormState() && (
                          <div className="pt-4 border-t border-gray-200">
                            <button
                              onClick={handleClearSavedSettings}
                              className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H8a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              <span>Clear saved settings</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Enhanced Validation Summary with Dual Prompt Guidance */}
                      {Object.keys(validationErrors).length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <div className="flex">
                            <div className="flex-shrink-0">
                              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="ml-3 flex-1">
                              <h3 className="text-sm font-medium text-yellow-800">
                                Please complete the following to run your test:
                              </h3>
                              <div className="mt-2 space-y-2">
                                {/* Specific validation errors with enhanced messaging */}
                                <ul className="text-sm text-yellow-700 space-y-1">
                                  {validationErrors.model && (
                                    <li className="flex items-start space-x-2">
                                      <span className="text-yellow-500 mt-0.5">•</span>
                                      <span><strong>Model:</strong> {validationErrors.model}</span>
                                    </li>
                                  )}
                                  {validationErrors.systemPrompt && (
                                    <li className="flex items-start space-x-2">
                                      <span className="text-blue-500 mt-0.5">•</span>
                                      <span><strong>System Prompt:</strong> {validationErrors.systemPrompt}</span>
                                    </li>
                                  )}
                                  {validationErrors.userPrompt && (
                                    <li className="flex items-start space-x-2">
                                      <span className="text-green-500 mt-0.5">•</span>
                                      <span><strong>User Prompt:</strong> {validationErrors.userPrompt}</span>
                                    </li>
                                  )}
                                  {validationErrors.dataset && (
                                    <li className="flex items-start space-x-2">
                                      <span className="text-purple-500 mt-0.5">•</span>
                                      <span><strong>Dataset:</strong> {validationErrors.dataset}</span>
                                    </li>
                                  )}
                                </ul>

                                {/* Enhanced user guidance for dual prompt requirements */}
                                {(validationErrors.systemPrompt || validationErrors.userPrompt) && (
                                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                    <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center space-x-1">
                                      <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span>Dual Prompt Guide</span>
                                    </h4>
                                    <div className="text-xs text-blue-700 space-y-2">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div className="p-2 bg-blue-100 rounded border border-blue-200">
                                          <p className="font-medium text-blue-800">System Prompt</p>
                                          <p className="text-blue-600">Defines the AI's role, expertise, and behavior</p>
                                          <p className="text-blue-500 italic">Example: "You are a data analyst..."</p>
                                        </div>
                                        <div className="p-2 bg-green-100 rounded border border-green-200">
                                          <p className="font-medium text-green-800">User Prompt</p>
                                          <p className="text-green-600">Contains your specific request or question</p>
                                          <p className="text-green-500 italic">Example: "Analyze this data for patterns..."</p>
                                        </div>
                                      </div>
                                      <p className="text-blue-600 font-medium">
                                        💡 Both prompts work together: System prompt sets the context, user prompt provides the task.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Additional guidance for missing prompts */}
                                {validationErrors.systemPrompt && !validationErrors.userPrompt && (
                                  <div className="mt-2 p-2 bg-blue-50 border-l-4 border-blue-400 rounded">
                                    <p className="text-xs text-blue-700">
                                      <strong>Tip:</strong> Try templates like "Data Analyst" or "Classification Expert" to get started with your system prompt.
                                    </p>
                                  </div>
                                )}

                                {validationErrors.userPrompt && !validationErrors.systemPrompt && (
                                  <div className="mt-2 p-2 bg-green-50 border-l-4 border-green-400 rounded">
                                    <p className="text-xs text-green-700">
                                      <strong>Tip:</strong> Try templates like "Analyze Data" or "Detect Fraud" to get started with your user prompt.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Progress Bar */}
                      {isLoading && progressStatus && (
                        <div className="mb-6">
                          <ProgressBar
                            progress={progressValue}
                            status={progressStatus}
                            color="primary"
                          />
                        </div>
                      )}



                      <div className="flex justify-center">
                        <button
                          onClick={handleRunTest}
                          disabled={isLoading || !isFormValid()}
                          className={`btn-primary px-8 py-3 text-lg transition-all duration-200 ${isLoading || !isFormValid() ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg'
                            }`}
                        >
                          {isLoading ? (
                            <LoadingSpinner size="sm" color="white" text="Running Test..." inline />
                          ) : (
                            'Run Test'
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Right Column - Results */}
                    <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
                      <TestResults
                        results={testResults}
                        isLoading={isLoading}
                        determinismEnabled={determinismEnabled}
                        onEvaluationComplete={async (grade) => {
                          // Handle determinism evaluation completion
                          console.log('Determinism evaluation completed:', grade);
                          console.log('Current testResults:', testResults);

                          // Save the evaluation result to storage
                          if (testResults && grade) {
                            try {
                              const { fileService } = await import('./services/fileService.js');
                              console.log('Saving determinism evaluation for test ID:', testResults.id);
                              const saved = await fileService.saveDeterminismEvaluation(testResults.id, grade);
                              console.log('Determinism evaluation save result:', saved);

                              if (saved) {
                                // Update the current test results to include the grade
                                setTestResults(prev => ({
                                  ...prev,
                                  determinismGrade: grade
                                }));
                                console.log('Updated test results with determinism grade');
                              }
                            } catch (error) {
                              console.error('Failed to save determinism evaluation:', error);
                            }
                          } else {
                            console.warn('Cannot save determinism evaluation - missing testResults or grade:', { testResults: !!testResults, grade: !!grade });
                          }
                        }}
                        isStreaming={isStreaming}
                        streamingContent={streamingContent}
                        streamingProgress={streamingProgress}
                        streamingError={streamingError}
                        streamingToolUsage={streamingToolUsage}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="max-w-6xl mx-auto animate-fade-in">
                  <History
                    onLoadFromHistory={handleLoadFromHistory}
                    onCompareTests={handleCompareTests}
                    selectedForComparison={selectedForComparison}
                  />
                </div>
              )}

              {activeTab === 'comparison' && (
                <div className="max-w-6xl mx-auto animate-fade-in">
                  <Comparison
                    selectedTests={selectedForComparison}
                    onRemoveTest={handleRemoveFromComparison}
                    onClearComparison={handleClearComparison}
                  />
                </div>
              )}

              {/* Help Guide */}
              <HelpGuide />

              {/* Streaming Performance Monitor - Debug Mode */}
              {isStreamingDebugEnabled && (
                <div className="fixed bottom-4 right-4 w-80 z-40">
                  <StreamingPerformanceMonitor
                    isVisible={true}
                    refreshInterval={3000}
                  />
                </div>
              )}
            </div>
          </div>
        </BrowserCompatibility>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
