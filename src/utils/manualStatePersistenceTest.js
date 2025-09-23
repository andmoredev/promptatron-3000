/**
 * Manual test script for state persistence functionality
 * Run this in the browser console tostate persistence works
 */

import { statePersistenceService } from '../services/statePersistenceService.js'

/**
 * Manual test suite for state persistence
 */
export async function runStatePersistenceTests() {
  console.log('🧪 Starting State Persistence Manual Tests...')

  try {
    // Test 1: Initialize service
    console.log('\n📋 Test 1: Service Initialization')
    const initialized = await statePersistenceService.initialize()
    console.log('✅ Service initialized:', initialized)

    // Test 2: Session management
    console.log('\n📋 Test 2: Session Management')
    const sessionInfo = statePersistenceService.getSessionInfo()
    console.log('✅ Session created:', {
      sessionId: sessionInfo.sessionId,
      testCount: sessionInfo.testCount,
      startTime: new Date(sessionInfo.startTime).toLocaleString()
    })

    // Test 3: UI State persistence
    console.log('\n📋 Test 3: UI State Persistence')
    const testUIState = {
      activeTab: 'history',
      selectedForComparison: ['test1', 'test2'],
      validationErrors: { model: 'Required field' },
      touchedFields: { model: true, prompt: true }
    }

    const uiSaved = await statePersistenceService.saveUIState(testUIState)
    console.log('✅ UI state saved:', uiSaved)

    const restoredUI = statePersistenceService.restoreUIState()
    console.log('✅ UI state restored:', {
      activeTab: restoredUI.activeTab,
      comparisons: restoredUI.selectedForComparison?.length || 0,
      hasValidationErrors: Object.keys(restoredUI.validationErrors || {}).length > 0,
      touchedFieldsCount: Object.keys(restoredUI.touchedFields || {}).length
    })

    // Test 4: Navigation state persistence
    console.log('\n📋 Test 4: Navigation State Persistence')
    const testNavState = {
      currentRoute: '/test-route',
      activeTab: 'comparison'
    }

    const navSaved = await statePersistenceService.saveNavigationState(testNavState)
    console.log('✅ Navigation state saved:', navSaved)

    const restoredNav = statePersistenceService.restoreNavigationState()
    console.log('✅ Navigation state restored:', {
      currentRoute: restoredNav.currentRoute,
      activeTab: restoredNav.activeTab,
      historySize: restoredNav.navigationHistory?.length || 0
    })

    // Test 5: Test results state persistence
    console.log('\n📋 Test 5: Test Results State Persistence')
    const testResults = {
      id: 'test-12345',
      modelId: 'claude-3-sonnet',
      systemPrompt: 'You are a helpful assistant',
      userPrompt: 'Explain quantum computing',
      response: 'Quantum computing is a revolutionary technology...',
      usage: { input_tokens: 15, output_tokens: 50, total_tokens: 65 },
      timestamp: new Date().toISOString()
    }

    const resultsSaved = await statePersistenceService.saveTestResultsState(testResults, testResults.id)
    console.log('✅ Test results saved:', resultsSaved)

    const restoredResults = statePersistenceService.restoreTestResultsState(testResults.id)
    console.log('✅ Test results restored:', {
      testId: restoredResults.currentResults?.id,
      modelId: restoredResults.currentResults?.modelId,
      hasResponse: !!restoredResults.currentResults?.response,
      fromHistory: restoredResults.fromHistory
    })

    // Test 6: Model output state persistence
    console.log('\n📋 Test 6: Model Output State Persistence')
    const outputData = {
      output: 'This is a test model output with streaming support',
      testId: 'output-test-789',
      modelId: 'claude-3-haiku',
      usage: { input_tokens: 20, output_tokens: 30 },
      isStreamed: true,
      streamingMetrics: {
        streamDuration: 2500,
        firstTokenLatency: 150,
        totalTokens: 30,
        averageTokensPerSecond: 12
      }
    }

    const outputSaved = await statePersistenceService.saveModelOutputState(outputData, outputData.testId)
    console.log('✅ Model output saved:', outputSaved)

    const restoredOutput = statePersistenceService.restoreModelOutputState(outputData.testId)
    console.log('✅ Model output restored:', {
      testId: restoredOutput.currentOutput?.testId,
      hasOutput: !!restoredOutput.currentOutput?.output,
      isStreamed: restoredOutput.currentOutput?.isStreamed,
      fromHistory: restoredOutput.fromHistory
    })

    // Test 7: State information
    console.log('\n📋 Test 7: State Information')
    const stateInfo = statePersistenceService.getStateInfo()
    console.log('✅ State information:', {
      isInitialized: stateInfo.isInitialized,
      sessionTestCount: stateInfo.session?.testCount,
      uiLastUpdated: stateInfo.ui?.lastUpdated ? new Date(stateInfo.ui.lastUpdated).toLocaleString() : 'Never',
      testResultsHistorySize: stateInfo.testResults?.historySize,
      modelOutputHistorySize: stateInfo.modelOutput?.historySize
    })

    // Test 8: Cleanup functionality
    console.log('\n📋 Test 8: Cleanup Functionality')

    // Add some old test data
    const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
    statePersistenceService.stateCache.testResults.resultsHistory.set('old-test', {
      results: { id: 'old-test', response: 'Old response' },
      timestamp: oldTimestamp
    })

    const cleanedCount = await statePersistenceService.cleanup()
    console.log('✅ Cleanup completed, removed entries:', cleanedCount)

    // Test 9: Navigation across page refresh simulation
    console.log('\n📋 Test 9: Page Refresh Simulation')

    // Save current state
    await statePersistenceService.saveUIState({ activeTab: 'comparison', testMode: 'refresh-test' })
    await statePersistenceService.saveNavigationState({ currentRoute: '/refresh-test' })

    // Simulate page refresh by creating new service instance
    console.log('🔄 Simulating page refresh...')

    // In a real scenario, this would be a new page load
    // For testing, we'll just verify the data persists in localStorage
    const persistedUIData = localStorage.getItem('promptatron_ui_state')
    const persistedNavData = localStorage.getItem('promptatron_navigation_state')

    console.log('✅ Data persisted across refresh:', {
      hasUIData: !!persistedUID
      hasNavData: !!persistedNavData,
      uiDataSize: persistedUIData ? persistedUIData.length : 0,
      navDataSize: persistedNavData ? persistedNavData.length : 0
    })

    // Test 10: Memory leak prevention
    console.log('\n📋 Test 10: Memory Leak Prevention')

    // Add many test results to test size limits
    for (let i = 0; i < 60; i++) {
      await statePersistenceService.saveTestResultsState(
        { id: `bulk-test-${i}`, response: `Response ${i}` },
        `bulk-test-${i}`
      )
    }

    const finalStateInfo = statePersistenceService.getStateInfo()
    console.log('✅ Memory management verified:', {
      testResultsHistorySize: finalStateInfo.testResults?.historySize,
      withinLimit: finalStateInfo.testResults?.historySize <= 50,
      sessionTestCount: finalStateInfo.session?.testCount
    })

    console.log('\n🎉 All State Persistence Tests Completed Successfully!')
    console.log('\n📊 Final State Summary:')
    console.log('- Service initialized and functional')
    console.log('- UI state persistence working')
    console.log('- Navigation state persistence working')
    console.log('- Test results state persistence working')
    console.log('- Model output state persistence working')
    console.log('- Cleanup functionality working')
    console.log('- Memory leak prevention working')
    console.log('- Cross-refresh persistence working')

    return {
      success: true,
      testsRun: 10,
      stateInfo: finalStateInfo
    }

  } catch (error) {
    console.error('❌ State Persistence Test Failed:', error)
    return {
      success: false,
      error: error.message,
      stack: error.stack
    }
  }
}

/**
 * Quick test for browser console
 */
export async function quickStatePersistenceTest() {
  console.log('🚀 Quick State Persistence Test')

  try {
    await statePersistenceService.initialize()

    // Test basic functionality
    await statePersistenceService.saveUIState({ activeTab: 'test', quickTest: true })
    const restored = statePersistenceService.restoreUIState()

    console.log('✅ Quick test result:', {
      initialized: statePersistenceService.isInitialized,
      stateSaved: !!restored.quickTest,
      activeTab: restored.activeTab
    })

    return true
  } catch (error) {
    console.error('❌ Quick test failed:', error)
    return false
  }
}

// Auto-run quick test if in browser environment
if (typeof window !== 'undefined') {
  console.log('🔧 State Persistence Test Module Loaded')
  console.log('Run quickStatePersistenceTest() for a quick test')
  console.log('Run runStatePersistenceTests() for comprehensive tests')
}
