import { useState, useEffect, useCallback } from 'react'
import { scenarioService } from '../services/scenarioService.js'

/**
 * Custom hook for managing scenario-driven UI state
 * Handles dynamic component visibility based on scenario capalities
 */
export const useScenarioUI = (selectedScenario) => {
  const [uiState, setUIState] = useState({
    showDatasetSelector: false,
    showSystemPromptSelector: false,
    showUserPromptSelector: false,
    showToolSettings: false,
    allowCustomPrompts: true,
    allowDatasetModification: false,
    defaultStreamingEnabled: true,
    maxIterations: 10,
    recommendedModels: [],
    isLoading: false,
    error: null
  })

  const [scenarioCapabilities, setScenarioCapabilities] = useState({
    hasDatasets: false,
    hasSystemPrompts: false,
    hasUserPrompts: false,
    hasTools: false,
    toolExecutionMode: 'none'
  })

  // Update UI configuration when scenario changes
  useEffect(() => {
    updateUIConfiguration()
  }, [selectedScenario])

  const updateUIConfiguration = useCallback(async () => {
    if (!selectedScenario) {
      // Reset to default state when no scenario is selected
      setUIState(prev => ({
        ...prev,
        showDatasetSelector: false,
        showSystemPromptSelector: false,
        showUserPromptSelector: false,
        showToolSettings: false,
        allowCustomPrompts: true,
        allowDatasetModification: false,
        defaultStreamingEnabled: true,
        maxIterations: 10,
        recommendedModels: [],
        isLoading: false,
        error: null
      }))

      setScenarioCapabilities({
        hasDatasets: false,
        hasSystemPrompts: false,
        hasUserPrompts: false,
        hasTools: false,
        toolExecutionMode: 'none'
      })
      return
    }

    setUIState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      // Get UI configuration from scenario service
      const uiConfig = await scenarioService.getUIConfiguration(selectedScenario)

      // Get scenario metadata for capabilities
      const metadata = scenarioService.getScenarioMetadata(selectedScenario)

      // Get tool execution mode
      const toolExecutionMode = scenarioService.getToolExecutionMode(selectedScenario)

      // Update UI state
      setUIState(prev => ({
        ...prev,
        showDatasetSelector: uiConfig.showDatasetSelector,
        showSystemPromptSelector: uiConfig.showSystemPromptSelector,
        showUserPromptSelector: uiConfig.showUserPromptSelector,
        showToolSettings: uiConfig.showToolSettings,
        allowCustomPrompts: uiConfig.allowCustomPrompts,
        allowDatasetModification: uiConfig.allowDatasetModification,
        defaultStreamingEnabled: uiConfig.defaultStreamingEnabled,
        maxIterations: uiConfig.maxIterations,
        recommendedModels: uiConfig.recommendedModels,
        isLoading: false,
        error: null
      }))

      // Update scenario capabilities
      setScenarioCapabilities({
        hasDatasets: metadata?.hasDatasets || false,
        hasSystemPrompts: metadata?.hasSystemPrompts || false,
        hasUserPrompts: metadata?.hasUserPrompts || false,
        hasTools: metadata?.hasTools || false,
        toolExecutionMode: toolExecutionMode
      })

      console.log(`[useScenarioUI] Updated UI configuration for scenario: ${selectedScenario}`, {
        uiConfig,
        metadata,
        toolExecutionMode
      })

    } catch (error) {
      console.error('[useScenarioUI] Error updating UI configuration:', error)

      setUIState(prev => ({
        ...prev,
        isLoading: false,
        error: `Failed to load scenario configuration: ${error.message}`
      }))

      // Reset capabilities on error
      setScenarioCapabilities({
        hasDatasets: false,
        hasSystemPrompts: false,
        hasUserPrompts: false,
        hasTools: false,
        toolExecutionMode: 'none'
      })
    }
  }, [selectedScenario])

  // Helper function to check if a component should be visible
  const shouldShowComponent = useCallback((componentName) => {
    switch (componentName) {
      case 'datasetSelector':
        return uiState.showDatasetSelector
      case 'systemPromptSelector':
        return uiState.showSystemPromptSelector
      case 'userPromptSelector':
        return uiState.showUserPromptSelector
      case 'toolSettings':
        return uiState.showToolSettings
      default:
        return false
    }
  }, [uiState])

  // Helper function to get component visibility summary
  const getVisibilitySummary = useCallback(() => {
    return {
      datasetSelector: uiState.showDatasetSelector,
      systemPromptSelector: uiState.showSystemPromptSelector,
      userPromptSelector: uiState.showUserPromptSelector,
      toolSettings: uiState.showToolSettings,
      totalVisible: [
        uiState.showDatasetSelector,
        uiState.showSystemPromptSelector,
        uiState.showUserPromptSelector,
        uiState.showToolSettings
      ].filter(Boolean).length
    }
  }, [uiState])

  // Helper function to get scenario configuration
  const getScenarioConfiguration = useCallback(() => {
    return {
      allowCustomPrompts: uiState.allowCustomPrompts,
      allowDatasetModification: uiState.allowDatasetModification,
      defaultStreamingEnabled: uiState.defaultStreamingEnabled,
      maxIterations: uiState.maxIterations,
      recommendedModels: uiState.recommendedModels
    }
  }, [uiState])

  // Helper function to refresh UI configuration
  const refreshUIConfiguration = useCallback(async () => {
    await updateUIConfiguration()
  }, [updateUIConfiguration])

  // Debug function for development
  const debugUIState = useCallback(() => {
    const debug = {
      selectedScenario,
      uiState,
      scenarioCapabilities,
      visibilitySummary: getVisibilitySummary(),
      scenarioConfiguration: getScenarioConfiguration()
    }

    console.log('[useScenarioUI] Debug state:', debug)
    return debug
  }, [selectedScenario, uiState, scenarioCapabilities, getVisibilitySummary, getScenarioConfiguration])

  return {
    // UI state
    uiState,
    scenarioCapabilities,

    // Helper functions
    shouldShowComponent,
    getVisibilitySummary,
    getScenarioConfiguration,
    refreshUIConfiguration,

    // Loading and error states
    isLoading: uiState.isLoading,
    error: uiState.error,

    // Debug function (only in development)
    ...(import.meta.env.DEV && { debugUIState })
  }
}

export default useScenarioUI
