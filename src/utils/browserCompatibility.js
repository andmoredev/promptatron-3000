/**
 * Browser compatibility detection and fallback handling utilities
 * Provides comprehensive browser feature detection and graceful degradation
 */

import { ErrorTypes, analyzeError, handleError } from './errorHandling.js'

/**
 * Browser feature support detection
 */
export const BrowserFeatures = {
  SERVICE_WORKER: 'serviceWorker',
  INDEXED_DB: 'indexedDB',
  LOCAL_STORAGE: 'localStorage',
  SESSION_STORAGE: 'sessionStorage',
  WEB_WORKERS: 'webWorkers',
  FETCH_API: 'fetchAPI',
  PROMISES: 'promises',
  ES6_MODULES: 'es6Modules'
}

/**
 * Browser compatibility levels
 */
export const CompatibilityLevel = {
  FULL: 'full',        // All features supported
  PARTIAL: 'partial',  // Some features supported with fallbacks
  LIMITED: 'limited',  // Basic functionality only
  UNSUPPORTED: 'unsupported' // Browser not supported
}

/**
 * Check if service workers are supported
 */
export function isServiceWorkerSupported() {
  return typeof navigator !== 'undefined' &&
         'serviceWorker' in navigator &&
         typeof navigator.serviceWorker.register === 'function'
}

/**
 * Check if IndexedDB is supported and available
 */
export function isIndexedDBSupported() {
  try {
    return typeof window !== 'undefined' &&
           'indexedDB' in window &&
           window.indexedDB !== null &&
           typeof window.indexedDB.open === 'function'
  } catch (error) {
    return false
  }
}

/**
 * Check if localStorage is supported and available
 */
export function isLocalStorageSupported() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false
    }

    // Test actual functionality
    const testKey = '__localStorage_test__'
    window.localStorage.setItem(testKey, 'test')
    window.localStorage.removeItem(testKey)
    return true
  } catch (error) {
    return false
  }
}

/**
 * Check if sessionStorage is supported and available
 */
export function isSessionStorageSupported() {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return false
    }

    // Test actual functionality
    const testKey = '__sessionStorage_test__'
    window.sessionStorage.setItem(testKey, 'test')
    window.sessionStorage.removeItem(testKey)
    return true
  } catch (error) {
    return false
  }
}

/**
 * Check if Web Workers are supported
 */
export function isWebWorkersSupported() {
  return typeof Worker !== 'undefined'
}

/**
 * Check if Fetch API is supported
 */
export function isFetchAPISupported() {
  return typeof fetch !== 'undefined' && typeof Promise !== 'undefined'
}

/**
 * Check if Promises are supported
 */
export function isPromisesSupported() {
  return typeof Promise !== 'undefined' &&
         typeof Promise.resolve === 'function' &&
         typeof Promise.reject === 'function'
}

/**
 * Check if ES6 modules are supported
 */
export function isES6ModulesSupported() {
  try {
    return typeof import !== 'undefined' && typeof export !== 'undefined'
  } catch (error) {
    return false
  }
}

/**
 * Comprehensive browser feature detection
 */
export function detectBrowserFeatures() {
  return {
    [BrowserFeatures.SERVICE_WORKER]: isServiceWorkerSupported(),
    [BrowserFeatures.INDEXED_DB]: isIndexedDBSupported(),
    [BrowserFeatures.LOCAL_STORAGE]: isLocalStorageSupported(),
    [BrowserFeatures.SESSION_STORAGE]: isSessionStorageSupported(),
    [BrowserFeatures.WEB_WORKERS]: isWebWorkersSupported(),
    [BrowserFeatures.FETCH_API]: isFetchAPISupported(),
    [BrowserFeatures.PROMISES]: isPromisesSupported(),
    [BrowserFeatures.ES6_MODULES]: isES6ModulesSupported()
  }
}

/**
 * Get browser information
 */
export function getBrowserInfo() {
  const userAgent = navigator.userAgent
  const isChrome = /Chrome/.test(userAgent) && /Google Inc/.test(navigator.vendor)
  const isFirefox = /Firefox/.test(userAgent)
  const isSafari = /Safari/.test(userAgent) && /Apple Computer/.test(navigator.vendor)
  const isEdge = /Edg/.test(userAgent)
  const isOpera = /OPR/.test(userAgent)

  let browserName = 'Unknown'
  if (isChrome) browserName = 'Chrome'
  else if (isFirefox) browserName = 'Firefox'
  else if (isSafari) browserName = 'Safari'
  else if (isEdge) browserName = 'Edge'
  else if (isOpera) browserName = 'Opera'

  return {
    name: browserName,
    userAgent,
    isChrome,
    isFirefox,
    isSafari,
    isEdge,
    isOpera,
    isMobile: /Mobi|Android/i.test(userAgent),
    isTablet: /Tablet|iPad/i.test(userAgent)
  }
}

/**
 * Determine overall browser compatibility level
 */
export function getBrowserCompatibility() {
  const features = detectBrowserFeatures()
  const browserInfo = getBrowserInfo()

  // Count supported features
  const supportedFeatures = Object.values(features).filter(Boolean).length
  const totalFeatures = Object.keys(features).length

  // Determine compatibility level
  let level
  let issues = []
  let recommendations = []

  // Critical features for basic functionality
  const criticalFeatures = [
    BrowserFeatures.FETCH_API,
    BrowserFeatures.PROMISES,
    BrowserFeatures.LOCAL_STORAGE
  ]

  const criticalSupported = criticalFeatures.every(feature => features[feature])

  if (!criticalSupported) {
    level = CompatibilityLevel.UNSUPPORTED
    issues.push('Critical browser features are missing')
    recommendations.push('Please update to a modern browser (Chrome 60+, Firefox 55+, Safari 12+, Edge 79+)')
  } else if (supportedFeatures === totalFeatures) {
    level = CompatibilityLevel.FULL
  } else if (supportedFeatures >= totalFeatures * 0.75) {
    level = CompatibilityLevel.PARTIAL

    // Identify missing features
    Object.entries(features).forEach(([feature, supported]) => {
      if (!supported) {
        switch (feature) {
          case BrowserFeatures.SERVICE_WORKER:
            issues.push('Service Workers not supported - background processing will be limited')
            recommendations.push('Update your browser for better performance')
            break
          case BrowserFeatures.INDEXED_DB:
            issues.push('IndexedDB not supported - will use localStorage fallback')
            break
          case BrowserFeatures.WEB_WORKERS:
            issues.push('Web Workers not supported - processing may block UI')
            break
        }
      }
    })
  } else {
    level = CompatibilityLevel.LIMITED
    issues.push('Many browser features are not supported')
    recommendations.push('Please update to a modern browsernctionality')
  }

  return {
    level,
    features,
    browserInfo,
    supportedFeatures,
    totalFeatures,
    supportPercentage: Math.round((supportedFeatures / totalFeatures) * 100),
    issues,
    recommendations,
    timestamp: new Date().toISOString()
  }
}

/**
 * Get service worker compatibility information
 */
export function getServiceWorkerCompatibility() {
  const isSupported = isServiceWorkerSupported()
  const browserInfo = getBrowserInfo()

  let reason, recommendation

  if (isSupported) {
    reason = 'Service Workers are fully supported'
    recommendation = null
  } else {
    reason = 'Service Workers are not supported in this browser'

    if (browserInfo.isSafari) {
      recommendation = 'Safari supports Service Workers in version 11.1+. Please update Safari.'
    } else if (browserInfo.isFirefox) {
      recommendation = 'Firefox supports Service Workers in version 44+. Please update Firefox.'
    } else if (browserInfo.isChrome) {
      recommendation = 'Chrome supports Service Workers in version 40+. Please update Chrome.'
    } else if (browserInfo.isEdge) {
      recommendation = 'Edge supports Service Workers in version 17+. Please update Edge.'
    } else {
      recommendation = 'Please use a modern browser like Chrome, Firefox, Safari, or Edge'
    }
  }

  return {
    supported: isSupported,
    reason,
    recommendation,
    browserInfo,
    fallbackAvailable: isWebWorkersSupported() || isLocalStorageSupported()
  }
}

/**
 * Get storage compatibility information with fallback options
 */
export function getStorageCompatibility() {
  const indexedDBSupported = isIndexedDBSupported()
  const localStorageSupported = isLocalStorageSupported()
  const sessionStorageSupported = isSessionStorageSupported()

  let primaryStorage, fallbackStorage, issues = [], recommendations = []

  if (indexedDBSupported) {
    primaryStorage = 'IndexedDB'
    fallbackStorage = localStorageSupported ? 'localStorage' :
                     sessionStorageSupported ? 'sessionStorage' : null
  } else if (localStorageSupported) {
    primaryStorage = 'localStorage'
    fallbackStorage = sessionStorageSupported ? 'sessionStorage' : null
    issues.push('IndexedDB not available - using localStorage with limited capacity')
    recommendations.push('Update your browser for better storage capabilities')
  } else if (sessionStorageSupported) {
    primaryStorage = 'sessionStorage'
    fallbackStorage = null
    issues.push('Persistent storage not available - data will be lost when tab closes')
    recommendations.push('Update your browser or enable localStorage')
  } else {
    primaryStorage = null
    fallbackStorage = null
    issues.push('No storage mechanisms available')
    recommendations.push('Please use a modern browser with storage support')
  }

  return {
    indexedDB: indexedDBSupported,
    localStorage: localStorageSupported,
    sessionStorage: sessionStorageSupported,
    primaryStorage,
    fallbackStorage,
    hasStorage: primaryStorage !== null,
    hasPersistentStorage: indexedDBSupported || localStorageSupported,
    issues,
    recommendations
  }
}

/**
 * Test storage quota and availability
 */
export async function testStorageQuota() {
  const results = {
    localStorage: null,
    sessionStorage: null,
    indexedDB: null,
    errors: []
  }

  // Test localStorage quota
  if (isLocalStorageSupported()) {
    try {
      const testData = 'x'.repeat(1024) // 1KB test string
      let quota = 0

      // Estimate quota by trying to store data
      for (let i = 0; i < 10000; i++) { // Max 10MB test
        try {
          localStorage.setItem(`quota_test_${i}`, testData)
          quota += testData.length
        } catch (error) {
          break
        }
      }

      // Clean up test data
      for (let i = 0; i < 10000; i++) {
        localStorage.removeItem(`quota_test_${i}`)
      }

      results.localStorage = {
        available: true,
        estimatedQuota: quota,
        estimatedQuotaMB: Math.round(quota / (1024 * 1024) * 10) / 10
      }
    } catch (error) {
      results.localStorage = { available: false, error: error.message }
      results.errors.push(`localStorage test failed: ${error.message}`)
    }
  }

  // Test sessionStorage quota
  if (isSessionStorageSupported()) {
    try {
      const testData = 'x'.repeat(1024)
      let quota = 0

      for (let i = 0; i < 10000; i++) {
        try {
          sessionStorage.setItem(`quota_test_${i}`, testData)
          quota += testData.length
        } catch (error) {
          break
        }
      }

      // Clean up
      for (let i = 0; i < 10000; i++) {
        sessionStorage.removeItem(`quota_test_${i}`)
      }

      results.sessionStorage = {
        available: true,
        estimatedQuota: quota,
        estimatedQuotaMB: Math.round(quota / (1024 * 1024) * 10) / 10
      }
    } catch (error) {
      results.sessionStorage = { available: false, error: error.message }
      results.errors.push(`sessionStorage test failed: ${error.message}`)
    }
  }

  // Test IndexedDB availability
  if (isIndexedDBSupported()) {
    try {
      // Try to open a test database
      const dbName = 'quota_test_db'
      const request = indexedDB.open(dbName, 1)

      await new Promise((resolve, reject) => {
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          db.close()
          indexedDB.deleteDatabase(dbName)
          resolve()
        }
        request.onupgradeneeded = (event) => {
          const db = event.target.result
          db.createObjectStore('test', { keyPath: 'id' })
        }
      })

      results.indexedDB = { available: true }
    } catch (error) {
      results.indexedDB = { available: false, error: error.message }
      results.errors.push(`IndexedDB test failed: ${error.message}`)
    }
  }

  return results
}

/**
 * Create a compatibility report for debugging
 */
export function createCompatibilityReport() {
  const compatibility = getBrowserCompatibility()
  const serviceWorkerCompat = getServiceWorkerCompatibility()
  const storageCompat = getStorageCompatibility()

  return {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: typeof window !== 'undefined' ? window.location.href : 'N/A',
    overall: compatibility,
    serviceWorker: serviceWorkerCompat,
    storage: storageCompat,
    recommendations: [
      ...compatibility.recommendations,
      ...serviceWorkerCompat.recommendation ? [serviceWorkerCompat.recommendation] : [],
      ...storageCompat.recommendations
    ].filter((rec, index, arr) => arr.indexOf(rec) === index) // Remove duplicates
  }
}

/**
 * Display compatibility warnings to user
 */
export function displayCompatibilityWarnings(onWarning = null) {
  const compatibility = getBrowserCompatibility()

  if (compatibility.level === CompatibilityLevel.UNSUPPORTED) {
    const error = new Error('Browser not supported')
    const errorInfo = analyzeError(error, {
      type: ErrorTypes.BROWSER_COMPATIBILITY,
      compatibility
    })

    if (onWarning) {
      onWarning(errorInfo)
    } else {
      handleError(error, { compatibility })
    }

    return false
  }

  if (compatibility.level === CompatibilityLevel.LIMITED ||
      compatibility.level === CompatibilityLevel.PARTIAL) {

    compatibility.issues.forEach(issue => {
      console.warn(`Browser compatibility issue: ${issue}`)
    })

    if (onWarning) {
      onWarning({
        type: 'warning',
        level: compatibility.level,
        issues: compatibility.issues,
        recommendations: compatibility.recommendations
      })
    }
  }

  return true
}

/**
 * Initialize browser compatibility checking
 */
export function initializeBrowserCompatibility(options = {}) {
  const {
    onWarning = null,
    testStorage = false,
    logReport = true
  } = options

  // Check basic compatibility
  const isCompatible = displayCompatibilityWarnings(onWarning)

  if (logReport) {
    const report = createCompatibilityReport()
    console.log('Browser Compatibility Report:', report)
  }

  // Test storage if requested
  if (testStorage) {
    testStorageQuota().then(results => {
      console.log('Storage Quota Test Results:', results)

      if (results.errors.length > 0) {
        console.warn('Storage issues detected:', results.errors)
      }
    }).catch(error => {
      console.error('Storage quota test failed:', error)
    })
  }

  return {
    compatible: isCompatible,
    features: detectBrowserFeatures(),
    compatibility: getBrowserCompatibility()
  }
}
