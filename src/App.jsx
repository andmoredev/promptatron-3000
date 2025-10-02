import { useState, useEffect, useCallback, useMemo } from "react";
import ModelSelector from "./components/ModelSelector";
import DatasetSelector from "./components/DatasetSelector";
import PromptEditor from "./components/PromptEditor";
import TestResults from "./components/TestResults";
import History from "./components/History";
import Comparison from "./components/Comparison";
import ErrorBoundary from "./components/ErrorBoundary";
import BrowserCompatibility from "./components/BrowserCompatibility";
import UIErrorNotification from "./components/UIErrorNotification";
import LoadingSpinner from "./components/LoadingSpinner";
import ProgressBar from "./components/ProgressBar";
import ThemeProvider from "./components/ThemeProvider";
import { RobotGraphicContainer } from "./components/RobotGraphic";
import ChadRevealButton from "./components/RobotGraphic/ChadRevealButton";
import FloatingChad from "./components/RobotGraphic/FloatingChad";
import { useChadReveal } from "./components/RobotGraphic/useChadReveal";
import StreamingPerformanceMonitor from "./components/StreamingPerformanceMonitor";
import SettingsDialog from "./components/SettingsDialog";
import NotificationContainer from "./components/NotificationContainer";

import ToolExecutionSettings from "./components/ToolExecutionSettings";
import ToolExecutionMonitor from "./components/ToolExecutionMonitor";
import { bedrockService } from "./services/bedrockService";
import { datasetToolIntegrationService } from "./services/datasetToolIntegrationService";
import { toolExecutionService } from "./services/toolExecutionService";
import { workflowTrackingService } from "./services/workflowTrackingService";
import { useHistory } from "./hooks/useHistory";
import { useModelOutput } from "./hooks/useModelOutput";
import {
  useStatePersistence,
  useUIStatePersistence,
  useNavigationStatePersistence,
  useTestResultsStatePersistence,
} from "./hooks/useStatePersistence";
import { statePersistenceService } from "./services/statePersistenceService";
import { useSettings, useDeterminismSettings, useCostSettings } from "./hooks/useSettings";
import { validateForm } from "./utils/formValidation";
import { handleError, retryWithBackoff } from "./utils/errorHandling";
import { hasToolServiceForDatasetType } from "./utils/toolServiceMapping";
import {
  loadFormState,
  saveFormState,
  createDebouncedSave,
  clearFormState,
  hasFormState,
} from "./utils/formStateStorage";
import { gradientErrorRecovery } from "./utils/gradientErrorRecovery";
import {
  handleUIError,
  initializeUIErrorMonitoring,
  proactiveUICheck,
} from "./utils/uiErrorIntegration";
import { useUIErrorRecovery } from "./hooks/useUIErrorRecovery";
import { fileService } from "./services/fileService";
import { storageMonitor } from "./utils/storageMonitor";

function App() {
  // Load saved form state on initialization
  const savedFormState = useMemo(() => loadFormState(), []);

  // Initialize state persistence hooks first
  const {
    uiState,
    updateUIState,
    isRestored: uiStateRestored,
  } = useUIStatePersistence({
    activeTab: "test",
    selectedForComparison: [],
    validationErrors: {},
    touchedFields: {},
    isExpanded: {},
    viewModes: {},
  });

  const {
    navigationState,
    switchTab: persistentSwitchTab,
    isRestored: navigationStateRestored,
  } = useNavigationStatePersistence();

  // Core state management for the test harness (initialized from saved state)
  const [selectedModel, setSelectedModel] = useState(
    savedFormState.selectedModel
  );
  const [selectedDataset, setSelectedDataset] = useState(
    savedFormState.selectedDataset
  );
  const [systemPrompt, setSystemPrompt] = useState(savedFormState.systemPrompt);
  const [userPrompt, setUserPrompt] = useState(savedFormState.userPrompt);
  const [testResults, setTestResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(
    navigationState.activeTab || "test"
  );
  const [validationErrors, setValidationErrors] = useState(
    uiState.validationErrors || {}
  );
  const [touchedFields, setTouchedFields] = useState(
    uiState.touchedFields || {}
  );
  const [selectedForComparison, setSelectedForComparison] = useState(
    uiState.selectedForComparison || []
  );
  const [retryCount, setRetryCount] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [progressValue, setProgressValue] = useState(0);

  // Streaming-related state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingProgress, setStreamingProgress] = useState(null);
  const [isRequestPending, setIsRequestPending] = useState(false);
  const [streamingError, setStreamingError] = useState(null);

  // Tool usage detection during streaming
  const [streamingToolUsage, setStreamingToolUsage] = useState({
    detected: false,
    activeTools: [],
    completedTools: [],
  });

  // Debug flags
  const [isRobotDebugEnabled, setIsRobotDebugEnabled] = useState(false);
  const [isStreamingDebugEnabled, setIsStreamingDebugEnabled] = useState(false);

  // Settings dialog state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Chad reveal state management
  const chadRevealState = useChadReveal();
  const {
    isRevealed: isChadRevealed,
    isRevealing: isChadRevealing,
    revealChad,
    shouldShowRevealButton
  } = chadRevealState;



  // Determinism evaluation state (initialized from saved state)
  const [determinismEnabled, setDeterminismEnabled] = useState(
    savedFormState.determinismEnabled
  );
  const [
    shouldStartDeterminismEvaluation,
    setShouldStartDeterminismEvaluation,
  ] = useState(false);

  // Streaming preference state (initialized from saved state)
  const [streamingEnabled, setStreamingEnabled] = useState(
    savedFormState.streamingEnabled
  );

  // Tool execution state (initialized from saved state)
  const [useToolsEnabled, setUseToolsEnabled] = useState(
    savedFormState.useToolsEnabled || false
  );
  const [maxIterations, setMaxIterations] = useState(
    savedFormState.maxIterations || 10
  );
  const [isToolExecuting, setIsToolExecuting] = useState(false);
  const [toolExecutionId, setToolExecutionId] = useState(null);
  const [toolExecutionStatus, setToolExecutionStatus] = useState("idle"); // 'idle' | 'executing' | 'completed' | 'error' | 'cancelled'
  const [conflictMessage, setConflictMessage] = useState(null);

  // Initialize settings system
  const {
    allSettings,
    isLoading: settingsLoading,
    error: settingsError,
    isInitialized: settingsInitialized,
  } = useSettings();

  // Get determinism settings specifically
  const {
    settings: determinismSettings,
    isInitialized: determinismSettingsInitialized,
  } = useDeterminismSettings();

  // Get cost settings specifically
  const {
    settings: costSettings,
    isInitialized: costSettingsInitialized,
  } = useCostSettings();

  // Use the history hook for managing test history
  const { saveTestResult } = useHistory();

  // Use model output manager for state persistence and error recovery
  const {
    initializeOutput,
    updateOutput,
    handleStreamingError,
    completeStreaming,
    handleDisplayError,
  } = useModelOutput();

  // Use comprehensive state persistence system
  const {
    isInitialized: statePersistenceInitialized,
    saveTestResultsState,
    restoreTestResultsState,
    saveModelOutputState,
    restoreModelOutputState,
    getSessionInfo,
    stateInfo,
  } = useStatePersistence();

  // Use test results state persistence
  const {
    testResults: persistedTestResults,
    saveResults: savePersistentResults,
    restoreResults: restorePersistentResults,
    isRestored: testResultsStateRestored,
  } = useTestResultsStatePersistence();

  // Use UI error recovery system
  const {
    componentRef: appRef,
    handleUIError: handleAppUIError,
    backupState,
    checkComponentHealth,
    applyRecoveryStrategy,
  } = useUIErrorRecovery("App", {
    enableAutoRecovery: true,
    enableStateBackup: true,
    onRecoveryAttempt: (errorInfo) => {
      // Recovery attempt logged at warning level in recovery system
    },
    onRecoverySuccess: (result) => {
      // Recovery success logged at info level in recovery system
    },
    onRecoveryFailure: (result) => {
      console.error("UI recovery failed for App:", result);
    },
  });

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

  // Helper function to check if tools are available for the current dataset
  const areToolsAvailable = () => {
    // Check if the selected dataset type has a tool service mapped
    if (!selectedDataset.type) return false;

    // Use the tool service mapping to determine availability dynamically
    return hasToolServiceForDatasetType(selectedDataset.type);
  };

  // Helper function to provide recovery suggestions for tool execution errors
  const getToolExecutionRecoveryOptions = (error) => {
    const suggestions = [];

    if (error.includes("iteration limit")) {
      suggestions.push(
        "Increase the maximum iteration limit in Tool Execution Settings"
      );
      suggestions.push(
        "Simplify your prompts to reduce the number of tool calls needed"
      );
      suggestions.push(
        "Review the workflow timeline to understand why many iterations were needed"
      );
    }

    if (error.includes("timeout") || error.includes("network")) {
      suggestions.push("Check your internet connection and try again");
      suggestions.push(
        "Verify your AWS credentials are valid and have proper permissions"
      );
      suggestions.push("Try with a smaller dataset or simpler prompts");
    }

    if (error.includes("credentials") || error.includes("authorization")) {
      suggestions.push(
        "Run the local-setup.sh script to refresh your AWS credentials"
      );
      suggestions.push("Verify your AWS account has access to Amazon Bedrock");
      suggestions.push(
        "Check that your credentials have the necessary permissions for tool execution"
      );
    }

    if (error.includes("tool not found") || error.includes("invalid tool")) {
      suggestions.push(
        "Try switching to a different dataset that supports the required tools"
      );
      suggestions.push(
        "Disable tool execution mode to run in tool detection mode instead"
      );
      suggestions.push("Check the tool configuration for the selected dataset");
    }

    if (error.includes("parameter") || error.includes("validation")) {
      suggestions.push(
        "Try simplifying your prompts to provide clearer instructions to the model"
      );
      suggestions.push(
        "Review the tool definitions to understand expected parameter formats"
      );
      suggestions.push(
        "Consider using a different model that may handle tool parameters better"
      );
    }

    // General suggestions if no specific ones apply
    if (suggestions.length === 0) {
      suggestions.push(
        "Try disabling tool execution to run in tool detection mode"
      );
      suggestions.push(
        "Reduce the maximum iteration limit to prevent long-running executions"
      );
      suggestions.push("Simplify your prompts and try again");
      suggestions.push(
        "Check the browser console for additional error details"
      );
    }

    return suggestions;
  };

  // Enhanced form validation function with detailed checking
  const isFormValid = () => {
    const hasValidationErrors = Object.keys(validationErrors).length > 0;
    const hasRequiredFields =
      selectedModel &&
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
    if (conflictMessage) {
      setConflictMessage(null);
    }
  }, [selectedModel, selectedDataset, systemPrompt, userPrompt]);

  // Cleanup tool execution state when component unmounts or critical changes occur
  useEffect(() => {
    return () => {
      // Cleanup any ongoing tool execution when component unmounts
      if (isToolExecuting) {
        resetToolExecutionState();
      }
    };
  }, []);

  // Reset tool execution state when switching datasets or models during execution
  useEffect(() => {
    if (isToolExecuting && (selectedModel || selectedDataset.type)) {
      // If user changes critical settings during execution, reset execution state
      resetToolExecutionState();
    }
  }, [selectedModel, selectedDataset.type, isToolExecuting]);

  // Real-time monitoring of tool execution progress
  useEffect(() => {
    let monitoringInterval = null;

    if (
      isToolExecuting &&
      toolExecutionId &&
      toolExecutionService.isInitialized
    ) {
      // Poll execution status every 500ms for real-time updates
      monitoringInterval = setInterval(() => {
        try {
          const status =
            toolExecutionService.getExecutionStatus(toolExecutionId);

          if (status) {
            // Update progress based on execution status
            if (status.status === "executing") {
              const progressPercent = Math.min(
                90,
                60 + (status.currentIteration / status.maxIterations) * 30
              );
              setProgressValue(progressPercent);
              setProgressStatus(
                `Tool execution: iteration ${status.currentIteration}/${status.maxIterations}`
              );
            } else if (status.status === "completed") {
              // Execution completed, stop monitoring
              clearInterval(monitoringInterval);
              setProgressStatus("Tool execution completed");
            } else if (
              status.status === "error" ||
              status.status === "cancelled"
            ) {
              // Execution failed or cancelled, stop monitoring
              clearInterval(monitoringInterval);
              if (status.status === "error") {
                setProgressStatus("Tool execution failed");
              } else {
                setProgressStatus("Tool execution cancelled");
              }
            }
          }
        } catch (error) {
          console.warn("Failed to get tool execution status:", error);
          // Don't clear interval on monitoring errors, just log them
        }
      }, 500);
    }

    // Cleanup interval when execution finishes or component unmounts
    return () => {
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
      }
    };
  }, [isToolExecuting, toolExecutionId]);

  // Real-time validation using enhanced validation utility
  useEffect(() => {
    const formData = {
      selectedModel,
      systemPrompt,
      userPrompt,
      selectedDataset,
    };

    const validationResult = validateForm(formData);

    // Only show validation errors for fields that have been touched
    const filteredErrors = {};
    Object.keys(validationResult.errors).forEach((field) => {
      if (touchedFields[field]) {
        filteredErrors[field] = validationResult.errors[field];
      }
    });

    setValidationErrors(filteredErrors);

    // Update persisted UI state
    if (statePersistenceInitialized) {
      updateUIState({ validationErrors: filteredErrors });
    }
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
      streamingEnabled,
      useToolsEnabled,
      maxIterations,
    };

    // Only save if we have some meaningful data (avoid saving empty initial state)
    if (selectedModel || systemPrompt || userPrompt || selectedDataset.type) {
      debouncedSave(formState);
    }
  }, [
    selectedModel,
    selectedDataset,
    systemPrompt,
    userPrompt,
    determinismEnabled,
    streamingEnabled,
    useToolsEnabled,
    maxIterations,
    debouncedSave,
  ]);

  // Auto-reload dataset content when form is restored from localStorage
  useEffect(() => {
    // Only trigger on initial load if we have a saved dataset selection but no content
    if (
      savedFormState.selectedDataset.type &&
      savedFormState.selectedDataset.option &&
      !selectedDataset.content &&
      selectedDataset.type === savedFormState.selectedDataset.type &&
      selectedDataset.option === savedFormState.selectedDataset.option
    ) {
      // The DatasetSelector component will handle reloading the content
      // We just need to ensure the selection is properly set
    }
  }, []); // Only run on mount

  // Initialize gradient error recovery and UI error monitoring
  useEffect(() => {
    // Apply preventive fixes on component mount
    gradientErrorRecovery.applyPreventiveFixes();

    // Initialize comprehensive UI error monitoring
    initializeUIErrorMonitoring();

    // Initialize storage monitoring
    storageMonitor.startMonitoring();

    // Expose storage monitor for debugging and error handling
    if (typeof window !== 'undefined') {
      window.storageMonitor = storageMonitor;
    }

    // Set up periodic checks for gradient issues
    const checkInterval = setInterval(() => {
      const issues = gradientErrorRecovery.detectGradientIssues();
      if (issues.length > 0) {
        issues.forEach((issue) => {
          gradientErrorRecovery.handleUIError({
            errorType: "gradient",
            component: issue.component,
            errorMessage: issue.description,
          });
        });
      }
    }, 5000); // Check every 5 seconds

    // Perform initial proactive UI check
    proactiveUICheck("App").then((issues) => {
      // Issues are logged at appropriate levels in the UI check system
    });

    return () => {
      clearInterval(checkInterval);
      storageMonitor.stopMonitoring();
    };
  }, []);

  // Backup app state for UI recovery
  useEffect(() => {
    const appState = {
      selectedModel,
      selectedDataset,
      systemPrompt,
      userPrompt,
      determinismEnabled,
      streamingEnabled,
      useToolsEnabled,
      maxIterations,
      isToolExecuting,
      toolExecutionStatus,
      activeTab,
      testResults: testResults
        ? { id: testResults.id, timestamp: testResults.timestamp }
        : null,
    };

    backupState(appState);
  }, [
    selectedModel,
    selectedDataset,
    systemPrompt,
    userPrompt,
    determinismEnabled,
    streamingEnabled,
    useToolsEnabled,
    maxIterations,
    isToolExecuting,
    toolExecutionStatus,
    activeTab,
    testResults,
    backupState,
  ]);

  // Sync UI state with persistence system
  useEffect(() => {
    if (statePersistenceInitialized && uiStateRestored) {
      updateUIState({
        activeTab,
        selectedForComparison,
        validationErrors,
        touchedFields,
      });
    }
  }, [
    activeTab,
    selectedForComparison,
    validationErrors,
    touchedFields,
    statePersistenceInitialized,
    uiStateRestored,
    updateUIState,
  ]);

  // Restore navigation state when available
  useEffect(() => {
    if (
      navigationStateRestored &&
      navigationState.activeTab &&
      navigationState.activeTab !== activeTab
    ) {
      setActiveTab(navigationState.activeTab);
    }
  }, [navigationStateRestored, navigationState.activeTab, activeTab]);

  // Restore test results state when available
  useEffect(() => {
    if (testResultsStateRestored && persistedTestResults && !testResults) {
      setTestResults(persistedTestResults);
    }
  }, [testResultsStateRestored, persistedTestResults, testResults]);

  // Save test results to persistence system when they change
  useEffect(() => {
    if (statePersistenceInitialized && testResults) {
      savePersistentResults(testResults, testResults.id);

      // Also save model output if available
      if (testResults.response) {
        saveModelOutputState(
          {
            output: testResults.response,
            testId: testResults.id,
            modelId: testResults.modelId,
            usage: testResults.usage,
            isStreamed: testResults.isStreamed,
            streamingMetrics: testResults.streamingMetrics,
            timestamp: testResults.timestamp,
          },
          testResults.id
        );
      }
    }
  }, [
    testResults,
    statePersistenceInitialized,
    savePersistentResults,
    saveModelOutputState,
  ]);

  // Apply settings when they're loaded
  useEffect(() => {
    if (settingsInitialized && allSettings) {
      if (allSettings.determinism?.enabled !== undefined) {
        // If there's no saved form state, or if the saved state has the default value, apply settings
        if (!hasFormState() || savedFormState.determinismEnabled === true) {
          setDeterminismEnabled(allSettings.determinism.enabled);
        }
      }

      // Apply tool execution settings
      if (allSettings.toolExecution?.enabled !== undefined) {
        if (!hasFormState() || savedFormState.useToolsEnabled === undefined) {
          setUseToolsEnabled(allSettings.toolExecution.enabled);
        }
      }

      if (allSettings.toolExecution?.maxIterations !== undefined) {
        if (!hasFormState() || savedFormState.maxIterations === undefined) {
          setMaxIterations(allSettings.toolExecution.maxIterations);
        }
      }

      // Apply UI settings
      if (allSettings.ui?.defaultTab && !navigationState?.activeTab) {
        // Only set default tab if no navigation state is restored
        setActiveTab(allSettings.ui.defaultTab);
      }
    }
  }, [
    settingsInitialized,
    allSettings,
    savedFormState.determinismEnabled,
    savedFormState.useToolsEnabled,
    savedFormState.maxIterations,
    navigationState?.activeTab,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl/Cmd + Enter: Run test
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (isFormValid() && !isLoading) {
          handleRunTest();
        }
      }

      // Ctrl/Cmd + H: Switch to History tab
      if ((event.ctrlKey || event.metaKey) && event.key === "h") {
        event.preventDefault();
        handleTabSwitch("history");
      }

      // Ctrl/Cmd + T: Switch to Test tab
      if ((event.ctrlKey || event.metaKey) && event.key === "t") {
        event.preventDefault();
        handleTabSwitch("test");
      }

      // Ctrl/Cmd + C: Switch to Comparison tab (when available)
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "c" &&
        selectedForComparison.length > 0
      ) {
        event.preventDefault();
        handleTabSwitch("comparison");
      }

      // Ctrl/Cmd + ,: Open Settings
      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        setIsSettingsOpen(true);
      }

      // Escape: Clear current selection or close modals
      if (event.key === "Escape") {
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
        } else if (selectedForComparison.length > 0) {
          setSelectedForComparison([]);
        } else if (error) {
          setError(null);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isFormValid,
    isLoading,
    selectedForComparison.length,
    error,
    isSettingsOpen,
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
    // Check for tool execution and determinism evaluation conflicts
    if (useToolsEnabled && determinismEnabled) {
      const errorInfo = await handleUIError(
        new Error(
          "Cannot run test with both tool execution and determinism evaluation enabled"
        ),
        {
          component: "App",
          action: "validateToolExecutionConflict",
          errorType: "validation",
        }
      );
      setError(
        "Tool execution and determinism evaluation cannot be enabled simultaneously. Please disable one of them."
      );
      return;
    }

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

      const errorInfo = await handleUIError(new Error(errorMessage), {
        component: "App",
        action: "validateTestConfiguration",
        validationErrors: validationErrors,
        fieldCount: Object.keys(validationErrors).length,
        errorType: "validation",
      });
      setError(errorInfo.userMessage);
      return;
    }

    setIsLoading(true);
    setError(null);
    setRetryCount(0);
    setProgressStatus("Initializing...");
    setProgressValue(10);

    // Initialize model output manager for this test
    const testId = Date.now().toString();
    const outputInitialized = initializeOutput(testId, {
      streamingEnabled,
      modelId: selectedModel,
      systemPrompt,
      userPrompt,
    });

    if (!outputInitialized) {
      setError("Failed to initialize output state management");
      setIsLoading(false);
      return;
    }

    try {
      // Use retry with backoff for the test execution
      const testResult = await retryWithBackoff(
        async () => {
          // Ensure BedrockService is ready
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

          // Get tool configuration for the selected dataset with enhanced error handling
          setProgressStatus("Loading tool configuration...");
          setProgressValue(40);

          let toolConfig = null;
          let toolConfigurationStatus = null;

          try {
            const toolConfigResult =
              await datasetToolIntegrationService.getToolConfigurationForDataset(
                selectedDataset
              );
            toolConfigurationStatus = toolConfigResult;

            if (toolConfigResult.hasToolConfig) {
              toolConfig = toolConfigResult.toolConfig;

              // Show warnings if any
              if (toolConfigResult.warnings?.length > 0) {
                console.warn(
                  "Tool configuration warnings:",
                  toolConfigResult.warnings
                );
              }
            } else {
              // Check if this is an error condition or expected behavior
              if (toolConfigResult.errors?.length > 0) {
                console.warn(
                  "Tool configuration errors:",
                  toolConfigResult.errors
                );
              }

              if (toolConfigResult.gracefulDegradation) {
                // Using graceful degradation - analysis will proceed without tools
              }
            }
          } catch (toolError) {
            console.warn(
              "Failed to load tool configuration, proceeding without tools:",
              toolError.message
            );

            // Create a fallback status for error display
            toolConfigurationStatus = {
              hasToolConfig: false,
              fallbackMode: true,
              message: `Tool configuration failed: ${toolError.message}`,
              errors: [toolError.message],
              warnings: [],
              gracefulDegradation: true,
            };
          }

          setProgressStatus("Sending request to model...");
          setProgressValue(50);

          let response;
          let streamingMetrics = null;
          let workflowData = null;

          // Debug logging for execution path
          console.log("🔧 Execution Path Debug:", {
            useToolsEnabled,
            hasToolConfig: !!toolConfig,
            toolCount: toolConfig?.tools?.length || 0,
            streamingEnabled,
            executionPath:
              useToolsEnabled &&
              toolConfig &&
              toolConfig.tools &&
              toolConfig.tools.length > 0
                ? "tool_execution"
                : streamingEnabled
                ? "tool_detection_streaming"
                : "tool_detection_standard",
          });

          // Branch based on tool execution mode
          if (
            useToolsEnabled &&
            toolConfig &&
            toolConfig.tools &&
            toolConfig.tools.length > 0
          ) {
            // Tool execution mode - use ToolExecutionService

            setProgressStatus("Initializing tool execution...");
            setProgressValue(55);

            // Initialize tool execution service if needed
            if (!toolExecutionService.isInitialized) {
              const credentials = {
                region: import.meta.env.VITE_AWS_REGION || "us-east-1",
                accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
                secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
                sessionToken: import.meta.env.VITE_AWS_SESSION_TOKEN,
              };
              await toolExecutionService.initialize(credentials);
            }

            setProgressStatus("Executing tool workflow...");
            setProgressValue(60);

            // Set tool execution state
            const executionId = `exec_${testId}`;
            initializeToolExecution(executionId);

            // Initialize streaming for tool execution
            setIsStreaming(true);
            setStreamingContent("🚀 Starting tool execution workflow...\n");
            setStreamingError(null);

            try {
              // Execute tool workflow with streaming updates
              const workflowResult = await toolExecutionService.executeWorkflow(
                selectedModel,
                systemPrompt,
                userPrompt,
                selectedDataset.content,
                toolConfig,
                {
                  maxIterations: maxIterations,
                  executionId: executionId,
                  datasetType: selectedDataset.type,
                  onStreamUpdate: (update) => {
                    // Update streaming content with workflow progress
                    setStreamingContent(prevContent => {
                      const timestamp = new Date(update.timestamp).toLocaleTimeString();
                      let newLine = `[${timestamp}] ${update.content}`;

                      // Add additional context for certain update types
                      if (update.type === 'iteration_start') {
                        newLine += ` (${update.iteration}/${update.maxIterations})`;
                      } else if (update.type === 'tool_requests') {
                        newLine += ` - ${update.toolRequests?.length || 0} tool(s)`;
                      } else if (update.type === 'tool_result' && update.success) {
                        newLine += ` ✓`;
                      } else if (update.type === 'tool_error') {
                        newLine += ` ✗`;
                      }

                      return prevContent + newLine + '\n';
                    });

                    // Update progress status based on update type
                    if (update.type === 'iteration_start') {
                      setProgressStatus(`Tool execution: iteration ${update.iteration}/${update.maxIterations}`);
                      const progressPercent = Math.min(90, 60 + (update.iteration / update.maxIterations) * 30);
                      setProgressValue(progressPercent);
                    } else if (update.type === 'tool_execution') {
                      setProgressStatus(`Executing ${update.toolName}...`);
                    } else if (update.type === 'completion') {
                      setProgressStatus("Tool execution completed");
                      setProgressValue(100);

                      // Add final response to streaming content if available
                      if (update.finalResponse) {
                        setStreamingContent(prevContent =>
                          prevContent + '\n📋 Final Response:\n' + update.finalResponse
                        );
                      }
                    }
                  }
                }
              );

              // Extract response and workflow data
              response = {
                text:
                  workflowResult.results.finalResponse ||
                  "Tool execution completed without final response",
                usage: workflowResult.metadata?.usage || null,
                toolUsage: {
                  hasToolUsage: true, // UI expects this property name
                  detected: true,
                  executed: true,
                  toolCalls: (workflowResult.results.toolExecutions || []).map(
                    (execution) => ({
                      toolName: execution.toolName,
                      toolUseId: execution.toolUseId,
                      input: execution.parameters, // Map parameters to input
                      result: execution.result,
                      success: execution.success,
                      timestamp: execution.timestamp,
                      extractionSuccess: execution.success,
                      wasToolAvailable: true, // Tools were available since execution happened
                      parameterValidation: execution.success
                        ? { isValid: true }
                        : {
                            isValid: false,
                            errors: [execution.error || "Execution failed"],
                          },
                    })
                  ),
                  toolCallCount: workflowResult.results.totalToolCalls || 0, // UI expects this property name
                  totalCalls: workflowResult.results.totalToolCalls || 0,
                  iterationCount: workflowResult.metadata?.iterationCount || 0,
                  extractionSuccess: true, // Mark as successful since tools were executed
                  extractionErrors: [],
                  extractionWarnings: [],
                  executionMode: "execution", // Indicate this was execution mode
                },
              };

              workflowData = {
                executionId: workflowResult.executionId,
                workflow: workflowResult.workflow || [],
                metadata: workflowResult.metadata || {},
              };

              completeToolExecution("completed");

              // Complete streaming
              setIsStreaming(false);
            } catch (toolError) {
              completeToolExecution("error");

              // Complete streaming with error
              setIsStreaming(false);
              setStreamingError(`Tool execution failed: ${toolError.message}`);

              // Enhanced error handling for different tool execution failure types
              let errorMessage = "Tool execution failed";
              let shouldPreservePartialResults = false;
              let partialWorkflowData = null;

              // Check if we can get partial results from the execution
              if (toolExecutionId && toolExecutionService.isInitialized) {
                try {
                  const executionStatus =
                    toolExecutionService.getExecutionStatus(toolExecutionId);
                  if (executionStatus) {
                    partialWorkflowData = {
                      executionId: toolExecutionId,
                      workflow:
                        toolExecutionService.getWorkflow(toolExecutionId) || [],
                      metadata: {
                        iterationCount: executionStatus.currentIteration || 0,
                        maxIterations:
                          executionStatus.maxIterations || maxIterations,
                        duration: executionStatus.duration || 0,
                        status: "error",
                      },
                    };
                    shouldPreservePartialResults = true;
                  }
                } catch (statusError) {
                  console.warn(
                    "Failed to get partial execution status:",
                    statusError
                  );
                }
              }

              // Categorize error types for better user messaging
              if (toolError.message.includes("cancelled")) {
                errorMessage = "Tool execution was cancelled";
              } else if (toolError.message.includes("iteration limit")) {
                errorMessage =
                  "Tool execution stopped due to iteration limit. Partial results may be available.";
                shouldPreservePartialResults = true;
              } else if (toolError.message.includes("timeout")) {
                errorMessage =
                  "Tool execution timed out. This may be due to network issues or complex processing.";
              } else if (
                toolError.message.includes("credentials") ||
                toolError.message.includes("authorization")
              ) {
                errorMessage =
                  "Tool execution failed due to authentication issues. Please check your AWS credentials.";
              } else if (
                toolError.message.includes("tool not found") ||
                toolError.message.includes("invalid tool")
              ) {
                errorMessage =
                  "Tool execution failed because a required tool is not available or configured incorrectly.";
              } else if (
                toolError.message.includes("parameter") ||
                toolError.message.includes("validation")
              ) {
                errorMessage =
                  "Tool execution failed due to invalid parameters. The model may have provided incorrect tool inputs.";
              } else {
                errorMessage = `Tool execution failed: ${toolError.message}`;
              }

              // If we have partial results, preserve them
              if (shouldPreservePartialResults && partialWorkflowData) {
                response = {
                  text: `Tool execution failed after ${partialWorkflowData.metadata.iterationCount} iterations.\n\nError: ${errorMessage}\n\nPartial workflow data has been preserved for review.`,
                  usage: null,
                  toolUsage: {
                    hasToolUsage: true, // UI expects this property name
                    detected: true,
                    executed: false,
                    error: toolError.message,
                    toolCalls: [],
                    toolCallCount: 0, // UI expects this property name
                    totalCalls: 0,
                    iterationCount: partialWorkflowData.metadata.iterationCount,
                    extractionSuccess: false,
                    extractionErrors: [
                      { message: toolError.message, type: "execution_error" },
                    ],
                    extractionWarnings: [],
                    executionMode: "execution",
                  },
                };

                workflowData = partialWorkflowData;

                // Don't throw error if we have partial results to show
                console.error(
                  "Tool execution failed with partial results:",
                  toolError
                );
              } else {
                // No partial results available, throw error
                throw new Error(errorMessage);
              }
            }
          } else if (streamingEnabled) {
            // Tool detection mode with streaming

            setIsStreaming(true);
            setStreamingContent("");
            setStreamingError(null);
            setStreamingToolUsage({
              detected: false,
              activeTools: [],
              completedTools: [],
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
                setStreamingContent((prev) => prev + token);

                const progressData = {
                  tokensReceived,
                  startTime,
                  firstTokenLatency: firstTokenTime - startTime,
                  duration: Date.now() - startTime,
                };
                setStreamingProgress(progressData);

                // Update output manager with streaming chunk
                updateOutput(token, {
                  isChunk: true,
                  metadata: {
                    streamingProgress: progressData,
                    toolUsage: metadata.toolUsageDetected
                      ? {
                          detected: true,
                          activeTools: metadata.toolUseStarted
                            ? [metadata.toolUseStarted]
                            : [],
                          completedTools: metadata.toolUseCompleted
                            ? [metadata.toolUseCompleted]
                            : [],
                        }
                      : undefined,
                  },
                });

                // Handle tool usage detection during streaming
                if (metadata.toolUsageDetected) {
                  setStreamingToolUsage((prev) => {
                    const updated = { ...prev, detected: true };

                    if (metadata.toolUseStarted) {
                      updated.activeTools = [
                        ...prev.activeTools,
                        {
                          ...metadata.toolUseStarted,
                          status: "started",
                          timestamp: new Date().toISOString(),
                        },
                      ];
                    }

                    if (metadata.toolUseProgress) {
                      updated.activeTools = prev.activeTools.map((tool) =>
                        tool.toolUseId === metadata.toolUseProgress.toolUseId
                          ? {
                              ...tool,
                              currentInput:
                                metadata.toolUseProgress.currentInput,
                              status: "in_progress",
                            }
                          : tool
                      );
                    }

                    if (metadata.toolUseCompleted) {
                      updated.activeTools = prev.activeTools.filter(
                        (tool) =>
                          tool.toolUseId !== metadata.toolUseCompleted.toolUseId
                      );
                      updated.completedTools = [
                        ...prev.completedTools,
                        {
                          ...metadata.toolUseCompleted,
                          status: "completed",
                          timestamp: new Date().toISOString(),
                        },
                      ];
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
                  averageTokensPerSecond:
                    tokensReceived / ((endTime - startTime) / 1000),
                };

                // Complete streaming in output manager
                completeStreaming({
                  usage: finalResponse.usage,
                  streamingMetrics: streamingMetrics,
                });

                setIsStreaming(false);
              },
              // onError callback
              (error) => {
                setStreamingError(error.message);

                // Handle streaming error in output manager
                handleStreamingError(error);

                setIsStreaming(false);
              },
              toolConfig // Pass tool configuration to streaming method
            );
          } else {
            // Tool detection mode without streaming

            response = await bedrockService.invokeModel(
              selectedModel,
              systemPrompt,
              userPrompt,
              selectedDataset.content,
              toolConfig // Pass tool configuration to standard method
            );

            // Update output manager with complete response
            updateOutput(response.text, {
              isComplete: true,
              metadata: {
                usage: response.usage,
              },
            });
          }

          setProgressStatus("Processing response...");
          setProgressValue(75);

          // Update output manager with final response
          const finalUpdateSuccess = updateOutput(response.text, {
            isComplete: true,
            metadata: {
              usage: response.usage,
              streamingMetrics: streamingMetrics,
            },
          });

          if (!finalUpdateSuccess) {
            console.warn("Failed to update output manager with final response");
          }

          return {
            id: testId,
            modelId: selectedModel,
            systemPrompt: systemPrompt,
            userPrompt: userPrompt,
            prompt: userPrompt, // Legacy field for backward compatibility
            datasetType: selectedDataset.type,
            datasetOption: selectedDataset.option,
            datasetContent: selectedDataset.content, // Include dataset content for determinism evaluation
            response: response.text,
            usage: response.usage,
            isStreamed: streamingEnabled && !useToolsEnabled, // Streaming not used in tool execution mode
            streamingMetrics: streamingMetrics,
            toolUsage: response.toolUsage || null, // Include tool usage data from response
            toolConfig: toolConfig, // Include tool configuration for determinism evaluation
            toolConfigurationStatus: toolConfigurationStatus, // Include tool configuration status
            toolExecutionEnabled: useToolsEnabled, // Flag to indicate if tools were actually executed
            workflowData: workflowData, // Include workflow data for tool execution
            timestamp: new Date().toISOString(),
          };
        },
        {
          maxRetries: 2,
          baseDelay: 1000,
          onRetry: (error, attempt, delay) => {
            setRetryCount(attempt);
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

      // Trigger determinism evaluation if enabled (single-fire logic)
      if (determinismEnabled) {
        setShouldStartDeterminismEvaluation(true);
        // Reset the trigger after a short delay to ensure single-fire behavior
        setTimeout(() => setShouldStartDeterminismEvaluation(false), 100);
      }

      // Reset streaming state
      setIsStreaming(false);
      setStreamingContent("");
      setStreamingProgress(null);
      setStreamingError(null);
      setStreamingToolUsage({
        detected: false,
        activeTools: [],
        completedTools: [],
      });
    } catch (err) {
      console.error("Test execution failed:", err);

      // Enhanced error handling for tool execution failures
      if (isToolExecuting) {
        completeToolExecution("error");
      }

      // Handle display error in output manager
      const recovered = handleDisplayError(err, {
        component: "App",
        action: "runTest",
        model: selectedModel,
        datasetType: selectedDataset.type,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length,
        toolExecutionEnabled: useToolsEnabled,
        toolExecutionId: toolExecutionId,
      });

      // Enhanced error context for tool execution
      const errorContext = {
        component: "App",
        action: "runTest",
        model: selectedModel,
        datasetType: selectedDataset.type,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length,
        toolExecutionEnabled: useToolsEnabled,
        toolExecutionId: toolExecutionId,
        maxIterations: maxIterations,
        recovered,
        errorType: useToolsEnabled ? "tool_execution" : "component",
      };

      // Use enhanced error handling with UI recovery
      const errorInfo = await handleUIError(err, errorContext);

      // Provide more specific error messages for tool execution failures
      let userErrorMessage = errorInfo.userMessage;

      if (useToolsEnabled && err.message) {
        if (err.message.includes("Tool execution failed")) {
          userErrorMessage = `${err.message}\n\nTip: Check the workflow timeline below for detailed execution steps and error information.`;
        } else if (err.message.includes("iteration limit")) {
          userErrorMessage = `Tool execution reached the maximum iteration limit (${maxIterations}). You can increase the limit in Tool Execution Settings or review the partial results.`;
        } else if (err.message.includes("cancelled")) {
          userErrorMessage =
            "Tool execution was cancelled. Any partial results have been preserved.";
        }
      }

      setError(userErrorMessage);
      setRetryCount(0);
    } finally {
      setIsLoading(false);
      setProgressStatus("");
      setProgressValue(0);

      // Reset streaming state in all cases
      setIsStreaming(false);
      setStreamingContent("");
      setStreamingProgress(null);
      setStreamingError(null);
      setStreamingToolUsage({
        detected: false,
        activeTools: [],
        completedTools: [],
      });

      // Reset tool execution state if still executing (cleanup for unexpected errors)
      if (isToolExecuting && toolExecutionStatus === "executing") {
        setIsToolExecuting(false);
        setToolExecutionStatus("error");
      }
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

    // Mark all fields as touched when loading from history
    setTouchedFields({
      model: true,
      dataset: true,
      systemPrompt: true,
      userPrompt: true,
    });

    handleTabSwitch("test");
  };

  const handleCompareTests = (tests) => {
    setSelectedForComparison(tests);
    if (statePersistenceInitialized) {
      updateUIState({ selectedForComparison: tests });
    }
    if (tests.length > 0) {
      handleTabSwitch("comparison");
    }
  };

  const handleRemoveFromComparison = (testId) => {
    const newSelection = selectedForComparison.filter(
      (test) => test.id !== testId
    );
    setSelectedForComparison(newSelection);
    if (statePersistenceInitialized) {
      updateUIState({ selectedForComparison: newSelection });
    }
  };

  const handleClearComparison = () => {
    setSelectedForComparison([]);
    if (statePersistenceInitialized) {
      updateUIState({ selectedForComparison: [] });
    }
  };

  // Handle tab switching with persistence
  const handleTabSwitch = useCallback(
    async (newTab) => {
      setActiveTab(newTab);
      if (statePersistenceInitialized) {
        await persistentSwitchTab(newTab);
      }
    },
    [statePersistenceInitialized, persistentSwitchTab]
  );

  // Mark fields as touched when user interacts with them
  const markFieldAsTouched = (fieldName) => {
    const newTouchedFields = {
      ...touchedFields,
      [fieldName]: true,
    };
    setTouchedFields(newTouchedFields);

    // Update persisted UI state
    if (statePersistenceInitialized) {
      updateUIState({ touchedFields: newTouchedFields });
    }
  };

  // Enhanced handlers that mark fields as touched
  const handleModelSelect = (modelId) => {
    setSelectedModel(modelId);
    markFieldAsTouched("model");
  };

  const handleDatasetSelect = (dataset) => {
    setSelectedDataset(dataset);
    markFieldAsTouched("dataset");
  };

  const handleSystemPromptChange = (prompt) => {
    setSystemPrompt(prompt);
    markFieldAsTouched("systemPrompt");
  };

  const handleUserPromptChange = (prompt) => {
    setUserPrompt(prompt);
    markFieldAsTouched("userPrompt");
  };

  // Tool execution handlers
  const handleUseToolsToggle = (enabled) => {
    // Clear any existing conflict messages
    setConflictMessage(null);

    // Prevent enabling tool execution during test execution
    if (isLoading) {
      setConflictMessage(
        "Cannot change tool execution settings while a test is running"
      );
      return;
    }

    setUseToolsEnabled(enabled);

    // Automatically disable determinism evaluation when tools are enabled
    if (enabled && determinismEnabled) {
      setDeterminismEnabled(false);
      setConflictMessage(
        "Determinism evaluation has been automatically disabled because it conflicts with tool execution"
      );
      // Clear the message after a few seconds
      setTimeout(() => setConflictMessage(null), 5000);
    }
  };

  // Enhanced determinism toggle handler
  const handleDeterminismToggle = (enabled) => {
    // Clear any existing conflict messages
    setConflictMessage(null);

    // Prevent enabling determinism evaluation during test execution
    if (isLoading) {
      setConflictMessage(
        "Cannot change determinism evaluation settings while a test is running"
      );
      return;
    }

    // Prevent enabling determinism evaluation when tools are enabled
    if (useToolsEnabled && enabled) {
      setConflictMessage(
        "Cannot enable determinism evaluation while tool execution is active. Please disable tool execution first."
      );
      return;
    }

    setDeterminismEnabled(enabled);
  };

  const handleMaxIterationsChange = (iterations) => {
    setMaxIterations(iterations);
  };

  // Tool execution state management
  const initializeToolExecution = (executionId) => {
    setIsToolExecuting(true);
    setToolExecutionId(executionId);
    setToolExecutionStatus("executing");
  };

  const completeToolExecution = (status = "completed") => {
    setIsToolExecuting(false);
    setToolExecutionStatus(status);
    // Keep executionId for reference but clear executing state
  };

  const cancelToolExecution = async () => {
    if (toolExecutionId && isToolExecuting) {
      try {
        // Cancel the execution in the service
        await toolExecutionService.cancelExecution(toolExecutionId);

        setIsToolExecuting(false);
        setToolExecutionStatus("cancelled");

        // Also cancel any ongoing test execution
        setIsLoading(false);
        setProgressStatus("");
        setProgressValue(0);

        // Set appropriate error message
        setError("Tool execution was cancelled by user");
      } catch (error) {
        console.error("Failed to cancel tool execution:", error);
        setError(
          "Failed to cancel tool execution properly, but stopping local state"
        );

        // Force local state cleanup even if service cancellation failed
        setIsToolExecuting(false);
        setToolExecutionStatus("error");
        setIsLoading(false);
      }
    }
  };

  const resetToolExecutionState = () => {
    setIsToolExecuting(false);
    setToolExecutionId(null);
    setToolExecutionStatus("idle");

    // Reset streaming state if it was active during tool execution
    if (isStreaming) {
      setIsStreaming(false);
      setStreamingContent("");
      setStreamingError(null);
    }
  };

  const handleClearSavedSettings = async () => {
    if (
      confirm(
        "Are you sure you want to clear all saved settings? This will reset the form to default values and clear all persisted state."
      )
    ) {
      clearFormState();

      // Clear comprehensive state persistence
      if (statePersistenceInitialized) {
        await statePersistenceService.clearAllState();
      }

      // Reset form to default values
      setSelectedModel("");
      setSelectedDataset({ type: "", option: "", content: null });
      setSystemPrompt("");
      setUserPrompt("");
      setDeterminismEnabled(true);
      setStreamingEnabled(true);
      setUseToolsEnabled(false);
      setMaxIterations(10);
      setIsToolExecuting(false);
      setToolExecutionId(null);
      setToolExecutionStatus("idle");
      setConflictMessage(null);

      // Clear UI state
      setTouchedFields({});
      setValidationErrors({});
      setSelectedForComparison([]);
      setActiveTab("test");

      // Clear test results
      setTestResults(null);
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
          <div
            ref={appRef}
            className="min-h-screen bg-gradient-to-br from-tertiary-50 to-secondary-100 bg-gradient-container"
          >
            {/* Sticky Header */}
            <div className="sticky top-0 z-50 bg-gradient-to-br from-tertiary-50 to-secondary-100 border-b border-secondary-200 shadow-sm sticky-header-gradient">
              <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
                {/* Header with Robot */}
                <div className="text-center mb-3 relative">
                  {/* Chad Reveal Button - positioned in top right */}
                  {shouldShowRevealButton() && (
                    <div className="absolute top-0 right-0 z-10">
                      <ChadRevealButton
                        onReveal={revealChad}
                        isRevealed={isChadRevealed}
                        isRevealing={isChadRevealing}
                        className="text-xs sm:text-sm"
                      />
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                    {!isChadRevealed && (
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
                          chadState={chadRevealState}
                          options={{
                            talkingDuration: 2000,
                            debounceDelay: 100,
                            enableTransitions: true,
                          }}
                        />
                      </div>
                    )}
                    <div className="order-1 sm:order-2">
                      <h1 className="text-2xl md:text-3xl font-bold text-primary-700 mb-1">
                        Promptatron 3000
                      </h1>
                      <p className="text-sm md:text-base text-secondary-700 px-2">
                        Building enterprise-grade AI agents before it was cool
                      </p>

                      {/* State Persistence Status */}
                      {statePersistenceInitialized &&
                        (uiStateRestored ||
                          navigationStateRestored ||
                          testResultsStateRestored) && (
                          <div className="flex items-center justify-center space-x-2 text-xs mt-2">
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full flex items-center space-x-1">
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              <span>Session Restored</span>
                            </span>
                            {stateInfo && stateInfo.session && (
                              <span className="text-gray-500">
                                {stateInfo.session.testCount} tests this session
                              </span>
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                </div>

                {/* Navigation Tabs */}
                <div className="flex justify-center px-4">
                  <div className="bg-white rounded-lg p-1 shadow-sm border border-gray-200 flex flex-wrap sm:flex-nowrap">
                    <button
                      onClick={() => handleTabSwitch("test")}
                      className={`px-3 sm:px-4 py-1.5 rounded-md font-medium transition-colors duration-200 text-sm ${
                        activeTab === "test"
                          ? "bg-primary-600 text-white"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      Test
                    </button>
                    <button
                      onClick={() => handleTabSwitch("history")}
                      className={`px-3 sm:px-4 py-1.5 rounded-md font-medium transition-colors duration-200 text-sm ${
                        activeTab === "history"
                          ? "bg-primary-600 text-white"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      History
                    </button>
                    <button
                      onClick={() => handleTabSwitch("comparison")}
                      className={`px-3 sm:px-4 py-1.5 rounded-md font-medium transition-colors duration-200 relative text-sm ${
                        activeTab === "comparison"
                          ? "bg-primary-600 text-white"
                          : "text-gray-600 hover:text-gray-900"
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
              {activeTab === "test" && (
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
                        selectedDataset={selectedDataset}
                      />

                      {/* Tool Execution Settings */}
                      {areToolsAvailable() && (
                        <ToolExecutionSettings
                          useToolsEnabled={useToolsEnabled}
                          onUseToolsToggle={handleUseToolsToggle}
                          maxIterations={maxIterations}
                          onMaxIterationsChange={handleMaxIterationsChange}
                          determinismEnabled={determinismEnabled}
                          onDeterminismToggle={handleDeterminismToggle}
                          isExecuting={isLoading || isToolExecuting}
                          isToolsAvailable={areToolsAvailable()}
                        />
                      )}

                      {/* Advanced Options - only show if there are options to display */}
                      {(!areToolsAvailable() ||
                        !useToolsEnabled ||
                        conflictMessage ||
                        hasFormState()) && (
                        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
                          {/* Determinism Evaluation Toggle - only show when tools are not available or not enabled */}
                          {(!areToolsAvailable() || !useToolsEnabled) && (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <svg
                                  className="w-5 h-5 text-primary-600"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                                  />
                                </svg>
                                <div>
                                  <h3 className="text-sm font-medium text-gray-900">
                                    Determinism Evaluation
                                  </h3>
                                  <p className="text-xs text-gray-500">
                                    Analyze response consistency across multiple
                                    runs
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() =>
                                  handleDeterminismToggle(!determinismEnabled)
                                }
                                disabled={isLoading}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                                  determinismEnabled
                                    ? "bg-primary-600"
                                    : "bg-gray-200"
                                } ${
                                  isLoading
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    determinismEnabled
                                      ? "translate-x-5"
                                      : "translate-x-0"
                                  }`}
                                />
                              </button>
                            </div>
                          )}

                          {/* Conflict message */}
                          {conflictMessage && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                              <div className="flex items-center space-x-2">
                                <svg
                                  className="h-5 w-5 text-yellow-600"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z"
                                  />
                                </svg>
                                <span className="text-sm text-yellow-800">
                                  {conflictMessage}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Streaming Toggle */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <svg
                                className="w-5 h-5 text-primary-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M13 10V3L4 14h7v7l9-11h-7z"
                                />
                              </svg>
                              <div>
                                <h3 className="text-sm font-medium text-gray-900">
                                  Streaming Response
                                </h3>
                                <p className="text-xs text-gray-500">
                                  Show response as it's generated in real-time
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                setStreamingEnabled(!streamingEnabled)
                              }
                              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                                streamingEnabled
                                  ? "bg-primary-600"
                                  : "bg-gray-200"
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  streamingEnabled
                                    ? "translate-x-5"
                                    : "translate-x-0"
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
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H8a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                                <span>Clear saved settings</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

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

                                {/* Enhanced user guidance for dual prompt requirements */}
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
                                      <span>Dual Prompt Guide</span>
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

                      {/* Tool Execution Monitor */}
                      {isToolExecuting && (
                        <div className="mb-6">
                          <ToolExecutionMonitor
                            currentIteration={
                              toolExecutionService.isInitialized &&
                              toolExecutionId
                                ? toolExecutionService.getExecutionStatus(
                                    toolExecutionId
                                  )?.currentIteration || 0
                                : 0
                            }
                            maxIterations={maxIterations}
                            activeTools={
                              toolExecutionService.isInitialized &&
                              toolExecutionId
                                ? toolExecutionService.getExecutionStatus(
                                    toolExecutionId
                                  )?.activeTools || []
                                : []
                            }
                            executionStatus={toolExecutionStatus}
                            onCancel={cancelToolExecution}
                          />
                        </div>
                      )}

                      <div className="flex justify-center">
                        <button
                          onClick={handleRunTest}
                          disabled={isLoading || !isFormValid()}
                          className={`btn-primary px-8 py-3 text-lg transition-all duration-200 ${
                            isLoading || !isFormValid()
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:shadow-lg"
                          }`}
                        >
                          {isLoading ? (
                            <LoadingSpinner
                              size="sm"
                              color="white"
                              text="Running Test..."
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
                        determinismEnabled={determinismEnabled}
                        shouldStartDeterminismEvaluation={
                          shouldStartDeterminismEvaluation
                        }
                        onEvaluationComplete={async (grade) => {
                          // Handle determinism evaluation completion
                          if (testResults && grade) {
                            try {
                              // fileService is now statically imported
                              const saved =
                                await fileService.saveDeterminismEvaluation(
                                  testResults.id,
                                  grade
                                );

                              if (saved) {
                                // Update the current test results to include the grade
                                setTestResults((prev) => ({
                                  ...prev,
                                  determinismGrade: grade,
                                }));
                              }
                            } catch (error) {
                              console.error(
                                "Failed to save determinism evaluation:",
                                error
                              );
                            }
                          } else {
                            console.warn(
                              "Cannot save determinism evaluation - missing testResults or grade:",
                              { testResults: !!testResults, grade: !!grade }
                            );
                          }
                        }}
                        isStreaming={isStreaming}
                        streamingContent={streamingContent}
                        streamingProgress={streamingProgress}
                        streamingError={streamingError}
                        streamingToolUsage={streamingToolUsage}
                        // Tool execution workflow props
                        toolExecutionEnabled={
                          testResults?.toolExecutionEnabled || false
                        }
                        workflowData={
                          testResults?.workflowData?.workflow || null
                        }
                        isToolExecuting={toolExecutionStatus === "executing"}
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

              {/* Floating Settings Button */}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="fixed bottom-4 right-4 bg-primary-600 hover:bg-primary-700 text-white p-3 rounded-full shadow-lg transition-colors z-40"
                title="Settings (Ctrl/Cmd + ,)"
                aria-label="Open settings"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>

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

          {/* UI Error Notification System */}
          <UIErrorNotification />

          {/* Floating Chad Companion */}
          <FloatingChad
            isVisible={isChadRevealed}
            currentState={
              error || streamingError
                ? 'error'
                : isLoading || isStreaming || isRequestPending
                ? isStreaming && streamingContent
                  ? 'talking'
                  : 'thinking'
                : 'idle'
            }
            size="lg"
            position={{ top: '50%', left: '20px', transform: 'translateY(-50%)' }}
          />

          {/* Settings Dialog */}
          <SettingsDialog
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            onSave={(settings) => {
              // Settings are automatically saved by the SettingsService
              // This callback is for any additional actions needed
            }}
          />

          {/* Notification Container */}
          <NotificationContainer
            position="top"
            maxVisible={3}
          />
        </BrowserCompatibility>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
