/**
 * Determinism evaluator compatibility and fallback management
 * Provides unified interface for browser compatibility and graceful degradation
 */

import {
  getBrowserCompatibility,
  getServiceWorkerCompatibility,
  getStorageCompatibility,
  displayCompatibilityWarnings,
  initializeBrowserCompatibility
} from './browserCompatibility.js'
import { unifiedStorage } from './storageUtils.js'
import { runQuickCompatibilityCheck } from './crossBrowserTesting.js'
import { hanrrorTypes } from './errorHandling.js'

/**
 * Determinism evaluator compatibility levels
 */
export const DeterminismCompatibility = {
  FULL: 'full',           // Service workers + IndexedDB
  DEGRADED: 'degraded',   // Web workers + localStorage
  LIMITED: 'limited',     // Main thread + localStorage
  DISABLED: 'disabled'    // Feature disabled due to incompatibility
}

/**
 * Compatibility manager for determinism evaluator
 */
export class DeterminismCompatibilityManager {
  constructor() {
    this.compatibilityLevel = null
    this.initialized = false
    this.fallbackMode = false
    this.warnings = []
    this.recommendations = []
  }

  /**
   * Initialize compatibility checking and determine best mode
   */
  async initialize() {
    if (this.initialized) {
      return this.compatibilityLevel
    }

    try {
      console.log('🔍 Checking determinism evaluator compatibility...')

      // Run comprehensive compatibility check
      const browserCompat = getBrowserCompatibility()
      const serviceWorkerCompat = getServiceWorkerCompatibility()
      const storageCompat = getStorageCompatibility()

      // Initialize storage system
      await unifiedStorage.initialize()

      // Determine compatibility level
      this.compatibilityLevel = this.determineCompatibilityLevel(
        browserCompat,
        serviceWorkerCompat,
        storageCompat
      )

      // Set up fallback mode if needed
      this.setupFallbackMode()

      // Display warnings if necessary
      this.handleCompatibilityWarnings(browserCompat, serviceWorkerCompat, storageCompat)

      this.initialized = true

      console.log(`✅ Determinism evaluator compatibility: ${this.compatibilityLevel}`)

      if (this.warnings.length > 0) {
        console.warn('⚠️ Compatibility warnings:', this.warnings)
      }

      return this.compatibilityLevel

    } catch (error) {
      console.error('❌ Compatibility initialization failed:', error)

      this.compatibilityLevel = DeterminismCompatibility.DISABLED
      this.initialized = true

      handleError(error, {
        context: 'determinism_compatibility_init',
        type: ErrorTypes.BROWSER_COMPATIBILITY
      })

      return this.compatibilityLevel
    }
  }

  /**
   * Determine the best compatibility level based on available features
   */
  determineCompatibilityLevel(browserCompat, serviceWorkerCompat, storageCompat) {
    // Check if browser is fundamentally incompatible
    if (browserCompat.level === 'unsupported') {
      return DeterminismCompatibility.DISABLED
    }

    // Full compatibility: Service Workers + IndexedDB
    if (serviceWorkerCompat.supported && storageCompat.indexedDB) {
      return DeterminismCompatibility.FULL
    }

    // Degraded compatibility: Web Workers + localStorage
    if (serviceWorkerCompat.hasWebWorkers && storageCompat.localStorage) {
      this.fallbackMode = true
      this.warnings.push('Using Web Workers instead of Service Workers')
      return DeterminismCompatibility.DEGRADED
    }

    // Limited compatibility: Main thread + localStorage
    if (storageCompat.localStorage) {
      this.fallbackMode = true
      this.warnings.push('Background processing not available - will run on main thread')
      this.warnings.push('UI may become unresponsive during evaluation')
      return DeterminismCompatibility.LIMITED
    }

    // No viable compatibility
    this.warnings.push('Insufficient browser capabilities for determinism evaluation')
    return DeterminismCompatibility.DISABLED
  }

  /**
   * Set up fallback mode configuration
   */
  setupFallbackMode() {
    if (!this.fallbackMode) {
      return
    }

    switch (this.compatibilityLevel) {
      case DeterminismCompatibility.DEGRADED:
        this.recommendations.push('Update your browser for better performance with Service Workers')
        break

      case DeterminismCompatibility.LIMITED:
        this.recommendations.push('Update to a modern browser for background processing')
        this.recommendations.push('Consider using smaller batch sizes to avoid UI blocking')
        break
    }
  }

  /**
   * Handle compatibility warnings and user notifications
   */
  handleCompatibilityWarnings(browserCompat, serviceWorkerCompat, storageCompat) {
    // Collect all warnings
    const allWarnings = [
      ...this.warnings,
      ...browserCompat.issues || [],
      ...storageCompat.issues || []
    ]

    // Collect all recommendations
    const allRecommendations = [
      ...this.recommendations,
      ...browserCompat.recommendations || [],
      ...storageCompat.recommendations || [],
      ...(serviceWorkerCompat.recommendation ? [serviceWorkerCompat.recommendation] : [])
    ]

    // Remove duplicates
    this.warnings = [...new Set(allWarnings)]
    this.recommendations = [...new Set(allRecommendations)]

    // Display critical warnings
    if (this.compatibilityLevel === DeterminismCompatibility.DISABLED) {
      displayCompatibilityWarnings((warning) => {
        console.error('🚫 Determinism evaluator disabled:', warning)
      })
    }
  }

  /**
   * Get configuration for determinism evaluator based on compatibility
   */
  getEvaluatorConfig() {
    if (!this.initialized) {
      throw new Error('Compatibility manager not initialized')
    }

    const baseConfig = {
      compatibilityLevel: this.compatibilityLevel,
      fallbackMode: this.fallbackMode,
      warnings: this.warnings,
      recommendations: this.recommendations
    }

    switch (this.compatibilityLevel) {
      case DeterminismCompatibility.FULL:
        return {
          ...baseConfig,
          useServiceWorker: true,
          useIndexedDB: true,
          maxConcurrency: 5,
          backgroundProcessing: true,
          storageType: 'indexedDB',
          workerScript: '/determinism-worker.js'
        }

      case DeterminismCompatibility.DEGRADED:
        return {
          ...baseConfig,
          useServiceWorker: false,
          useWebWorker: true,
          useIndexedDB: false,
          maxConcurrency: 3,
          backgroundProcessing: true,
          storageType: 'localStorage',
          workerScript: null // Would need separate web worker implementation
        }

      case DeterminismCompatibility.LIMITED:
        return {
          ...baseConfig,
          useServiceWorker: false,
          useWebWorker: false,
          useIndexedDB: false,
          maxConcurrency: 1,
          backgroundProcessing: false,
          storageType: 'localStorage',
          workerScript: null,
          batchSize: 10 // Smaller batches to avoid UI blocking
        }

      case DeterminismCompatibility.DISABLED:
        return {
          ...baseConfig,
          enabled: false,
          reason: 'Browser compatibility insufficient for determinism evaluation'
        }

      default:
        throw new Error(`Unknown compatibility level: ${this.compatibilityLevel}`)
    }
  }

  /**
   * Check if determinism evaluator should be enabled
   */
  isEvaluatorEnabled() {
    return this.initialized && this.compatibilityLevel !== DeterminismCompatibility.DISABLED
  }

  /**
   * Get user-friendly status message
   */
  getStatusMessage() {
    if (!this.initialized) {
      return 'Compatibility check not completed'
    }

    switch (this.compatibilityLevel) {
      case DeterminismCompatibility.FULL:
        return 'Determinism evaluation fully supported'

      case DeterminismCompatibility.DEGRADED:
        return 'Determinism evaluation available with reduced performance'

      case DeterminismCompatibility.LIMITED:
        return 'Determinism evaluation available with limited functionality'

      case DeterminismCompatibility.DISABLED:
        return 'Determinism evaluation not available in this browser'

      default:
        return 'Unknown compatibility status'
    }
  }

  /**
   * Get detailed compatibility report
   */
  getCompatibilityReport() {
    return {
      timestamp: new Date().toISOString(),
      initialized: this.initialized,
      compatibilityLevel: this.compatibilityLevel,
      fallbackMode: this.fallbackMode,
      enabled: this.isEvaluatorEnabled(),
      statusMessage: this.getStatusMessage(),
      warnings: this.warnings,
      recommendations: this.recommendations,
      config: this.initialized ? this.getEvaluatorConfig() : null,
      browserInfo: getBrowserCompatibility(),
      serviceWorkerInfo: getServiceWorkerCompatibility(),
      storageInfo: getStorageCompatibility(),
      storageDetails: unifiedStorage.getStorageInfo()
    }
  }

  /**
   * Run compatibility tests
   */
  async runCompatibilityTests() {
    console.log('🧪 Running determinism evaluator compatibility tests...')

    try {
      const testResults = await runQuickCompatibilityCheck()

      console.log('✅ Compatibility tests completed:', testResults)

      return {
        success: true,
        results: testResults,
        compatibilityLevel: this.compatibilityLevel,
        recommendations: this.recommendations
      }
    } catch (error) {
      console.error('❌ Compatibility tests failed:', error)

      return {
        success: false,
        error: error.message,
        compatibilityLevel: DeterminismCompatibility.DISABLED,
        recommendations: ['Please update to a modern browser']
      }
    }
  }
}

// Export singleton instance
export const determinismCompatibility = new DeterminismCompatibilityManager()

/**
 * Initialize determinism evaluator compatibility
 */
export async function initializeDeterminismCompatibility() {
  return await determinismCompatibility.initialize()
}

/**
 * Check if determinism evaluator is supported
 */
export function isDeterminismEvaluatorSupported() {
  return determinismCompatibility.isEvaluatorEnabled()
}

/**
 * Get determinism evaluator configuration
 */
export function getDeterminismEvaluatorConfig() {
  if (!determinismCompatibility.initialized) {
    throw new Error('Determinism compatibility not initialized. Call initializeDeterminismCompatibility() first.')
  }

  return determinismCompatibility.getEvaluatorConfig()
}

/**
 * Get compatibility status for UI display
 */
export function getDeterminismCompatibilityStatus() {
  return {
    enabled: determinismCompatibility.isEvaluatorEnabled(),
    level: determinismCompatibility.compatibilityLevel,
    message: determinismCompatibility.getStatusMessage(),
    warnings: determinismCompatibility.warnings,
    recommendations: determinismCompatibility.recommendations
  }
}
