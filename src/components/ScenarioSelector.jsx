import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import HelpTooltip from './HelpTooltip';
import ScenarioErrorDisplay from './ScenarioErrorDisplay';
import ScenarioValidationDisplay from './ScenarioValidationDisplay';

import CacheManager from './CacheManager'
import { scenarioService } from '../services/scenarioService.js';
import { analyzeError } from '../utils/errorHandling.js';

const ScenarioSelector = ({ selectedScenario, onScenarioSelect, validationError, onCreateScenario, onRefreshSeedData, isCollapsed, onToggleCollapse, onGuardrailToggle }) => {
  const [scenarios, setScenarios] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scenarioMetadata, setScenarioMetadata] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [recoveryAttempts, setRecoveryAttempts] = useState(new Map());
  const [isRefreshingSeedData, setIsRefreshingSeedData] = useState(false);
  const [guardrailsCollapsed, setGuardrailsCollapsed] = useState(false);
  const [currentScenario, setCurrentScenario] = useState(null);

  useEffect(() => {
    loadAvailableScenarios();
  }, []);

  // Load scenario metadata when selection changes
  useEffect(() => {
    if (selectedScenario) {
      loadScenarioMetadata(selectedScenario);
    } else {
      setScenarioMetadata(null);
    }
  }, [selectedScenario]);

  useEffect(() => {
    if (selectedScenario && scenarioService.isInitialized) {
      loadScenarioMetadata(selectedScenario);
    }
  }, [scenarioService.isInitialized]);

  const loadAvailableScenarios = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Wait for scenario service to be initialized (it should be initialized by App)
      let retryCount = 0;
      const maxRetries = 10;

      while (!scenarioService.isInitialized && retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retryCount++;
      }

      // If still not initialized after waiting, try to initialize it
      if (!scenarioService.isInitialized) {
        const initResult = await scenarioService.initialize();
        if (!initResult.success) {
          throw new Error(initResult.message || 'Failed to initialize scenario service');
        }
      }

      // Get list of available scenarios
      const scenarioList = scenarioService.getScenarioList();

      if (scenarioList.length === 0) {
        const noScenariosError = new Error('No scenarios found. Please add scenario files to the /src/scenarios/ directory.');
        const errorInfo = analyzeError(noScenariosError, {
          operation: 'loadScenarios',
          component: 'ScenarioSelector'
        });
        setError(errorInfo);
      } else {
        setScenarios(scenarioList);
      }
    } catch (err) {
      console.error('Error loading scenarios:', err);

      const errorInfo = analyzeError(err, {
        operation: 'loadScenarios',
        component: 'ScenarioSelector',
        scenarioCount: scenarios.length
      });

      setError(errorInfo);
      setScenarios([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadScenarioMetadata = async (scenarioId) => {
    try {
      const metadata = scenarioService.getScenarioMetadata(scenarioId);
      setScenarioMetadata(metadata);

      // Also validate the scenario if it's loaded
      const scenario = await scenarioService.getScenario(scenarioId);
      if (scenario) {
        setCurrentScenario(scenario);
        const validation = await scenarioService.validateScenarioWithEnhancedErrors(scenario, {
          validateFiles: false // Skip file validation for UI performance
        });
        setValidationResult(validation);
      } else {
        setCurrentScenario(null);
        setValidationResult(null);
      }
    } catch (err) {
      console.error('Error loading scenario metadata:', err);

      const errorInfo = analyzeError(err, {
        operation: 'loadMetadata',
        scenarioId,
        component: 'ScenarioSelector'
      });

      // Store metadata loading error but don't show it prominently
      setScenarioMetadata({
        id: scenarioId,
        name: 'Error Loading Scenario',
        description: `Failed to load scenario metadata: ${err.message}`,
        hasError: true,
        errorInfo
      });
      setCurrentScenario(null);
      setValidationResult(null);
    }
  };

  const handleScenarioChange = async (scenarioId) => {
    if (!scenarioId) {
      onScenarioSelect('');
      setScenarioMetadata(null);
      setValidationResult(null);
      setCurrentScenario(null);
      return;
    }

    try {
      // Set the current scenario in the service
      const success = await scenarioService.setCurrentScenario(scenarioId);

      if (success) {
        onScenarioSelect(scenarioId);
        // Metadata will be loaded by useEffect
      } else {
        const loadError = new Error(`Failed to load scenario: ${scenarioId}`);
        const errorInfo = analyzeError(loadError, {
          operation: 'selectScenario',
          scenarioId,
          component: 'ScenarioSelector'
        });
        setError(errorInfo);
      }
    } catch (err) {
      console.error('Error selecting scenario:', err);

      const errorInfo = analyzeError(err, {
        operation: 'selectScenario',
        scenarioId,
        component: 'ScenarioSelector'
      });

      setError(errorInfo);
    }
  };

  const handleReloadScenarios = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const reloadResult = await scenarioService.reloadScenarios();

      if (reloadResult.success) {
        const scenarioList = await scenarioService.getScenarioList();
        setScenarios(scenarioList);

        // Clear current selection if it no longer exists
        if (selectedScenario && !scenarioList.some(s => s.id === selectedScenario)) {
          onScenarioSelect('');
          setScenarioMetadata(null);
          setValidationResult(null);
          setCurrentScenario(null);
        }


      } else {
        const reloadError = new Error(reloadResult.message || 'Failed to reload scenarios');
        const errorInfo = analyzeError(reloadError, {
          operation: 'reloadScenarios',
          component: 'ScenarioSelector',
          reloadResult
        });
        setError(errorInfo);
      }
    } catch (err) {
      console.error('Error reloading scenarios:', err);

      const errorInfo = analyzeError(err, {
        operation: 'reloadScenarios',
        component: 'ScenarioSelector'
      });

      setError(errorInfo);
    } finally {
      setIsLoading(false);
    }
  };

  const handleErrorRecovery = async (scenarioId, error) => {
    const attemptKey = `${scenarioId}-${error.type}`;

    // Prevent multiple recovery attempts for the same error
    if (recoveryAttempts.has(attemptKey)) {
      return;
    }

    try {
      const recoveryResult = await scenarioService.attemptErrorRecovery(scenarioId, error, {
        enableFallback: true,
        createPlaceholder: true,
        logRecovery: true
      });

      if (recoveryResult.success) {
        // Mark recovery attempt
        setRecoveryAttempts(prev => new Map(prev).set(attemptKey, true));

        // Update error with recovery information
        setError({
          ...error,
          recovered: true,
          recoveryMethod: recoveryResult.method,
          recoveryWarnings: recoveryResult.warnings
        });

        // Reload scenarios to reflect recovery
        await loadAvailableScenarios();
      }
    } catch (recoveryError) {
      console.error(`[ScenarioSelector] Recovery attempt failed:`, recoveryError);
    }
  };

  const handleValidationFix = async (errorKey, errorData) => {
    if (!selectedScenario || !errorData.fixable) {
      return;
    }

    try {
      // This would typically call a service method to fix the validation error
      // Reload metadata after fix attempt
      await loadScenarioMetadata(selectedScenario);
    } catch (error) {
      console.error('Failed to fix validation error:', error);
    }
  };

  const handleRetry = async () => {
    setError(null);
    await loadAvailableScenarios();
  };

  const handleDismissError = () => {
    setError(null);
  };

  const handleRefreshSeedData = async () => {
    if (!selectedScenario || !scenarioMetadata?.hasSeedData) return;

    setIsRefreshingSeedData(true);
    try {
      if (onRefreshSeedData) {
        // Use the provided refresh handler
        await onRefreshSeedData(selectedScenario);
      } else {
        // Fallback: simulate a refresh operation
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Reload scenario metadata after refresh
      await loadScenarioMetadata(selectedScenario);
    } catch (error) {
      const errorInfo = analyzeError(error, {
        operation: 'refreshSeedData',
        scenarioId: selectedScenario,
        component: 'ScenarioSelector'
      });
      setError(errorInfo);
    } finally {
      setIsRefreshingSeedData(false);
    }
  };

  return (
    <div className="card">
      <div className={`flex items-center justify-between ${isCollapsed ? 'mb-0' : 'mb-4'}`}>
        <div className="flex items-center space-x-2">
          <button
            onClick={onToggleCollapse}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleCollapse();
              }
            }}
            className="collapsible-toggle-button group"
            aria-expanded={!isCollapsed}
            aria-controls="scenario-selector-content"
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} scenario selection section`}
          >
            <svg
              className={`collapsible-chevron ${
                isCollapsed ? 'collapsed' : 'expanded'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <span id="scenario-selector-header">Select Scenario</span>
          </button>
          {!isCollapsed && (
            <HelpTooltip
              content="Choose a pre-configured scenario that includes datasets, prompts, and tools for specific use cases. Scenarios are stored in the /src/scenarios/ directory."
              position="right"
            />
          )}
        </div>
        <div className="flex items-center space-x-3 min-w-0">
          {isCollapsed && selectedScenario && (
            <span className="text-sm text-gray-500 truncate max-w-[220px] sm:max-w-[280px]">
              {(() => {
                const s = scenarios.find(s => s.id === selectedScenario);
                return s ? s.name : selectedScenario;
              })()}
            </span>
          )}
          {!isCollapsed && onCreateScenario && (
            <button
              onClick={onCreateScenario}
              className="text-sm text-secondary-600 hover:text-secondary-700 font-medium flex items-center space-x-1"
              title="Create new scenario"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Create</span>
            </button>
          )}
          {!isCollapsed && (
            <button
              onClick={handleReloadScenarios}
              disabled={isLoading}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
              title="Reload scenarios from disk"
            >
              {isLoading ? 'Reloading...' : 'Reload'}
            </button>
          )}
        </div>
      </div>

      <div
        id="scenario-selector-content"
        className={`collapsible-content ${
          isCollapsed ? 'collapsed' : 'expanded'
        }`}
        role="region"
        aria-labelledby="scenario-selector-header"
        aria-hidden={isCollapsed}
      >
        <div className="space-y-4">
          {error && (
            <div>
              <ScenarioErrorDisplay
                error={error}
                scenarioId={selectedScenario}
                onRetry={handleRetry}
                onDismiss={handleDismissError}
                onRecovery={handleErrorRecovery}
                showDiagnostics={import.meta.env.DEV}
              />
            </div>
          )}

          <div className="space-y-4">
            {/* Scenario Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="scenario-select" className="block text-sm font-medium text-gray-700">
                  Available Scenarios
                  {isLoading && (
                    <span className="ml-2 text-xs text-blue-600">Loading scenarios...</span>
                  )}
                </label>
                {scenarioMetadata?.hasSeedData && (
                  <button
                    onClick={handleRefreshSeedData}
                    disabled={isRefreshingSeedData}
                    className="text-primary-600 hover:text-primary-700 disabled:opacity-50 transition-colors"
                    title="Refresh seed data"
                  >
                    <svg className={`w-4 h-4 ${isRefreshingSeedData ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
              </div>
              <select
                id="scenario-select"
                value={selectedScenario || ''}
                onChange={(e) => handleScenarioChange(e.target.value)}
                className={`select-field ${validationError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
                  }`}
                disabled={isLoading}
              >
                <option value="">
                  {isLoading ? 'Loading scenarios...' : 'Choose a scenario...'}
                </option>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
              </select>
              {isLoading && (
                <div className="mt-2 flex items-center text-sm text-blue-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Scanning scenarios directory...
                </div>
              )}
            </div>

            {/* Simplified Scenario Information - Only show tools when available */}
            {scenarioMetadata && !scenarioMetadata.hasError && (
              <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Scenario Information</h4>

            {/* Only show tools if available */}
            {scenarioMetadata.hasTools && scenarioMetadata.toolNames && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-600 font-medium">
                  Available Tools:
                  <CacheManager compact />
                </div>
                <ul className="text-xs text-gray-700 space-y-1">
                  {scenarioMetadata.toolNames.map(toolName => (
                    <li key={toolName} className="flex items-center space-x-2">
                      <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                      <span>{toolName}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

            {/* Scenario Metadata Error */}
            {scenarioMetadata?.hasError && (
              <div className="mt-4">
                <ScenarioErrorDisplay
                  error={scenarioMetadata.errorInfo}
                  scenarioId={selectedScenario}
                  onRetry={() => loadScenarioMetadata(selectedScenario)}
                  onRecovery={handleErrorRecovery}
                />
              </div>
            )}

            {/* Validation Results */}
            {validationResult && (
              <div className="mt-4">
                <ScenarioValidationDisplay
                  validation={validationResult}
                  scenarioId={selectedScenario}
                  onFix={handleValidationFix}
                  showDetails={import.meta.env.DEV}
                />
              </div>
            )}

            {/* Guardrails Section */}

          </div>

          {/* Validation Error */}
          {validationError && (
            <p className="mt-1 text-sm text-red-600">{validationError}</p>
          )}
        </div>
      </div>
    </div>
  );
};

ScenarioSelector.propTypes = {
  selectedScenario: PropTypes.string,
  onScenarioSelect: PropTypes.func.isRequired,
  validationError: PropTypes.string,
  onCreateScenario: PropTypes.func,
  onRefreshSeedData: PropTypes.func,
  isCollapsed: PropTypes.bool,
  onToggleCollapse: PropTypes.func,
  onGuardrailToggle: PropTypes.func
};

ScenarioSelector.defaultProps = {
  selectedScenario: '',
  validationError: null,
  onCreateScenario: null,
  onRefreshSeedData: null,
  isCollapsed: false,
  onToggleCollapse: null,
  onGuardrailToggle: null
};

export default ScenarioSelector;
