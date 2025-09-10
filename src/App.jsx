import { useState, useEffect, useCallback, useMemo } from "react";
import ModelSelector from "./components/ModelSelector";
import DatasetSelector from "./components/DatasetSelector";
import PromptEditor from "./components/PromptEditor";
import TestResults from "./components/TestResults";
import History from "./components/History";
import Comparison from "./components/Comparison";
import ErrorBoundary from "./components/ErrorBoundary";
import BrowserCompatibility from "./components/BrowserCompatibility";
import HelpGuide from "./components/HelpGuide";
import LoadingSpinner from "./components/LoadingSpinner";
import ProgressBar from "./components/ProgressBar";
import ThemeProvider from "./components/ThemeProvider";
import RobotGraphicContainer from "./components/RobotGraphic/RobotGraphicContainer";
import StreamingPerformanceMonitor from "./components/StreamingPerformanceMonitor";
import { bedrockService } from "./services/bedrockService";
import { useHistory } from "./hooks/useHistory";
import { validateForm } from "./utils/formValidation";
import { handleError, retryWithBackoff } from "./utils/errorHandling";
import {
  streamingMemoryManager,
  streamingMetricsCollector
} from "./utils/streamingOptimizations";

// Debug modes - controlled by environment variables
const isRobotDebugEnabled = import.meta.env.VITE_ROBOT_DEBUG === "true";
const isStreamingDebugEnabled = import.meta.env.VITE_STREAMING_DEBUG === "true";

function App() {
  // Core state management for the test harness
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedDataset, setSelectedDataset] = useState({
    type: "",
    option: "",
    content: null,
  });
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [testResults, setTestResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("test");
  const [validationErrors, setValidationErrors] = useState({});
  const [selectedForComparison, setSelectedForComparison] = useState([]);
  const [retryCount, setRetryCount] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [progressValue, setProgressValue] = useState(0);

  // Streaming-related state variables
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingProgress, setStreamingProgress] = useState({
    tokensReceived: 0,
    estimatedTotal: 0,
    startTime: 0,
    tokensPerSecond: 0,
    duration: 0,
  });
  const [isRequestPending, setIsRequestPending] = useState(false);
  const [streamingError, setStreamingError] = useState(null);

  // Use the history hook for managing test history
  const { saveTestResult } = useHistory();

  // Optimized streaming handlers
  const [streamingHandlers, setStreamingHandlers] = useState(null);
  const [currentStreamId, setCurrentStreamId] = useState(null);

  // Performance metrics state
  const [streamingMetrics, setStreamingMetrics] = useState({
    totalStreams: 0,
    averageTokensPerSecond: 0,
    successRate: 0,
    memoryUsage: 0
  });

  // Cleanup function for streaming state with optimizations
  const cleanupStreamingState = useCallback(() => {
    // Clean up streaming handlers
    if (streamingHandlers) {
      setStreamingHandlers(null);
    }

    // Clean up current stream
    if (currentStreamId) {
      streamingMemoryManager.cleanupStream(currentStreamId);
      setCurrentStreamId(null);
    }

    // Reset streaming state
    setIsStreaming(false);
    setIsRequestPending(false);
    setStreamingError(null);
    setStreamingContent("");
    setStreamingProgress({
      tokensReceived: 0,
      estimatedTotal: 0,
      startTime: 0,
      tokensPerSecond: 0,
      duration: 0,
    });

    // Update metrics
    updateStreamingMetrics();
  }, [streamingHandlers, currentStreamId]);

  // Update streaming metrics from collector
  const updateStreamingMetrics = useCallback(() => {
    const globalStats = streamingMetricsCollector.getGlobalStats();
    const performanceStats = streamingMetricsCollector.getPerformanceSummary();
    const memoryStats = streamingMemoryManager.getMemoryStats();

    setStreamingMetrics({
      totalStreams: globalStats.totalStreams,
      averageTokensPerSecond: performanceStats.averageTokensPerSecond,
      successRate: performanceStats.successRate,
      memoryUsage: memoryStats.totalMemoryUsage
    });
  }, []);

  // Handle streaming interruption (e.g., user navigates away)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isStreaming) {
        cleanupStreamingState();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isStreaming, cleanupStreamingState]);

  // Periodic cleanup of old metrics and memory management
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      // Clean up old metrics (older than 1 hour)
      streamingMetricsCollector.clearOldMetrics(60 * 60 * 1000);

      // Force garbage collection hint if available
      streamingMemoryManager.forceGarbageCollection();

      // Update metrics display
      updateStreamingMetrics();
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(cleanupInterval);
  }, [updateStreamingMetrics]);

  // Helper function to generate user-friendly validation messages
  const getValidationGuidance = (errors) => {
    const guidance = [];

    if (errors.systemPrompt && errors.userPrompt) {
      guidance.push(
        "Both system and user prompts are required. The system prompt defines the AI's role, while the user prompt contains your specific request."
      );
    } else if (errors.systemPrompt) {
      guidance.push(
        "System prompt is missing. This defines how the AI should behave and what expertise it should use."
      );
    } else if (errors.userPrompt) {
      guidance.push(
        "User prompt is missing. This should contain your specific question or request about the data."
      );
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
    const hasRequiredFields =
      selectedModel &&
      systemPrompt.trim() &&
      userPrompt.trim() &&
      selectedDataset.type &&
      selectedDataset.option &&
      selectedDataset.content;

    return !hasValidationErrors && hasRequiredFields;
  };

  // Helper function to get validation status for UI feedback
  const getValidationStatus = () => {
    const errors = validationErrors;
    const hasModel = !!selectedModel;
    const hasSystemPrompt = !!systemPrompt.trim();
    const hasUserPrompt = !!userPrompt.trim();
    const hasDataset = !!(
      selectedDataset.type &&
      selectedDataset.option &&
      selectedDataset.content
    );

    return {
      model: { valid: hasModel && !errors.model, error: errors.model },
      systemPrompt: {
        valid: hasSystemPrompt && !errors.systemPrompt,
        error: errors.systemPrompt,
      },
      userPrompt: {
        valid: hasUserPrompt && !errors.userPrompt,
        error: errors.userPrompt,
      },
      dataset: { valid: hasDataset && !errors.dataset, error: errors.dataset },
      overall: isFormValid(),
    };
  };

  // Clear error and streaming state when user makes changes
  useEffect(() => {
    if (error) {
      setError(null);
    }
    if (streamingError) {
      setStreamingError(null);
    }
    // Clear validation errors when user makes changes
    setValidationErrors({});
    // Clear streaming content when user changes inputs (but not during active streaming)
    if (!isStreaming && streamingContent) {
      setStreamingContent("");
    }
  }, [selectedModel, selectedDataset, systemPrompt, userPrompt]);

  // Real-time validation using enhanced validation utility
  useEffect(() => {
    const formData = {
      selectedModel,
      systemPrompt,
      userPrompt,
      selectedDataset,
    };

    const validationResult = validateForm(formData);
    setValidationErrors(validationResult.errors);
  }, [selectedModel, systemPrompt, userPrompt, selectedDataset]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl/Cmd + Enter: Run test
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (isFormValid() && !isLoading && !isStreaming) {
          handleRunTest();
        }
      }

      // Ctrl/Cmd + H: Switch to History tab
      if ((event.ctrlKey || event.metaKey) && event.key === "h") {
        event.preventDefault();
        setActiveTab("history");
      }

      // Ctrl/Cmd + T: Switch to Test tab
      if ((event.ctrlKey || event.metaKey) && event.key === "t") {
        event.preventDefault();
        setActiveTab("test");
      }

      // Ctrl/Cmd + C: Switch to Comparison tab (when available)
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "c" &&
        selectedForComparison.length > 0
      ) {
        event.preventDefault();
        setActiveTab("comparison");
      }

      // Escape: Clear current selection or close modals
      if (event.key === "Escape") {
        if (selectedForComparison.length > 0) {
          setSelectedForComparison([]);
        }
        if (error) {
          setError(null);
        }
        if (streamingError) {
          setStreamingError(null);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isFormValid,
    isLoading,
    isStreaming,
    selectedForComparison.length,
    error,
    streamingError,
  ]);

  const validateTestConfiguration = () => {
    const formData = {
      selectedModel,
      systemPrompt,
      userPrompt,
      selectedDataset,
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
      let errorMessage = "Cannot run test due to validation errors:\n\n";
      errorMessage += validationErrorsList
        .map((error) => `• ${error}`)
        .join("\n");

      if (guidance.length > 0) {
        errorMessage += "\n\n💡 Quick Tips:\n";
        errorMessage += guidance.map((tip) => `• ${tip}`).join("\n");
      }

      const errorInfo = handleError(new Error(errorMessage), {
        component: "App",
        action: "validateTestConfiguration",
        validationErrors: validationErrors,
        fieldCount: Object.keys(validationErrors).length,
      });
      setError(errorInfo.userMessage);
      return;
    }

    // Initialize all state for new test run
    setIsLoading(true);
    setError(null);
    setStreamingError(null);
    setRetryCount(0);
    setProgressStatus("Initializing...");
    setProgressValue(10);
    setIsRequestPending(true);
    setIsStreaming(false);
    setStreamingContent("");
    setStreamingProgress({
      tokensReceived: 0,
      estimatedTotal: 0,
      startTime: Date.now(),
    });

    try {
      console.log("Running test with:", {
        model: selectedModel,
        dataset: selectedDataset,
        systemPrompt: systemPrompt,
        userPrompt: userPrompt,
      });

      // Use retry with backoff for the test execution
      const testResult = await retryWithBackoff(
        async () => {
          // Ensure BedrockService is ready - this is the "thinking" phase
          setProgressStatus("Connecting to AWS Bedrock...");
          setProgressValue(25);

          if (!bedrockService.isReady()) {
            const initResult = await bedrockService.initialize();
            if (!initResult.success) {
              throw new Error(
                `AWS Bedrock initialization failed: ${initResult.message}`
              );
            }
          }

          setProgressStatus("Sending request to model...");
          setProgressValue(50);

          // Check if model supports streaming
          const supportsStreaming =
            bedrockService.isStreamingSupported(selectedModel);

          if (supportsStreaming) {
            // Use streaming approach with optimizations
            setIsRequestPending(false); // Request has been sent
            setIsStreaming(true);
            setProgressStatus("Receiving response...");
            setProgressValue(60);

            // Set up simple streaming callbacks without optimizations for now
            const onToken = (token, fullContent) => {
              // Update streaming content directly with full accumulated text
              setStreamingContent(fullContent);

              // Update progress metrics
              setStreamingProgress((prev) => {
                const now = Date.now();
                const duration = (now - prev.startTime) / 1000; // seconds
                const tokensReceived = prev.tokensReceived + 1;
                const tokensPerSecond =
                  duration > 0 ? tokensReceived / duration : 0;

                return {
                  ...prev,
                  tokensReceived,
                  tokensPerSecond: Math.round(tokensPerSecond * 10) / 10, // Round to 1 decimal
                  duration: Math.round(duration * 10) / 10, // Round to 1 decimal
                };
              });
            };

            const onComplete = (result) => {
              setIsStreaming(false);
              setProgressStatus("Processing response...");
              setProgressValue(75);
              updateStreamingMetrics();
            };

            const onError = (streamError) => {
              // Use enhanced error handling for streaming errors
              const errorInfo = handleError(streamError, {
                component: 'App',
                action: 'streaming',
                model: selectedModel,
                wasStreaming: true,
                streamingProgress: streamingProgress
              });

              setStreamingError(errorInfo.userMessage);
              setIsStreaming(false);
              updateStreamingMetrics();
            };

            // Use BedrockService streaming method
            const response = await bedrockService.invokeModelStream(
              selectedModel,
              systemPrompt,
              userPrompt,
              selectedDataset.content,
              onToken,
              onComplete,
              onError
            );

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
              isStreamed: true,
              streamingMetrics: {
                totalTokens: streamingProgress.tokensReceived,
                streamDuration:
                  streamingProgress.duration ||
                  (Date.now() - streamingProgress.startTime) / 1000,
                averageTokensPerSecond:
                  streamingProgress.tokensPerSecond ||
                  streamingProgress.tokensReceived /
                    ((Date.now() - streamingProgress.startTime) / 1000),
                firstTokenLatency: 0, // Could be enhanced to track this
              },
              timestamp: new Date().toISOString(),
            };
          } else {
            // Use non-streaming approach
            setIsRequestPending(false);
            setProgressStatus("Processing request...");
            setProgressValue(60);

            const response = await bedrockService.invokeModel(
              selectedModel,
              systemPrompt,
              userPrompt,
              selectedDataset.content
            );

            setProgressStatus("Processing response...");
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
              isStreamed: false,
              timestamp: new Date().toISOString(),
            };
          }
        },
        {
          maxRetries: 2,
          baseDelay: 1000,
          onRetry: (error, attempt, delay) => {
            console.log(
              `Retrying test execution (attempt ${attempt}) after ${delay}ms:`,
              error.message
            );
            setRetryCount(attempt);
            // Reset streaming state on retry
            setIsStreaming(false);
            setIsRequestPending(true);
            setStreamingContent("");
            setStreamingError(null);
          },
        }
      );

      setProgressStatus("Saving results...");
      setProgressValue(90);

      setTestResults(testResult);
      setRetryCount(0);

      // Save to history using the history service
      await saveTestResult(testResult);

      setProgressStatus("Complete!");
      setProgressValue(100);
    } catch (err) {
      console.error("Test execution failed:", err);

      // Use enhanced error handling with streaming context
      const errorInfo = handleError(err, {
        component: "App",
        action: "runTest",
        model: selectedModel,
        datasetType: selectedDataset.type,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length,
        wasStreaming: isStreaming,
        streamingError: streamingError,
      });

      setError(errorInfo.userMessage);
      setRetryCount(0);
    } finally {
      // Clean up all streaming and loading state
      setIsLoading(false);
      setIsStreaming(false);
      setIsRequestPending(false);
      setProgressStatus("");
      setProgressValue(0);

      // Clean up streaming content after a delay to allow user to see final result
      setTimeout(() => {
        if (!isStreaming) {
          // Clean up streaming handlers
          if (streamingHandlers) {
            setStreamingHandlers(null);
          }

          setStreamingContent("");
          setStreamingProgress({
            tokensReceived: 0,
            estimatedTotal: 0,
            startTime: 0,
            tokensPerSecond: 0,
            duration: 0,
          });

          // Update final metrics
          updateStreamingMetrics();
        }
      }, 2000);
    }
  };

  const handleLoadFromHistory = (historyItem) => {
    setSelectedModel(historyItem.modelId);
    setSelectedDataset({
      type: historyItem.datasetType,
      option: historyItem.datasetOption,
      content: null, // Will be loaded when dataset selector processes this
    });

    // Load dual prompt format with backward compatibility
    if (
      historyItem.systemPrompt !== undefined ||
      historyItem.userPrompt !== undefined
    ) {
      // New dual prompt format
      setSystemPrompt(historyItem.systemPrompt || "");
      setUserPrompt(historyItem.userPrompt || "");
    } else if (historyItem.prompt) {
      // Legacy single prompt format - treat as user prompt with empty system prompt
      setSystemPrompt("");
      setUserPrompt(historyItem.prompt);
    } else {
      // Fallback for entries with no prompt data
      setSystemPrompt("");
      setUserPrompt("");
    }

    setActiveTab("test");
  };

  const handleCompareTests = (tests) => {
    setSelectedForComparison(tests);
    if (tests.length > 0) {
      setActiveTab("comparison");
    }
  };

  const handleRemoveFromComparison = (testId) => {
    setSelectedForComparison((prev) =>
      prev.filter((test) => test.id !== testId)
    );
  };

  const handleClearComparison = () => {
    setSelectedForComparison([]);
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
        50: "#e6f3d5",
        100: "#e6f3d5",
        500: "#e6f3d5",
      },
    },
  };

  return (
    <ErrorBoundary>
      <ThemeProvider theme={themeConfig}>
        <BrowserCompatibility>
          <div className="min-h-screen bg-gradient-to-br from-tertiary-50 to-secondary-100">
            {/* Sticky Header */}
            <div className="sticky top-0 z-50 bg-gradient-to-br from-tertiary-50 to-secondary-100 border-b border-secondary-200 shadow-sm">
              <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                {/* Header with Robot */}
                <div className="text-center mb-4 lg:mb-6 relative">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
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
                        size="lg"
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
                      <h1 className="text-3xl md:text-4xl font-bold text-primary-700 mb-2">
                        Promptatron 3000
                      </h1>
                      <p className="text-base md:text-lg text-secondary-700 px-4">
                        Building enterprise-grade AI agents before it was cool
                      </p>
                    </div>
                  </div>
                </div>

                {/* Navigation Tabs */}
                <div className="flex justify-center px-4">
                  <div className="bg-white rounded-lg p-1 shadow-sm border border-gray-200 flex flex-wrap sm:flex-nowrap">
                    <button
                      onClick={() => setActiveTab("test")}
                      className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-colors duration-200 text-sm sm:text-base ${
                        activeTab === "test"
                          ? "bg-primary-600 text-white"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      Test Harness
                    </button>
                    <button
                      onClick={() => setActiveTab("history")}
                      className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-colors duration-200 text-sm sm:text-base ${
                        activeTab === "history"
                          ? "bg-primary-600 text-white"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      History
                    </button>
                    <button
                      onClick={() => setActiveTab("comparison")}
                      className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-colors duration-200 relative text-sm sm:text-base ${
                        activeTab === "comparison"
                          ? "bg-primary-600 text-white"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      Comparison
                      {selectedForComparison.length > 0 && (
                        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
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
              {/* Error Display */}
              {(error || streamingError) && (
                <div className="max-w-4xl mx-auto mb-6 animate-fade-in">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 transform transition-all duration-300 hover:shadow-md">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg
                          className="h-5 w-5 text-red-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div className="ml-3 flex-1">
                        {error && (
                          <p className="text-sm text-red-800">{error}</p>
                        )}
                        {streamingError && (
                          <div className="text-sm text-red-800">
                            <p className="font-medium">Streaming Error:</p>
                            <p>{streamingError}</p>
                            {streamingContent && (
                              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                                <p className="text-xs text-yellow-700 font-medium">
                                  Partial response received before error:
                                </p>
                                <p className="text-xs text-gray-600 mt-1 max-h-20 overflow-y-auto">
                                  {streamingContent.substring(0, 200)}
                                  {streamingContent.length > 200 && "..."}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                        {retryCount > 0 && (
                          <p className="text-xs text-red-600 mt-1">
                            Retried {retryCount} time
                            {retryCount !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                      <div className="ml-3 flex-shrink-0">
                        <button
                          onClick={() => {
                            setError(null);
                            setStreamingError(null);
                          }}
                          className="inline-flex text-red-400 hover:text-red-600"
                        >
                          <span className="sr-only">Dismiss</span>
                          <svg
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Main Content */}
              {activeTab === "test" && (
                <div className="max-w-7xl mx-auto animate-fade-in">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
                    {/* Left Column - Configuration */}
                    <div className="space-y-6 animate-slide-up">
                      <ModelSelector
                        selectedModel={selectedModel}
                        onModelSelect={setSelectedModel}
                        validationError={validationErrors.model}
                      />

                      <DatasetSelector
                        selectedDataset={selectedDataset}
                        onDatasetSelect={setSelectedDataset}
                        validationError={validationErrors.dataset}
                      />

                      <PromptEditor
                        systemPrompt={systemPrompt}
                        userPrompt={userPrompt}
                        onSystemPromptChange={setSystemPrompt}
                        onUserPromptChange={setUserPrompt}
                        systemPromptError={validationErrors.systemPrompt}
                        userPromptError={validationErrors.userPrompt}
                      />

                      {/* Enhanced Validation Summary with Dual Prompt Guidance */}
                      {Object.keys(validationErrors).length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <div className="flex">
                            <div className="flex-shrink-0">
                              <svg
                                className="h-5 w-5 text-yellow-400"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
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
                                      <span className="text-yellow-500 mt-0.5">
                                        •
                                      </span>
                                      <span>
                                        <strong>Model:</strong>{" "}
                                        {validationErrors.model}
                                      </span>
                                    </li>
                                  )}
                                  {validationErrors.systemPrompt && (
                                    <li className="flex items-start space-x-2">
                                      <span className="text-blue-500 mt-0.5">
                                        •
                                      </span>
                                      <span>
                                        <strong>System Prompt:</strong>{" "}
                                        {validationErrors.systemPrompt}
                                      </span>
                                    </li>
                                  )}
                                  {validationErrors.userPrompt && (
                                    <li className="flex items-start space-x-2">
                                      <span className="text-green-500 mt-0.5">
                                        •
                                      </span>
                                      <span>
                                        <strong>User Prompt:</strong>{" "}
                                        {validationErrors.userPrompt}
                                      </span>
                                    </li>
                                  )}
                                  {validationErrors.dataset && (
                                    <li className="flex items-start space-x-2">
                                      <span className="text-purple-500 mt-0.5">
                                        •
                                      </span>
                                      <span>
                                        <strong>Dataset:</strong>{" "}
                                        {validationErrors.dataset}
                                      </span>
                                    </li>
                                  )}
                                </ul>

                                {/* Enhanced user guidance for prompt requirements */}
                                {(validationErrors.systemPrompt ||
                                  validationErrors.userPrompt) && (
                                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                    <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center space-x-1">
                                      <svg
                                        className="h-4 w-4 text-blue-600"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                      </svg>
                                      <span>Prompt Guide</span>
                                    </h4>
                                    <div className="text-xs text-blue-700 space-y-2">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div className="p-2 bg-blue-100 rounded border border-blue-200">
                                          <p className="font-medium text-blue-800">
                                            System Prompt
                                          </p>
                                          <p className="text-blue-600">
                                            Defines the AI's role, expertise,
                                            and behavior
                                          </p>
                                          <p className="text-blue-500 italic">
                                            Example: "You are a data analyst..."
                                          </p>
                                        </div>
                                        <div className="p-2 bg-green-100 rounded border border-green-200">
                                          <p className="font-medium text-green-800">
                                            User Prompt
                                          </p>
                                          <p className="text-green-600">
                                            Contains your specific request or
                                            question
                                          </p>
                                          <p className="text-green-500 italic">
                                            Example: "Analyze this data for
                                            patterns..."
                                          </p>
                                        </div>
                                      </div>
                                      <p className="text-blue-600 font-medium">
                                        💡 Both prompts work together: System
                                        prompt sets the context, user prompt
                                        provides the task.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Additional guidance for missing prompts */}
                                {validationErrors.systemPrompt &&
                                  !validationErrors.userPrompt && (
                                    <div className="mt-2 p-2 bg-blue-50 border-l-4 border-blue-400 rounded">
                                      <p className="text-xs text-blue-700">
                                        <strong>Tip:</strong> Try templates like
                                        "Data Analyst" or "Classification
                                        Expert" to get started with your system
                                        prompt.
                                      </p>
                                    </div>
                                  )}

                                {validationErrors.userPrompt &&
                                  !validationErrors.systemPrompt && (
                                    <div className="mt-2 p-2 bg-green-50 border-l-4 border-green-400 rounded">
                                      <p className="text-xs text-green-700">
                                        <strong>Tip:</strong> Try templates like
                                        "Analyze Data" or "Detect Fraud" to get
                                        started with your user prompt.
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

                      {/* Streaming Status Indicator */}
                      {(isRequestPending || isStreaming) && (
                        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                              {isRequestPending ? (
                                <svg
                                  className="h-5 w-5 text-blue-500 animate-spin"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                              ) : (
                                <svg
                                  className="h-5 w-5 text-green-500"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V1a1 1 0 011-1h2a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V1a1 1 0 011-1h2a1 1 0 011 1v3m8-4v4"
                                  />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-blue-800">
                                  {isRequestPending
                                    ? "Thinking..."
                                    : "Talking..."}
                                </span>
                                {isStreaming && (
                                  <div className="text-xs text-blue-600 text-right">
                                    <div>
                                      {streamingProgress.tokensReceived} tokens
                                    </div>
                                    {streamingProgress.tokensPerSecond > 0 && (
                                      <div>
                                        {streamingProgress.tokensPerSecond}{" "}
                                        tok/sec
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-blue-600 mt-1">
                                {isRequestPending
                                  ? "Sending request and waiting for response to begin"
                                  : "Receiving response in real-time"}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Enhanced Form Validation Status Indicator */}
                      {(() => {
                        const status = getValidationStatus();
                        const completedFields = Object.values(status).filter(
                          (field) => field !== status.overall && field.valid
                        ).length;
                        const totalFields = 4; // model, systemPrompt, userPrompt, dataset

                        if (status.overall) {
                          return (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                              <div className="flex items-center space-x-2">
                                <svg
                                  className="h-5 w-5 text-green-500"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                                <span className="text-sm font-medium text-green-800">
                                  All requirements met! Ready to run your test.
                                </span>
                              </div>
                            </div>
                          );
                        } else if (completedFields > 0) {
                          return (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <svg
                                    className="h-5 w-5 text-blue-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                  </svg>
                                  <span className="text-sm font-medium text-blue-800">
                                    Progress: {completedFields} of {totalFields}{" "}
                                    requirements completed
                                  </span>
                                </div>
                                <div className="flex space-x-1">
                                  {[
                                    status.model,
                                    status.systemPrompt,
                                    status.userPrompt,
                                    status.dataset,
                                  ].map((field, index) => (
                                    <div
                                      key={index}
                                      className={`w-2 h-2 rounded-full ${
                                        field.valid
                                          ? "bg-green-400"
                                          : "bg-gray-300"
                                      }`}
                                      title={
                                        field.valid ? "Complete" : "Incomplete"
                                      }
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      <div className="flex justify-center">
                        <button
                          onClick={handleRunTest}
                          disabled={isLoading || isStreaming || !isFormValid()}
                          className={`btn-primary px-8 py-3 text-lg transition-all duration-200 ${
                            isLoading || isStreaming || !isFormValid()
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:shadow-lg"
                          }`}
                        >
                          {isLoading || isStreaming ? (
                            <LoadingSpinner
                              size="sm"
                              color="white"
                              text={
                                isRequestPending
                                  ? "Thinking..."
                                  : isStreaming
                                  ? "Talking..."
                                  : "Running Test..."
                              }
                              inline
                            />
                          ) : (
                            "Run Test"
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Right Column - Results */}
                    <div
                      className="animate-slide-up"
                      style={{ animationDelay: "0.1s" }}
                    >
                      <TestResults
                        results={testResults}
                        isLoading={isLoading}
                        isStreaming={isStreaming}
                        streamingContent={streamingContent}
                        streamingProgress={streamingProgress}
                        streamingError={streamingError}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "history" && (
                <div className="max-w-6xl mx-auto animate-fade-in">
                  <History
                    onLoadFromHistory={handleLoadFromHistory}
                    onCompareTests={handleCompareTests}
                    selectedForComparison={selectedForComparison}
                  />
                </div>
              )}

              {activeTab === "comparison" && (
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
