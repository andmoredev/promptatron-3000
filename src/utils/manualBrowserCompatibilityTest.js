/**
 * Manual test for browser compatibility functionality
 * Run this in the browser console to test compatibility detection
 */

import {
  getBrowserCompatibility,
  getServiceWorkerCompatibility,
  getStorageCompatibility,
  initializeBrowserCompatibility
} from './browserCompatibility.js'
import { unifiedStorage } from './storageUtils.js'
import { determinismCompatibility } from './determinismCompatibility.js'
import { runQuickCompatibilityCheck } from './crossBrowserTesting.js'

/**
 * Run comprehensive browser compatibility tests
 */
export async function runManualCompatibilityTest() {
  console.log('🧪 Starting manual browser compatibility test...')

  const results = {
    timestamp: new Date().toISOStng(),
    tests: [],
    summary: {
      passed: 0,
      failed: 0,
      warnings: 0
    }
  }

  // Test 1: Basic browser compatibility
  try {
    console.log('📋 Testing basic browser compatibility...')
    const browserCompat = getBrowserCompatibility()

    results.tests.push({
      name: 'Basic Browser Compatibility',
      status: 'pass',
      result: browserCompat,
      message: `Browser compatibility level: ${browserCompat.level}`
    })

    console.log('✅ Basic compatibility:', browserCompat.level)
    results.summary.passed++
  } catch (error) {
    results.tests.push({
      name: 'Basic Browser Compatibility',
      status: 'fail',
      error: error.message
    })
    console.error('❌ Basic compatibility test failed:', error)
    results.summary.failed++
  }

  // Test 2: Service Worker compatibility
  try {
    console.log('🔧 Testing Service Worker compatibility...')
    const swCompat = getServiceWorkerCompatibility()

    results.tests.push({
      name: 'Service Worker Compatibility',
      status: swCompat.supported ? 'pass' : 'warning',
      result: swCompat,
      message: swCompat.reason
    })

    if (swCompat.supported) {
      console.log('✅ Service Workers supported')
      results.summary.passed++
    } else {
      console.log('⚠️ Service Workers not supported:', swCompat.recommendation)
      results.summary.warnings++
    }
  } catch (error) {
    results.tests.push({
      name: 'Service Worker Compatibility',
      status: 'fail',
      error: error.message
    })
    console.error('❌ Service Worker test failed:', error)
    results.summary.failed++
  }

  // Test 3: Storage compatibility
  try {
    console.log('💾 Testing storage compatibility...')
    const storageCompat = getStorageCompatibility()

    results.tests.push({
      name: 'Storage Compatibility',
      status: storageCompat.hasStorage ? 'pass' : 'fail',
      result: storageCompat,
      message: `Primary storage: ${storageCompat.primaryStorage}`
    })

    if (storageCompat.hasStorage) {
      console.log('✅ Storage available:', storageCompat.primaryStorage)
      results.summary.passed++
    } else {
      console.log('❌ No storage available')
      results.summary.failed++
    }
  } catch (error) {
    results.tests.push({
      name: 'Storage Compatibility',
      status: 'fail',
      error: error.message
    })
    console.error('❌ Storage test failed:', error)
    results.summary.failed++
  }

  // Test 4: Unified storage initialization
  try {
    console.log('🗄️ Testing unified storage initialization...')
    const storageType = await unifiedStorage.initialize()

    results.tests.push({
      name: 'Unified Storage Initialization',
      status: 'pass',
      result: { storageType, info: unifiedStorage.getStorageInfo() },
      message: `Initialized with ${storageType}`
    })

    console.log('✅ Unified storage initialized:', storageType)
    results.summary.passed++
  } catch (error) {
    results.tests.push({
      name: 'Unified Storage Initialization',
      status: 'fail',
      error: error.message
    })
    console.error('❌ Unified storage test failed:', error)
    results.summary.failed++
  }

  // Test 5: Storage operations
  try {
    console.log('📝 Testing storage operations...')
    const testData = { message: 'test', timestamp: Date.now() }

    await unifiedStorage.setItem('test_store', 'test_key', testData)
    const retrieved = await unifiedStorage.getItem('test_store', 'test_key')

    if (JSON.stringify(retrieved) === JSON.stringify(testData)) {
      results.tests.push({
        name: 'Storage Operations',
        status: 'pass',
        message: 'Read/write operations successful'
      })
      console.log('✅ Storage operations working')
      results.summary.passed++
    } else {
      throw new Error('Data integrity check failed')
    }

    // Cleanup
    await unifiedStorage.removeItem('test_store', 'test_key')
  } catch (error) {
    results.tests.push({
      name: 'Storage Operations',
      status: 'fail',
      error: error.message
    })
    console.error('❌ Storage operations test failed:', error)
    results.summary.failed++
  }

  // Test 6: Determinism compatibility
  try {
    console.log('🎯 Testing determinism evaluator compatibility...')
    const compatLevel = await determinismCompatibility.initialize()
    const config = determinismCompatibility.getEvaluatorConfig()

    results.tests.push({
      name: 'Determinism Evaluator Compatibility',
      status: compatLevel !== 'disabled' ? 'pass' : 'warning',
      result: { level: compatLevel, config },
      message: `Compatibility level: ${compatLevel}`
    })

    if (compatLevel !== 'disabled') {
      console.log('✅ Determinism evaluator compatible:', compatLevel)
      results.summary.passed++
    } else {
      console.log('⚠️ Determinism evaluator disabled')
      results.summary.warnings++
    }
  } catch (error) {
    results.tests.push({
      name: 'Determinism Evaluator Compatibility',
      status: 'fail',
      error: error.message
    })
    console.error('❌ Determinism compatibility test failed:', error)
    results.summary.failed++
  }

  // Test 7: Cross-browser testing
  try {
    console.log('🌐 Running cross-browser compatibility tests...')
    const crossBrowserResults = await runQuickCompatibilityCheck()

    results.tests.push({
      name: 'Cross-Browser Testing',
      status: crossBrowserResults.successRate > 80 ? 'pass' : 'warning',
      result: crossBrowserResults,
      message: `Success rate: ${crossBrowserResults.successRate}%`
    })

    if (crossBrowserResults.successRate > 80) {
      console.log('✅ Cross-browser tests passed:', crossBrowserResults.successRate + '%')
      results.summary.passed++
    } else {
      console.log('⚠️ Cross-browser tests had issues:', crossBrowserResults.successRate + '%')
      results.summary.warnings++
    }
  } catch (error) {
    results.tests.push({
      name: 'Cross-Browser Testing',
      status: 'fail',
      error: error.message
    })
    console.error('❌ Cross-browser test failed:', error)
    results.summary.failed++
  }

  // Generate final report
  const totalTests = results.summary.passed + results.summary.failed + results.summary.warnings
  const successRate = totalTests > 0 ? Math.round((results.summary.passed / totalTests) * 100) : 0

  console.log('\n📊 Test Summary:')
  console.log(`✅ Passed: ${results.summary.passed}`)
  console.log(`⚠️ Warnings: ${results.summary.warnings}`)
  console.log(`❌ Failed: ${results.summary.failed}`)
  console.log(`📈 Success Rate: ${successRate}%`)

  if (successRate >= 80) {
    console.log('🎉 Browser compatibility tests completed successfully!')
  } else if (successRate >= 60) {
    console.log('⚠️ Browser compatibility tests completed with warnings')
  } else {
    console.log('❌ Browser compatibility tests failed - browser may not be supported')
  }

  return {
    ...results,
    summary: {
      ...results.summary,
      total: totalTests,
      successRate
    }
  }
}

/**
 * Quick compatibility check for immediate feedback
 */
export function runQuickCompatibilityCheck() {
  console.log('⚡ Quick compatibility check...')

  const features = {
    serviceWorker: 'serviceWorker' in navigator,
    indexedDB: 'indexedDB' in window,
    localStorage: 'localStorage' in window,
    fetch: typeof fetch !== 'undefined',
    promises: typeof Promise !== 'undefined',
    webWorkers: typeof Worker !== 'undefined'
  }

  const supportedCount = Object.values(features).filter(Boolean).length
  const totalCount = Object.keys(features).length
  const supportPercentage = Math.round((supportedCount / totalCount) * 100)

  console.log('🔍 Feature Support:')
  Object.entries(features).forEach(([feature, supported]) => {
    console.log(`  ${supported ? '✅' : '❌'} ${feature}`)
  })

  console.log(`📊 Overall Support: ${supportPercentage}% (${supportedCount}/${totalCount})`)

  return {
    features,
    supportedCount,
    totalCount,
    supportPercentage,
    compatible: supportPercentage >= 75
  }
}

// Auto-run quick check when imported
if (typeof window !== 'undefined') {
  console.log('🚀 Browser Compatibility Utils Loaded')
  console.log('Run runManualCompatibilityTest() for full test suite')
  console.log('Run runQuickCompatibilityCheck() for quick check')
}
