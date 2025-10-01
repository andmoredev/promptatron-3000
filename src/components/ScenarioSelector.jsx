import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import HelpTooltip from './HelpTooltip'
import ScenarioErrorDisplay from './ScenarioErrorDisplay'
import ScenarioValidationDisplay from './ScenarioValidationDisplay'
import { scenarioService } from '../services/scenarioService.js'
import { analyzeError } from '../utils/errorHandling.js'

const ScenarioSelector = ({ selectedScenario, onScenarioSelect, validationError, onCreateScenario }) => {
  const [scenarios, setScenarios] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [scenarioMetadata, setScenarioMetadata] = useState(null)
  const [validationResult, setValidationResult] = useState(null)
  const [recoveryAttempts, setRecoveryAttempts] = useState(new Map())

  useEffect(() => {
    loadAvailableScenarios()
  }, [])

  // Load scenario metadata when selection changes
  useEffect(() => {
    if (selectedScenario) {
      loadScenarioMetadata(selectedScenario)
    } else {
      setScenarioMetadata(null)
    }
  }, [selectedScenario])

  const loadAvailableScenarios = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Initialize scenario service if not already done
      if (!scenarioService.isInitialized) {
        const initResult = await scenarioService.initialize()
        if (!initResult.success) {
          throw new Error(initResult.message || 'Failed to initialize scenario service')
        }

        // Check for initialization warnings
        if (initResult.errors && initResult.errors.length > 0) {
          console.warn('Scenario service initialized with errors:', initResult.errors)
        }
      }

      // Get list of available scenarios
      const scenarioList = await scenarioService.getScenarioList()

      if (scenarioList.length === 0) {
        const noScenariosError = new Error('No scenarios found. Please add scenario files to the /public/scenarios/ directory.')
        const errorInfo = analyzeError(noScenariosError, {
          operation: 'loadScenarios',
          component: 'ScenarioSelector'
        })
        setError(errorInfo)
      } else {
        setScenarios(scenarioList)

        // Log successful load
        console.log(`[ScenarioSelector] Loaded ${scenarioList.length} scenarios successfully`)
      }
    } catch (err) {
      console.error('Error loading scenarios:', err)

      const errorInfo = analyzeError(err, {
        operation: 'loadScenarios',
        component: 'ScenarioSelector',
        scenarioCount: scenarios.length
      })

      setError(errorInfo)
      setScenarios([])
    } finally {
      setIsLoading(false)
    }
  }

  const loadScenarioMetadata = async (scenarioId) => {
    try {
      const metadata = scenarioService.getScenarioMetadata(scenarioId)
      setScenarioMetadata(metadata)

      // Also validate the scenario if it's loaded
      const scenario = await scenarioService.getScenario(scenarioId)
      if (scenario) {
        const validation = await scenarioService.validateScenarioWithEnhancedErrors(scenario, {
          validateFiles: false // Skip file validation for UI performance
        })
        setValidationResult(validation)
      } else {
        setValidationResult(null)
      }
    } catch (err) {
      console.error('Error loading scenario metadata:', err)

      const errorInfo = analyzeError(err, {
        operation: 'loadMetadata',
        scenarioId,
        component: 'ScenarioSelector'
      })

      // Store metadata loading error but don't show it prominently
      setScenarioMetadata({
        id: scenarioId,
        name: 'Error Loading Scenario',
        description: `Failed to load scenario metadata: ${err.message}`,
        hasError: true,
        errorInfo
      })
      setValidationResult(null)
    }
  }

  const handleScenarioChange = async (scenarioId) => {
    if (!scenarioId) {
      onScenarioSelect('')
      setScenarioMetadata(null)
      setValidationResult(null)
      return
    }

    try {
      // Set the current scenario in the service
      const success = await scenarioService.setCurrentScenario(scenarioId)

      if (success) {
        onScenarioSelect(scenarioId)
        // Metadata will be loaded by useEffect
      } else {
        const loadError = new Error(`Failed to load scenario: ${scenarioId}`)
        const errorInfo = analyzeError(loadError, {
          operation: 'selectScenario',
          scenarioId,
          component: 'ScenarioSelector'
        })
        setError(errorInfo)
      }
    } catch (err) {
      console.error('Error selecting scenario:', err)

      const errorInfo = analyzeError(err, {
        operation: 'selectScenario',
        scenarioId,
        component: 'ScenarioSelector'
      })

      setError(errorInfo)
    }
  }

  const handleReloadScenarios = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const reloadResult = await scenarioService.reloadScenarios()

      if (reloadResult.success) {
        const scenarioList = await scenarioService.getScenarioList()
        setScenarios(scenarioList)

        // Clear current selection if it no longer exists
        if (selectedScenario && !scenarioList.some(s => s.id === selectedScenario)) {
          onScenarioSelect('')
          setScenarioMetadata(null)
          setValidationResult(null)
        }

        console.log(`[ScenarioSelector] Reloaded ${scenarioList.length} scenarios`)
      } else {
        const reloadError = new Error(reloadResult.message || 'Failed to reload scenarios')
        const errorInfo = analyzeError(reloadError, {
          operation: 'reloadScenarios',
          component: 'ScenarioSelector',
          reloadResult
        })
        setError(errorInfo)
      }
    } catch (err) {
      console.error('Error reloading scenarios:', err)

      const errorInfo = analyzeError(err, {
        operation: 'reloadScenarios',
        component: 'ScenarioSelector'
      })

      setError(errorInfo)
    } finally {
      setIsLoading(false)
    }
  }

  const handleErrorRecovery = async (scenarioId, error) => {
    const attemptKey = `${scenarioId}-${error.type}`

    // Prevent multiple recovery attempts for the same error
    if (recoveryAttempts.has(attemptKey)) {
      console.log(`[ScenarioSelector] Recovery already attempted for ${scenarioId}`)
      return
    }

    try {
      console.log(`[ScenarioSelector] Attempting error recovery for ${scenarioId}`)

      const recoveryResult = await scenarioService.attemptErrorRecovery(scenarioId, error, {
        enableFallback: true,
        createPlaceholder: true,
        logRecovery: true
      })

      if (recoveryResult.success) {
        // Mark recovery attempt
        setRecoveryAttempts(prev => new Map(prev).set(attemptKey, true))

        // Update error with recovery information
        setError({
          ...error,
          recovered: true,
          recoveryMethod: recoveryResult.method,
          recoveryWarnings: recoveryResult.warnings
        })

        // Reload scenarios to reflect recovery
        await loadAvailableScenarios()

        console.log(`[ScenarioSelector] Recovery successful for ${scenarioId}:`, recoveryResult.method)
      } else {
        console.error(`[ScenarioSelector] Recovery failed for ${scenarioId}:`, recoveryResult.errors)
      }
    } catch (recoveryError) {
      console.error(`[ScenarioSelector] Recovery attempt failed:`, recoveryError)
    }
  }

  const handleValidationFix = async (errorKey, errorData) => {
    if (!selectedScenario || !errorData.fixable) {
      return
    }

    try {
      console.log(`[ScenarioSelector] Attempting to fix validation error: ${errorKey}`)

      // This would typically call a service method to fix the validation error
      // For now, we'll just log the attempt
      console.log('Fix attempt for:', { errorKey, errorData, scenarioId: selectedScenario })

      // Reload metadata after fix attempt
      await loadScenarioMetadata(selectedScenario)
    } catch (error) {
      console.error('Failed to fix validation error:', error)
    }
  }

  const handleRetry = async () => {
    setError(null)
    await loadAvailableScenarios()
  }

  const handleDismissError = () => {
    setError(null)
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold text-gray-900">Select Scenario</h3>
          <HelpTooltip
            content="Choose a pre-configured scenario that includes datasets, prompts, and tools for specific use cases. Scenarios are stored in the /public/scenarios/ directory."
            position="right"
          />
        </div>
        <div className="flex items-center space-x-3">
          {onCreateScenario && (
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
          <button
            onClick={handleReloadScenarios}
            disabled={isLoading}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
            title="Reload scenarios from disk"
          >
            {isLoading ? 'Reloading...' : 'Reload'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4">
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
          <label htmlFor="scenario-select" className="block text-sm font-medium text-gray-700 mb-2">
            Available Scenarios
            {isLoading && (
              <span className="ml-2 text-xs text-blue-600">Loading scenarios...</span>
            )}
          </label>
          <select
            id="scenario-select"
            value={selectedScenario || ''}
            onChange={(e) => handleScenarioChange(e.target.value)}
            className={`select-field ${
              validationError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
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

        {/* Scenario Description and Metadata */}
        {scenarioMetadata && !scenarioMetadata.hasError && (
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-2">{scenarioMetadata.name}</h4>
            <p className="text-sm text-gray-700 mb-3">{scenarioMetadata.description}</p>

            {/* Scenario Capabilities Summary */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    scenarioMetadata.hasDatasets ? 'bg-green-400' : 'bg-gray-300'
                  }`}></span>
                  <span className="text-gray-600">
                    {scenarioMetadata.hasDatasets
                      ? `${scenarioMetadata.datasetCount} dataset${scenarioMetadata.datasetCount !== 1 ? 's' : ''}`
                      : 'No datasets'
                    }
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    scenarioMetadata.hasSystemPrompts ? 'bg-green-400' : 'bg-gray-300'
                  }`}></span>
                  <span className="text-gray-600">
                    {scenarioMetadata.hasSystemPrompts
                      ? `${scenarioMetadata.systemPromptCount} system prompt${scenarioMetadata.systemPromptCount !== 1 ? 's' : ''}`
                      : 'No system prompts'
                    }
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    scenarioMetadata.hasUserPrompts ? 'bg-green-400' : 'bg-gray-300'
                  }`}></span>
                  <span className="text-gray-600">
                    {scenarioMetadata.hasUserPrompts
                      ? `${scenarioMetadata.userPromptCount} user prompt${scenarioMetadata.userPromptCount !== 1 ? 's' : ''}`
                      : 'No user prompts'
                    }
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    scenarioMetadata.hasTools ? 'bg-green-400' : 'bg-gray-300'
                  }`}></span>
                  <span className="text-gray-600">
                    {scenarioMetadata.hasTools
                      ? `${scenarioMetadata.toolCount} tool${scenarioMetadata.toolCount !== 1 ? 's' : ''}`
                      : 'No tools'
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Tools Information - Enhanced display when tools are available */}
            {scenarioMetadata.hasTools && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <svg className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h5 className="text-xs font-medium text-blue-800 mb-1">Scenario Tools Available</h5>
                    <p className="text-xs text-blue-700">
                      {scenarioMetadata.toolCount} tool{scenarioMetadata.toolCount !== 1 ? 's' : ''} configured for enhanced AI capabilities
                    </p>
                  </div>
                </div>
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
      </div>

      {/* Validation Error */}
      {validationError && (
        <p className="mt-1 text-sm text-red-600">{validationError}</p>
      )}
    </div>
  )
}

ScenarioSelector.propTypes = {
  selectedScenario: PropTypes.string,
  onScenarioSelect: PropTypes.func.isRequired,
  validationError: PropTypes.string,
  onCreateScenario: PropTypes.func
}

ScenarioSelector.defaultProps = {
  selectedScenario: '',
  validationError: null,
  onCreateScenario: null
}

export default ScenarioSelector
