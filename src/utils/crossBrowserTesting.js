/**
 * Cross-browser testing utilities for service worker functionality
 * Provides comprehensive testing across different browser environments
 */

import {
  isServiceWorkerSupported,
  getServiceWorkerCompatibility,
  registerServiceWorker,
  sendMessageToServiceWorker
} from './serviceWorkerUtils.js'
import {
  isIndexedDBSupported,
  isLocalStorageSupported,
  getBrowserCompatibility
} from './browserCompatibility.js'
import { unifiedStorage } from './storageUtils.js'

/**
 * Test results structure
 */
export const TestStatus = {
  PASS: 'pass',
  FAIL: 'fail',
  SKIP: 'skip',
  WARNING: 'warning'
}

/**
 * Cross-browser test suite for service worker functionality
 */
export class CrossBrowserTestSuite {
  constructor() {
    this.results = []
    this.startTime = null
    this.endTime = null
  }

  /**
   * Run complete test suite
   */
  async runAllTests() {
    this.startTime = Date.now()
    this.results = []

    console.log('🧪 Starting cross-browser compatibility tests...')

    // Basic browser feature tests
    await this.testBrowserFeatures()

    // Service worker tests
    await this.testServiceWorkerSupport()

    // Storage tests
    await this.testStorageCapabilities()

    // Integration tests
    await this.testServiceWorkerIntegration()

    this.endTime = Date.now()

    const summary = this.generateTestSummary()
    console.log('✅ Cross-browser tests completed:', summary)

    return {
      results: this.results,
      summary,
      duration: this.endTime - this.startTime
    }
  }

  /**
   * Test basic browser features
   */
  async testBrowserFeatures() {
    this.addTest('Browser Features', 'Basic browser compatibility check')

    try {
      const compatibility = getBrowserCompatibility()

      if (compatibility.level === 'unsupported') {
        this.addResult('Browser Support', TestStatus.FAIL,
          'Browser not supported', compatibility.issues.join(', '))
      } else if (compatibility.level === 'limited') {
        this.addResult('Browser Support', TestStatus.WARNING,
          'Limited browser support', compatibility.issues.join(', '))
      } else {
        this.addResult('Browser Support', TestStatus.PASS,
          `Browser compatibility: ${compatibility.level}`)
      }

      // Test individual features
      this.addResult('Fetch API',
        typeof fetch !== 'undefined' ? TestStatus.PASS : TestStatus.FAIL,
        typeof fetch !== 'undefined' ? 'Fetch API available' : 'Fetch API not supported')

      this.addResult('Promises',
        typeof Promise !== 'undefined' ? TestStatus.PASS : TestStatus.FAIL,
        typeof Promise !== 'undefined' ? 'Promises supported' : 'Promises not supported')

    } catch (error) {
      this.addResult('Browser Features', TestStatus.FAIL,
        'Feature detection failed', error.message)
    }
  }
  /**
   * Test service worker support and functionality
   */
  async testServiceWorkerSupport() {
    this.addTest('Service Workers', 'Service worker support and registration')

    const compatibility = getServiceWorkerCompatibility()

    if (!compatibility.supported) {
      this.addResult('Service Worker Support', TestStatus.FAIL,
        compatibility.reason, compatibility.recommendation)

      // Test fallback options
      if (compatibility.hasWebWorkers) {
        this.addResult('Web Workers Fallback', TestStatus.PASS,
          'Web Workers available as fallback')
      } else {
        this.addResult('Web Workers Fallback', TestStatus.FAIL,
          'No Web Workers fallback available')
      }
      return
    }

    this.addResult('Service Worker Support', TestStatus.PASS,
      'Service Workers supported')

    // Test service worker registration
    try {
      // Don't actually register in tests, just verify the API
      if (typeof navigator.serviceWorker.register === 'function') {
        this.addResult('Service Worker Registration API', TestStatus.PASS,
          'Registration API available')
      } else {
        this.addResult('Service Worker Registration API', TestStatus.FAIL,
          'Registration API not available')
      }

      // Test message channel support
      if (typeof MessageChannel !== 'undefined') {
        this.addResult('MessageChannel Support', TestStatus.PASS,
          'MessageAPI available')
      } else {
        this.addResult('MessageChannel Support', TestStatus.FAIL,
          'MessageChannel API not available')
      }

    } catch (error) {
      this.addResult('Service Worker API Test', TestStatus.FAIL,
        'Service Worker API test failed', error.message)
    }
  }

  /**
   * Test storage capabilities
   */
  async testStorageCapabilities() {
    this.addTest('Storage', 'Storage mechanism testing')

    // Test IndexedDB
    if (isIndexedDBSupported()) {
      this.addResult('IndexedDB Support', TestStatus.PASS, 'IndexedDB available')

      try {
        // Test IndexedDB functionality
        await this.testIndexedDBFunctionality()
      } catch (error) {
        this.addResult('IndexedDB Functionality', TestStatus.FAIL,
          'IndexedDB test failed', error.message)
      }
    } else {
      this.addResult('IndexedDB Support', TestStatus.FAIL, 'IndexedDB not available')
    }

    // Test localStorage
    if (isLocalStorageSupported()) {
      this.addResult('localStorage Support', TestStatus.PASS, 'localStorage available')

      try {
        await this.testLocalStorageFunctionality()
      } catch (error) {
        this.addResult('localStorage Functionality', TestStatus.FAIL,
          'localStorage test failed', error.message)
      }
    } else {
      this.addResult('localStorage Support', TestStatus.FAIL, 'localStorage not available')
    }

    // Test unified storage
    try {
      await this.testUnifiedStorage()
    } catch (error) {
      this.addResult('Unified Storage', TestStatus.FAIL,
        'Unified storage test failed', error.message)
    }
  }

  /**
   * Test IndexedDB functionality
   */
  async testIndexedDBFunctionality() {
    const dbName = 'test_db_' + Date.now()

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1)

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'))
      }

      request.onsuccess = () => {
        const db = request.result

        try {
          // Test basic operations
          const transaction = db.transaction(['test'], 'readwrite')
          const store = transaction.objectStore('test')

          const testData = { id: 'test', data: 'test_value' }
          const putRequest = store.put(testData)

          putRequest.onsuccess = () => {
            const getRequest = store.get('test')

            getRequest.onsuccess = () => {
              if (getRequest.result && getRequest.result.data === 'test_value') {
                this.addResult('IndexedDB Functionality', TestStatus.PASS,
                  'IndexedDB read/write operations successful')
              } else {
                this.addResult('IndexedDB Functionality', TestStatus.FAIL,
                  'IndexedDB data integrity check failed')
              }

              db.close()
              indexedDB.deleteDatabase(dbName)
              resolve()
            }

            getRequest.onerror = () => {
              this.addResult('IndexedDB Functionality', TestStatus.FAIL,
                'IndexedDB read operation failed')
              db.close()
              indexedDB.deleteDatabase(dbName)
              reject(new Error('IndexedDB read failed'))
            }
          }

          putRequest.onerror = () => {
            this.addResult('IndexedDB Functionality', TestStatus.FAIL,
              'IndexedDB write operation failed')
            db.close()
            indexedDB.deleteDatabase(dbName)
            reject(new Error('IndexedDB write failed'))
          }

        } catch (error) {
          db.close()
          indexedDB.deleteDatabase(dbName)
          reject(error)
        }
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        db.createObjectStore('test', { keyPath: 'id' })
      }
    })
  }

  /**
   * Test localStorage functionality
   */
  async testLocalStorageFunctionality() {
    const testKey = 'test_key_' + Date.now()
    const testValue = 'test_value_' + Math.random()

    try {
      // Test write
      localStorage.setItem(testKey, testValue)

      // Test read
      const retrievedValue = localStorage.getItem(testKey)

      if (retrievedValue === testValue) {
        this.addResult('localStorage Functionality', TestStatus.PASS,
          'localStorage read/write operations successful')
      } else {
        this.addResult('localStorage Functionality', TestStatus.FAIL,
          'localStorage data integrity check failed')
      }

      // Cleanup
      localStorage.removeItem(testKey)

    } catch (error) {
      this.addResult('localStorage Functionality', TestStatus.FAIL,
        'localStorage operations failed', error.message)
      throw error
    }
  }

  /**
   * Test unified storage system
   */
  async testUnifiedStorage() {
    const testKey = 'test_' + Date.now()
    const testData = { message: 'test_data', timestamp: Date.now() }

    try {
      // Initialize storage
      await unifiedStorage.initialize()

      this.addResult('Unified Storage Initialization', TestStatus.PASS,
        `Storage initialized with ${unifiedStorage.storageType}`)

      // Test write operation
      await unifiedStorage.setItem('test_store', testKey, testData)

      // Test read operation
      const retrievedData = await unifiedStorage.getItem('test_store', testKey)

      if (retrievedData && retrievedData.message === testData.message) {
        this.addResult('Unified Storage Operations', TestStatus.PASS,
          'Unified storage read/write operations successful')
      } else {
        this.addResult('Unified Storage Operations', TestStatus.FAIL,
          'Unified storage data integrity check failed')
      }

      // Test removal
      await unifiedStorage.removeItem('test_store', testKey)
      const removedData = await unifiedStorage.getItem('test_store', testKey)

      if (removedData === null) {
        this.addResult('Unified Storage Removal', TestStatus.PASS,
          'Unified storage removal successful')
      } else {
        this.addResult('Unified Storage Removal', TestStatus.FAIL,
          'Unified storage removal failed')
      }

    } catch (error) {
      this.addResult('Unified Storage Test', TestStatus.FAIL,
        'Unified storage test failed', error.message)
      throw error
    }
  }

  /**
   * Test service worker integration
   */
  async testServiceWorkerIntegration() {
    this.addTest('Integration', 'Service worker integration testing')

    if (!isServiceWorkerSupported()) {
      this.addResult('Service Worker Integration', TestStatus.SKIP,
        'Service Workers not supported - skipping integration tests')
      return
    }

    // Test if determinism worker exists
    try {
      const response = await fetch('/determinism-worker.js', { method: 'HEAD' })
      if (response.ok) {
        this.addResult('Determinism Worker File', TestStatus.PASS,
          'Determinism worker file accessible')
      } else {
        this.addResult('Determinism Worker File', TestStatus.FAIL,
          'Determinism worker file not found')
      }
    } catch (error) {
      this.addResult('Determinism Worker File', TestStatus.FAIL,
        'Failed to check determinism worker file', error.message)
    }

    // Test MessageChannel functionality
    try {
      const channel = new MessageChannel()
      if (channel.port1 && channel.port2) {
        this.addResult('MessageChannel Creation', TestStatus.PASS,
          'MessageChannel created successfully')
      } else {
        this.addResult('MessageChannel Creation', TestStatus.FAIL,
          'MessageChannel creation failed')
      }
    } catch (error) {
      this.addResult('MessageChannel Creation', TestStatus.FAIL,
        'MessageChannel test failed', error.message)
    }
  }

  /**
   * Add a test category
   */
  addTest(category, description) {
    console.log(`🧪 Testing ${category}: ${description}`)
  }

  /**
   * Add a test result
   */
  addResult(testName, status, message, details = null) {
    const result = {
      testName,
      status,
      message,
      details,
      timestamp: Date.now()
    }

    this.results.push(result)

    const statusIcon = {
      [TestStatus.PASS]: '✅',
      [TestStatus.FAIL]: '❌',
      [TestStatus.SKIP]: '⏭️',
      [TestStatus.WARNING]: '⚠️'
    }[status]

    console.log(`${statusIcon} ${testName}: ${message}${details ? ` (${details})` : ''}`)
  }

  /**
   * Generate test summary
   */
  generateTestSummary() {
    const summary = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === TestStatus.PASS).length,
      failed: this.results.filter(r => r.status === TestStatus.FAIL).length,
      skipped: this.results.filter(r => r.status === TestStatus.SKIP).length,
      warnings: this.results.filter(r => r.status === TestStatus.WARNING).length,
      duration: this.endTime - this.startTime
    }

    summary.successRate = summary.total > 0 ?
      Math.round((summary.passed / (summary.total - summary.skipped)) * 100) : 0

    return summary
  }

  /**
   * Get detailed test report
   */
  getDetailedReport() {
    return {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      browserInfo: getBrowserCompatibility(),
      serviceWorkerInfo: getServiceWorkerCompatibility(),
      storageInfo: unifiedStorage.getStorageInfo(),
      testResults: this.results,
      summary: this.generateTestSummary()
    }
  }
}

/**
 * Run quick compatibility check
 */
export async function runQuickCompatibilityCheck() {
  const suite = new CrossBrowserTestSuite()

  // Run essential tests only
  await suite.testBrowserFeatures()
  await suite.testServiceWorkerSupport()
  await suite.testStorageCapabilities()

  return suite.generateTestSummary()
}

/**
 * Run full compatibility test suite
 */
export async function runFullCompatibilityTests() {
  const suite = new CrossBrowserTestSuite()
  return await suite.runAllTests()
}

/**
 * Export test suite class for custom testing
 */
export { CrossBrowserTestSuite }
