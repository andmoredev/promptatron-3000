/**
 * Service class for managing scenario operations
 * Handles scenario loading, validation, directory scanning, caching, and file management
 */

import { validateScenario, extractScenarioMetadata, createDefaultScenario, createScenarioSchema } from '../utils/scenarioModels.js'
import { analyzeError, handleError, ErrorTypes } from '../utils/errorHandling.js'

/**
 * Performance-optimized cache implementation with LRU eviction
 */
class PerformanceCache {
  constructor(maxSize = 100, ttl = 5 * 60 * 1000) {
    this.cache = new Map()
    this.accessOrder = new Map() // Track access order for LRU
    this.maxSize = maxSize
    this.ttl = ttl
    this.hits = 0
    this.misses = 0
  }

  get(key) {
    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      return null
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      this.accessOrder.delete(key)
      this.misses++
      return null
    }

    // Update access order for LRU
    this.accessOrder.set(key, Date.now())
    this.hits++
    return entry.data
  }

  set(key, data) {
    // Remove oldest entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU()
    }

    const entry = {
      data,
      timestamp: Date.now()
    }

    this.cache.set(key, entry)
    this.accessOrder.set(key, Date.now())
  }

  evictLRU() {
    // Find least recently used entry
    let oldestKey = null
    let oldestTime = Infinity

    for (const [key, time] of this.accessOrder.entries()) {
      if (time < oldestTime) {
        oldestTime = time
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.accessOrder.delete(oldestKey)
    }
  }

  delete(key) {
    this.cache.delete(key)
    this.accessOrder.delete(key)
  }

  clear() {
    this.cache.clear()
    this.accessOrder.clear()
    this.hits = 0
    this.misses = 0
  }

  getStats() {
    const total = this.hits + this.misses
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) : 0,
      ttl: this.ttl
    }
  }
}

/**
 * Lazy loading manager for scenario content
 */
class LazyLoader {
  constructor() {
    this.loadingPromises = new Map()
    this.loadedContent = new Map()
    this.loadQueue = []
    this.isProcessing = false
  }

  async load(key, loader) {
    // Return cached content if available
    if (this.loadedContent.has(key)) {
      return this.loadedContent.get(key)
    }

    // Return existing promise if already loading
    if (this.loadingPromises.has(key)) {
      return this.loadingPromises.get(key)
    }

    // Create loading promise
    const promise = this.performLoad(key, loader)
    this.loadingPromises.set(key, promise)

    try {
      const result = await promise
      this.loadedContent.set(key, result)
      return result
    } finally {
      this.loadingPromises.delete(key)
    }
  }

  async performLoad(key, loader) {
    try {
      return await loader()
    } catch (error) {
      console.error(`[LazyLoader] Failed to load ${key}:`, error)
      throw error
    }
  }

  invalidate(key) {
    this.loadedContent.delete(key)
    this.loadingPromises.delete(key)
  }

  clear() {
    this.loadedContent.clear()
    this.loadingPromises.clear()
  }

  getStats() {
    return {
      loadedItems: this.loadedContent.size,
      activeLoads: this.loadingPromises.size,
      queueSize: this.loadQueue.length
    }
  }
}

/**
 * ScenarioService class for managing scenario operations with performance optimizations
 */
export class ScenarioService {
  constructor() {
    this.scenarios = new Map()
    this.scenarioMetadata = new Map()
    this.currentScenario = null
    this.isInitialized = false
    this.lastScanTime = null
    this.scanErrors = []

    // Performance-optimized caching system
    this.metadataCache = new PerformanceCache(200, 10 * 60 * 1000) // 10 min TTL for metadata
    this.validationCache = new PerformanceCache(100, 5 * 60 * 1000) // 5 min TTL for validation
    this.contentCache = new PerformanceCache(50, 15 * 60 * 1000) // 15 min TTL for full content
    this.directoryCache = new PerformanceCache(10, 2 * 60 * 1000) // 2 min TTL for directory scans

    // Lazy loading system
    this.lazyLoader = new LazyLoader()

    // File system operations tracking
    this.pendingOperations = new Set()
    this.operationHistory = []
    this.maxHistorySize = 100
    this.fileWatchingEnabled = import.meta.env.DEV

    // Performance monitoring
    this.performanceMetrics = {
      scanDurations: [],
      loadDurations: [],
      validationDurations: [],
      lastOptimization: null
    }

    // Batch processing for efficiency
    this.batchProcessor = {
      queue: [],
      isProcessing: false,
      batchSize: 10,
      batchTimeout: 100 // ms
    }
  }

  /**
   * Initialize the scenario service with performance optimizations
   * @returns {Promise<Object>} Initialization result
   */
  async initialize() {
    const startTime = performance.now()

    try {
      console.log('[ScenarioService] Initializing optimized scenario service...')

      // Check if we have cached metadata for fast startup
      const cachedMetadata = this.metadataCache.get('scenario-list')
      if (cachedMetadata && this.isRecentCache(cachedMetadata.timestamp)) {
        console.log('[ScenarioService] Using cached metadata for fast initialization')

        // Populate metadata from cache
        for (const metadata of cachedMetadata.scenarios) {
          this.scenarioMetadata.set(metadata.id, metadata)
        }

        this.isInitialized = true
        this.lastScanTime = new Date(cachedMetadata.timestamp)

        // Trigger background refresh
        this.refreshScenariosInBackground()

        return {
          success: true,
          message: `Scenario service initialized with ${cachedMetadata.scenarios.length} cached scenarios`,
          scenarioCount: cachedMetadata.scenarios.length,
          fromCache: true,
          errors: []
        }
      }

      // Full initialization - load scenarios from disk
      const scanResult = await this.loadScenariosOptimized()

      this.isInitialized = true
      this.lastScanTime = new Date()

      const duration = performance.now() - startTime
      this.recordPerformanceMetric('initialization', duration)

      return {
        success: true,
        message: `Scenario service initialized with ${this.scenarios.size} scenarios`,
        scenarioCount: this.scenarios.size,
        errors: this.scanErrors,
        initializationTime: Math.round(duration)
      }
    } catch (error) {
      this.isInitialized = false
      const errorInfo = analyzeError(error, { operation: 'initialize', service: 'ScenarioService' })

      return {
        success: false,
        message: errorInfo.userMessage,
        error: errorInfo.originalMessage,
        errorInfo: errorInfo
      }
    }
  }

  /**
   * Load all scenarios from the scenarios directory with performance optimizations
   * @returns {Promise<Object>} Load result with scenario count and errors
   */
  async loadScenariosOptimized() {
    const startTime = performance.now()

    try {
      console.log('[ScenarioService] Scanning scenarios directory with optimizations...')

      // Clear existing scenarios
      this.scenarios.clear()
      this.scenarioMetadata.clear()
      this.scanErrors = []

      // Efficient directory scanning with caching
      const scenarioFiles = await this.scanScenariosDirectoryOptimized()

      console.log(`[ScenarioService] Found ${scenarioFiles.length} scenario files`)

      // Batch process scenario files for better performance
      const batchSize = 5 // Process 5 files at a time
      const batches = []

      for (let i = 0; i < scenarioFiles.length; i += batchSize) {
        batches.push(scenarioFiles.slice(i, i + batchSize))
      }

      let successCount = 0
      let errorCount = 0

      // Process batches sequentially to avoid overwhelming the system
      for (const batch of batches) {
        const loadPromises = batch.map(file => this.loadScenarioFileOptimized(file))
        const loadResults = await Promise.allSettled(loadPromises)

        // Process batch results
        for (let i = 0; i < loadResults.length; i++) {
          const result = loadResults[i]
          const file = batch[i]

          if (result.status === 'fulfilled' && result.value.success) {
            successCount++
          } else {
            errorCount++
            const error = result.status === 'rejected' ? result.reason : result.value.error
            this.scanErrors.push({
              file: file,
              error: error.message || error,
              timestamp: new Date().toISOString()
            })
            console.warn(`[ScenarioService] Failed to load scenario file ${file}:`, error)
          }
        }

        // Small delay between batches to prevent blocking
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      }

      // Cache the metadata list for fast future startups
      const metadataList = Array.from(this.scenarioMetadata.values())
      this.metadataCache.set('scenario-list', {
        scenarios: metadataList,
        timestamp: Date.now()
      })

      const duration = performance.now() - startTime
      this.recordPerformanceMetric('scan', duration)

      console.log(`[ScenarioService] Loaded ${successCount} scenarios successfully, ${errorCount} errors in ${Math.round(duration)}ms`)

      return {
        success: true,
        totalFiles: scenarioFiles.length,
        successCount: successCount,
        errorCount: errorCount,
        errors: this.scanErrors,
        loadTime: Math.round(duration)
      }
    } catch (error) {
      console.error('[ScenarioService] Error loading scenarios:', error)
      throw error
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async loadScenarios() {
    return this.loadScenariosOptimized()
  }

  /**
   * Optimized directory scanning with caching and efficient discovery
   * @returns {Promise<string[]>} Array of scenario filenames
   */
  async scanScenariosDirectoryOptimized() {
    const cacheKey = 'directory-scan'

    // Check cache first
    const cached = this.directoryCache.get(cacheKey)
    if (cached) {
      console.log('[ScenarioService] Using cached directory scan results')
      return cached
    }

    const startTime = performance.now()

    try {
      console.log('[ScenarioService] Performing optimized directory scan...')

      const scenarioFiles = []
      const discoveryMethods = []

      // Method 1: Try manifest file first (most efficient)
      discoveryMethods.push(this.discoverFromManifest())

      // Method 2: Check known scenario files in parallel
      discoveryMethods.push(this.discoverKnownFiles())

      // Method 3: Try common naming patterns
      discoveryMethods.push(this.discoverByPatterns())

      // Execute all discovery methods in parallel
      const results = await Promise.allSettled(discoveryMethods)

      // Combine results from all methods
      const allFiles = new Set()

      for (const result of results) {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          result.value.forEach(file => allFiles.add(file))
        }
      }

      const finalFiles = Array.from(allFiles)

      // Cache the results
      this.directoryCache.set(cacheKey, finalFiles)

      const duration = performance.now() - startTime
      console.log(`[ScenarioService] Directory scan completed in ${Math.round(duration)}ms, found ${finalFiles.length} files`)

      return finalFiles
    } catch (error) {
      console.error('[ScenarioService] Error in optimized directory scan:', error)
      // Fallback to basic scan
      return this.scanScenariosDirectoryBasic()
    }
  }

  /**
   * Discover scenarios from manifest file (supports both old and new format)
   * @returns {Promise<string[]>} Array of scenario paths from manifest
   */
  async discoverFromManifest() {
    try {
      const response = await fetch('/scenarios/manifest.json')
      if (response.ok) {
        const manifest = await response.json()
        if (manifest.scenarios && Array.isArray(manifest.scenarios)) {
          console.log(`[ScenarioService] Found ${manifest.scenarios.length} scenarios in manifest`)

          // Support both old format (array of filenames) and new format (array of objects)
          return manifest.scenarios.map(scenario => {
            if (typeof scenario === 'string') {
              // Old format: direct filename
              return scenario.endsWith('.json') ? scenario : null
            } else if (typeof scenario === 'object' && scenario.folder) {
              // New format: folder-based structure
              return `${scenario.folder}/scenario.json`
            } else if (typeof scenario === 'object' && scenario.file) {
              // Alternative format: explicit file path
              return scenario.file
            }
            return null
          }).filter(Boolean)
        }
      }
    } catch (error) {
      console.debug('[ScenarioService] No manifest file found')
    }
    return []
  }

  /**
   * Discover known scenario files in parallel
   * @returns {Promise<string[]>} Array of existing known scenario files
   */
  async discoverKnownFiles() {
    const knownFiles = [
      'fraud-detection.json',
      'customer-support.json',
      'data-analysis.json',
      'content-generation.json',
      'text-classification.json',
      'sentiment-analysis.json',
      'document-summarization.json',
      'code-generation.json'
    ]

    // Check files in parallel with limited concurrency
    const batchSize = 4
    const existingFiles = []

    for (let i = 0; i < knownFiles.length; i += batchSize) {
      const batch = knownFiles.slice(i, i + batchSize)
      const checks = batch.map(async (filename) => {
        try {
          const response = await fetch(`/scenarios/${filename}`, { method: 'HEAD' })
          return response.ok ? filename : null
        } catch {
          return null
        }
      })

      const results = await Promise.all(checks)
      existingFiles.push(...results.filter(Boolean))
    }

    return existingFiles
  }

  /**
   * Discover scenarios by common naming patterns
   * @returns {Promise<string[]>} Array of scenario files found by patterns
   */
  async discoverByPatterns() {
    const patterns = [
      'scenario-*.json',
      '*-scenario.json',
      '*-analysis.json',
      '*-detection.json',
      '*-generation.json'
    ]

    // This is a simplified pattern matching since we can't do actual glob matching in browser
    // In a real implementation, this would use server-side directory listing
    const potentialFiles = []

    // Generate some common variations
    const prefixes = ['ai', 'ml', 'nlp', 'text', 'data', 'auto']
    const suffixes = ['analysis', 'detection', 'generation', 'classification', 'processing']

    for (const prefix of prefixes) {
      for (const suffix of suffixes) {
        potentialFiles.push(`${prefix}-${suffix}.json`)
      }
    }

    // Check a limited number to avoid too many requests
    const filesToCheck = potentialFiles.slice(0, 10)
    const existingFiles = []

    const checks = filesToCheck.map(async (filename) => {
      try {
        const response = await fetch(`/scenarios/${filename}`, { method: 'HEAD' })
        return response.ok ? filename : null
      } catch {
        return null
      }
    })

    const results = await Promise.all(checks)
    return results.filter(Boolean)
  }

  /**
   * Basic directory scanning fallback
   * @returns {Promise<string[]>} Array of scenario filenames
   */
  async scanScenariosDirectoryBasic() {
    try {
      const scenarioFiles = []
      const potentialFiles = [
        'fraud-detection.json',
        'customer-support.json',
        'data-analysis.json',
        'content-generation.json'
      ]

      for (const filename of potentialFiles) {
        try {
          const response = await fetch(`/scenarios/${filename}`, { method: 'HEAD' })
          if (response.ok) {
            scenarioFiles.push(filename)
          }
        } catch (error) {
          console.debug(`[ScenarioService] Scenario file ${filename} not found`)
        }
      }

      return scenarioFiles
    } catch (error) {
      console.error('[ScenarioService] Error in basic directory scan:', error)
      return []
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async scanScenariosDirectory() {
    return this.scanScenariosDirectoryOptimized()
  }

  /**
   * Load a single scenario file with performance optimizations (supports folder structure)
   * @param {string} filename - The scenario filename or path
   * @returns {Promise<Object>} Load result
   */
  async loadScenarioFileOptimized(filename) {
    const startTime = performance.now()
    const cacheKey = `scenario-file-${filename}`

    try {
      console.log(`[ScenarioService] Loading scenario file with optimizations: ${filename}`)

      // Check if we have cached content
      const cached = this.contentCache.get(cacheKey)
      if (cached) {
        console.log(`[ScenarioService] Using cached content for ${filename}`)

        // Still update our internal maps
        this.scenarios.set(cached.id, cached)
        const metadata = extractScenarioMetadata(cached)
        this.scenarioMetadata.set(cached.id, metadata)

        return {
          success: true,
          scenarioId: cached.id,
          metadata: metadata,
          fromCache: true
        }
      }

      // Determine the correct URL path
      const scenarioUrl = filename.includes('/')
        ? `/scenarios/${filename}`
        : `/scenarios/${filename}`

      // Fetch with optimized headers
      const response = await fetch(scenarioUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache' // Ensure we get fresh content
        }
      })

      if (!response.ok) {
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          filename: filename
        }

        if (response.status === 404) {
          throw new Error(`Scenario file not found: ${filename}`)
        } else if (response.status === 403) {
          throw new Error(`Access denied to scenario file: ${filename}`)
        } else {
          throw new Error(`Failed to fetch scenario file: ${response.status} ${response.statusText}`)
        }
      }

      // Optimized JSON parsing with streaming for large files
      const responseText = await response.text()

      if (!responseText.trim()) {
        throw new Error(`Scenario file is empty: ${filename}`)
      }

      // Parse JSON with performance monitoring
      const parseStart = performance.now()
      let scenarioData

      try {
        scenarioData = JSON.parse(responseText)
      } catch (jsonError) {
        throw new Error(`Invalid JSON in scenario file ${filename}: ${this.getJsonErrorDetails(jsonError, responseText)}`)
      }

      const parseTime = performance.now() - parseStart
      this.recordPerformanceMetric('jsonParse', parseTime)

      // Fast validation with caching
      const validation = await this.validateScenarioOptimized(scenarioData, {
        validateFiles: false, // Skip file validation for faster loading
        filename: filename
      })

      // Handle validation results
      if (!validation.isValid) {
        const errorSummary = this.formatValidationErrors(validation.errors)

        // For malformed files, we can still try to extract basic info
        const partialMetadata = this.extractPartialMetadata(scenarioData, filename)

        console.warn(`[ScenarioService] Scenario file ${filename} has validation errors:`, errorSummary)

        // Store as invalid scenario for debugging
        this.scenarios.set(`invalid-${filename}`, {
          ...scenarioData,
          filename: filename,
          loadedAt: new Date().toISOString(),
          validation: validation,
          isValid: false,
          errorSummary: errorSummary
        })

        return {
          success: false,
          error: new Error(`Invalid scenario structure: ${errorSummary}`),
          filename: filename,
          validation: validation,
          partialMetadata: partialMetadata,
          recoverable: this.isRecoverableError(validation.errors)
        }
      }

      // Extract metadata efficiently
      const metadata = extractScenarioMetadata(scenarioData)

      // Store scenario and metadata
      const scenarioWithMeta = {
        ...scenarioData,
        filename: filename,
        loadedAt: new Date().toISOString(),
        validation: validation
      }

      this.scenarios.set(scenarioData.id, scenarioWithMeta)
      this.scenarioMetadata.set(scenarioData.id, {
        ...metadata,
        filename: filename,
        loadedAt: new Date().toISOString()
      })

      // Cache the full content for future use
      this.contentCache.set(cacheKey, scenarioWithMeta)

      const duration = performance.now() - startTime
      this.recordPerformanceMetric('load', duration)

      console.log(`[ScenarioService] Successfully loaded scenario: ${scenarioData.id} in ${Math.round(duration)}ms`)

      return {
        success: true,
        scenarioId: scenarioData.id,
        metadata: metadata,
        validation: validation,
        loadTime: Math.round(duration)
      }
    } catch (error) {
      console.error(`[ScenarioService] Error loading scenario file ${filename}:`, error)

      // Record the error for debugging
      this.recordOperation('load', filename, {
        success: false,
        error: error.message,
        errorType: this.classifyError(error)
      })

      return {
        success: false,
        error: error,
        filename: filename,
        errorType: this.classifyError(error),
        suggestions: this.getErrorSuggestions(error, filename)
      }
    }
  }

  /**
   * Legacy method for backward compatibility
   * @param {string} filename - The scenario filename
   * @returns {Promise<Object>} Load result
   */
  async loadScenarioFile(filename) {
    try {
      console.log(`[ScenarioService] Loading scenario file: ${filename}`)

      // Fetch the scenario file
      const response = await fetch(`/scenarios/${filename}`)

      if (!response.ok) {
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          filename: filename
        }

        if (response.status === 404) {
          throw new Error(`Scenario file not found: ${filename}`)
        } else if (response.status === 403) {
          throw new Error(`Access denied to scenario file: ${filename}`)
        } else {
          throw new Error(`Failed to fetch scenario file: ${response.status} ${response.statusText}`)
        }
      }

      // Get response text first to handle JSON parsing errors better
      const responseText = await response.text()

      if (!responseText.trim()) {
        throw new Error(`Scenario file is empty: ${filename}`)
      }

      // Parse JSON with detailed error handling
      let scenarioData
      try {
        scenarioData = JSON.parse(responseText)
      } catch (jsonError) {
        throw new Error(`Invalid JSON in scenario file ${filename}: ${this.getJsonErrorDetails(jsonError, responseText)}`)
      }

      // Comprehensive validation
      const validation = await this.validateScenario(scenarioData, { validateFiles: true })

      // Handle validation results
      if (!validation.isValid) {
        const errorSummary = this.formatValidationErrors(validation.errors)

        // For malformed files, we can still try to extract basic info
        const partialMetadata = this.extractPartialMetadata(scenarioData, filename)

        console.warn(`[ScenarioService] Scenario file ${filename} has validation errors:`, errorSummary)

        // Store as invalid scenario for debugging
        this.scenarios.set(`invalid-${filename}`, {
          ...scenarioData,
          filename: filename,
          loadedAt: new Date().toISOString(),
          validation: validation,
          isValid: false,
          errorSummary: errorSummary
        })

        return {
          success: false,
          error: new Error(`Invalid scenario structure: ${errorSummary}`),
          filename: filename,
          validation: validation,
          partialMetadata: partialMetadata,
          recoverable: this.isRecoverableError(validation.errors)
        }
      }

      // Extract metadata
      const metadata = extractScenarioMetadata(scenarioData)

      // Store scenario and metadata
      this.scenarios.set(scenarioData.id, {
        ...scenarioData,
        filename: filename,
        loadedAt: new Date().toISOString(),
        validation: validation
      })

      this.scenarioMetadata.set(scenarioData.id, {
        ...metadata,
        filename: filename,
        loadedAt: new Date().toISOString()
      })

      // Cache metadata
      this.cacheMetadata(scenarioData.id, metadata)

      console.log(`[ScenarioService] Successfully loaded scenario: ${scenarioData.id}`)

      return {
        success: true,
        scenarioId: scenarioData.id,
        metadata: metadata,
        validation: validation
      }
    } catch (error) {
      console.error(`[ScenarioService] Error loading scenario file ${filename}:`, error)

      // Record the error for debugging
      this.recordOperation('load', filename, {
        success: false,
        error: error.message,
        errorType: this.classifyError(error)
      })

      return {
        success: false,
        error: error,
        filename: filename,
        errorType: this.classifyError(error),
        suggestions: this.getErrorSuggestions(error, filename)
      }
    }
  }

  /**
   * Get detailed JSON parsing error information
   * @param {Error} jsonError - The JSON parsing error
   * @param {string} text - The original text that failed to parse
   * @returns {string} Detailed error description
   */
  getJsonErrorDetails(jsonError, text) {
    const message = jsonError.message || 'Unknown JSON error'

    // Try to extract line/column information
    const lineMatch = message.match(/line (\d+)/i)
    const columnMatch = message.match(/column (\d+)/i)

    if (lineMatch && columnMatch) {
      const line = parseInt(lineMatch[1])
      const column = parseInt(columnMatch[1])
      const lines = text.split('\n')

      if (line <= lines.length) {
        const problemLine = lines[line - 1]
        const pointer = ' '.repeat(Math.max(0, column - 1)) + '^'

        return `${message}\nLine ${line}: ${problemLine}\n${pointer}`
      }
    }

    return message
  }

  /**
   * Format validation errors into a readable summary
   * @param {Object} errors - Validation errors object
   * @returns {string} Formatted error summary
   */
  formatValidationErrors(errors) {
    const errorMessages = []

    for (const [field, message] of Object.entries(errors)) {
      errorMessages.push(`${field}: ${message}`)
    }

    return errorMessages.join('; ')
  }

  /**
   * Extract partial metadata from potentially invalid scenario data
   * @param {Object} scenarioData - The scenario data (may be invalid)
   * @param {string} filename - The filename
   * @returns {Object} Partial metadata
   */
  extractPartialMetadata(scenarioData, filename) {
    try {
      return {
        id: scenarioData?.id || `unknown-${filename}`,
        name: scenarioData?.name || 'Unknown Scenario',
        description: scenarioData?.description || 'No description available',
        filename: filename,
        isPartial: true,
        hasDatasets: Array.isArray(scenarioData?.datasets) && scenarioData.datasets.length > 0,
        hasTools: Array.isArray(scenarioData?.tools) && scenarioData.tools.length > 0,
        hasSystemPrompts: Array.isArray(scenarioData?.systemPrompts) && scenarioData.systemPrompts.length > 0,
        hasUserPrompts: Array.isArray(scenarioData?.userPrompts) && scenarioData.userPrompts.length > 0
      }
    } catch (error) {
      return {
        id: `error-${filename}`,
        name: 'Error Loading Scenario',
        description: 'Failed to extract scenario information',
        filename: filename,
        isPartial: true,
        extractionError: error.message
      }
    }
  }

  /**
   * Classify error type for better handling
   * @param {Error} error - The error to classify
   * @returns {string} Error classification
   */
  classifyError(error) {
    const message = error.message.toLowerCase()

    if (message.includes('json')) {
      return 'json_parse_error'
    } else if (message.includes('not found') || message.includes('404')) {
      return 'file_not_found'
    } else if (message.includes('access denied') || message.includes('403')) {
      return 'access_denied'
    } else if (message.includes('network') || message.includes('fetch')) {
      return 'network_error'
    } else if (message.includes('validation') || message.includes('invalid')) {
      return 'validation_error'
    } else {
      return 'unknown_error'
    }
  }

  /**
   * Check if an error is recoverable
   * @param {Object} errors - Validation errors
   * @returns {boolean} True if the error might be recoverable
   */
  isRecoverableError(errors) {
    // Errors that might be fixable by the user
    const recoverableFields = ['name', 'description', 'configuration']

    return Object.keys(errors).some(field =>
      recoverableFields.some(recoverable => field.includes(recoverable))
    )
  }

  /**
   * Enhanced error recovery mechanism for scenario loading failures
   * @param {string} scenarioId - The scenario ID that failed to load
   * @param {Error} error - The original error
   * @param {Object} options - Recovery options
   * @returns {Promise<Object>} Recovery result
   */
  async attemptErrorRecovery(scenarioId, error, options = {}) {
    const {
      enableFallback = true,
      createPlaceholder = true,
      logRecovery = true
    } = options

    const recoveryResult = {
      success: false,
      method: null,
      scenario: null,
      warnings: [],
      errors: []
    }

    try {
      if (logRecovery) {
        console.log(`[ScenarioService] Attempting error recovery for scenario: ${scenarioId}`)
      }

      const errorType = this.classifyError(error)

      // Recovery strategy based on error type
      switch (errorType) {
        case 'json_parse_error':
          recoveryResult.method = 'json_repair'
          const repairResult = await this.attemptJsonRepair(scenarioId, error)
          if (repairResult.success) {
            recoveryResult.success = true
            recoveryResult.scenario = repairResult.scenario
            recoveryResult.warnings.push('Scenario loaded with automatic JSON repair')
          }
          break

        case 'validation_error':
          recoveryResult.method = 'validation_repair'
          const validationResult = await this.attemptValidationRepair(scenarioId, error)
          if (validationResult.success) {
            recoveryResult.success = true
            recoveryResult.scenario = validationResult.scenario
            recoveryResult.warnings.push('Scenario loaded with validation corrections')
          }
          break

        case 'file_not_found':
          if (enableFallback) {
            recoveryResult.method = 'fallback_scenario'
            const fallbackResult = await this.createFallbackScenario(scenarioId)
            if (fallbackResult.success) {
              recoveryResult.success = true
              recoveryResult.scenario = fallbackResult.scenario
              recoveryResult.warnings.push('Using fallback scenario due to missing file')
            }
          }
          break

        case 'network_error':
          recoveryResult.method = 'cached_scenario'
          const cachedResult = await this.loadFromCache(scenarioId)
          if (cachedResult.success) {
            recoveryResult.success = true
            recoveryResult.scenario = cachedResult.scenario
            recoveryResult.warnings.push('Loaded from cache due to network error')
          }
          break

        default:
          if (createPlaceholder) {
            recoveryResult.method = 'placeholder_scenario'
            const placeholderResult = await this.createPlaceholderScenario(scenarioId, error)
            recoveryResult.success = true
            recoveryResult.scenario = placeholderResult.scenario
            recoveryResult.warnings.push('Created placeholder scenario due to loading error')
          }
      }

      // Log recovery attempt
      if (logRecovery) {
        this.recordOperation('recovery', scenarioId, {
          success: recoveryResult.success,
          method: recoveryResult.method,
          originalError: error.message,
          warnings: recoveryResult.warnings
        })
      }

      return recoveryResult

    } catch (recoveryError) {
      console.error(`[ScenarioService] Error recovery failed for ${scenarioId}:`, recoveryError)

      recoveryResult.errors.push(`Recovery failed: ${recoveryError.message}`)

      // Last resort: create minimal placeholder
      if (createPlaceholder) {
        try {
          const minimalResult = await this.createMinimalPlaceholder(scenarioId)
          recoveryResult.success = true
          recoveryResult.method = 'minimal_placeholder'
          recoveryResult.scenario = minimalResult.scenario
          recoveryResult.warnings.push('Created minimal placeholder as last resort')
        } catch (placeholderError) {
          recoveryResult.errors.push(`Placeholder creation failed: ${placeholderError.message}`)
        }
      }

      return recoveryResult
    }
  }

  /**
   * Attempt to repair malformed JSON
   * @param {string} scenarioId - The scenario ID
   * @param {Error} error - The JSON parsing error
   * @returns {Promise<Object>} Repair result
   */
  async attemptJsonRepair(scenarioId, error) {
    try {
      // Try to fetch the raw content again
      const response = await fetch(`/scenarios/${scenarioId}.json`)
      if (!response.ok) {
        return { success: false, error: 'Could not fetch file for repair' }
      }

      const rawContent = await response.text()

      // Common JSON repair strategies
      const repairStrategies = [
        // Remove trailing commas
        content => content.replace(/,(\s*[}\]])/g, '$1'),

        // Fix missing quotes around property names
        content => content.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":'),

        // Fix single quotes to double quotes
        content => content.replace(/'/g, '"'),

        // Remove comments (not valid in JSON)
        content => content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''),

        // Fix missing closing brackets/braces (basic attempt)
        content => {
          const openBraces = (content.match(/{/g) || []).length
          const closeBraces = (content.match(/}/g) || []).length
          const openBrackets = (content.match(/\[/g) || []).length
          const closeBrackets = (content.match(/\]/g) || []).length

          let repaired = content

          // Add missing closing braces
          for (let i = 0; i < openBraces - closeBraces; i++) {
            repaired += '}'
          }

          // Add missing closing brackets
          for (let i = 0; i < openBrackets - closeBrackets; i++) {
            repaired += ']'
          }

          return repaired
        }
      ]

      // Try each repair strategy
      for (const strategy of repairStrategies) {
        try {
          const repairedContent = strategy(rawContent)
          const parsedData = JSON.parse(repairedContent)

          // Validate the repaired scenario
          const validation = await this.validateScenarioOptimized(parsedData, {
            validateFiles: false
          })

          if (validation.isValid || this.isRecoverableError(validation.errors)) {
            console.log(`[ScenarioService] Successfully repaired JSON for ${scenarioId}`)

            return {
              success: true,
              scenario: {
                ...parsedData,
                id: scenarioId,
                filename: `${scenarioId}.json`,
                loadedAt: new Date().toISOString(),
                validation: validation,
                repaired: true,
                repairMethod: strategy.name || 'unknown'
              }
            }
          }
        } catch (repairError) {
          // Continue to next strategy
          continue
        }
      }

      return { success: false, error: 'All repair strategies failed' }

    } catch (error) {
      return { success: false, error: `Repair attempt failed: ${error.message}` }
    }
  }

  /**
   * Attempt to repair validation errors
   * @param {string} scenarioId - The scenario ID
   * @param {Error} error - The validation error
   * @returns {Promise<Object>} Repair result
   */
  async attemptValidationRepair(scenarioId, error) {
    try {
      // Try to load the raw scenario data
      const response = await fetch(`/scenarios/${scenarioId}.json`)
      if (!response.ok) {
        return { success: false, error: 'Could not fetch file for validation repair' }
      }

      const scenarioData = await response.json()
      const repairedData = { ...scenarioData }

      // Apply common validation repairs
      const repairs = []

      // Fix missing required fields
      if (!repairedData.id) {
        repairedData.id = scenarioId
        repairs.push('Added missing ID')
      }

      if (!repairedData.name) {
        repairedData.name = this.generateNameFromId(scenarioId)
        repairs.push('Generated name from ID')
      }

      if (!repairedData.description) {
        repairedData.description = `Auto-generated description for ${repairedData.name || scenarioId}`
        repairs.push('Added default description')
      }

      // Fix invalid ID format
      if (repairedData.id && !/^[a-z0-9-]+$/.test(repairedData.id)) {
        repairedData.id = repairedData.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        repairs.push('Fixed ID format')
      }

      // Ensure arrays exist for optional fields
      if (!Array.isArray(repairedData.datasets)) {
        repairedData.datasets = []
        repairs.push('Initialized datasets array')
      }

      if (!Array.isArray(repairedData.systemPrompts)) {
        repairedData.systemPrompts = []
        repairs.push('Initialized systemPrompts array')
      }

      if (!Array.isArray(repairedData.userPrompts)) {
        repairedData.userPrompts = []
        repairs.push('Initialized userPrompts array')
      }

      if (!Array.isArray(repairedData.tools)) {
        repairedData.tools = []
        repairs.push('Initialized tools array')
      }

      // Fix configuration object
      if (!repairedData.configuration || typeof repairedData.configuration !== 'object') {
        repairedData.configuration = {
          allowCustomPrompts: true,
          allowDatasetModification: false,
          defaultStreamingEnabled: true,
          maxIterations: 10,
          recommendedModels: []
        }
        repairs.push('Added default configuration')
      }

      // Validate the repaired data
      const validation = await this.validateScenarioOptimized(repairedData, {
        validateFiles: false
      })

      if (validation.isValid || Object.keys(validation.errors).length < Object.keys(error.validation?.errors || {}).length) {
        console.log(`[ScenarioService] Successfully repaired validation for ${scenarioId}:`, repairs)

        return {
          success: true,
          scenario: {
            ...repairedData,
            filename: `${scenarioId}.json`,
            loadedAt: new Date().toISOString(),
            validation: validation,
            repaired: true,
            repairs: repairs
          }
        }
      }

      return { success: false, error: 'Validation repair did not resolve all issues' }

    } catch (error) {
      return { success: false, error: `Validation repair failed: ${error.message}` }
    }
  }

  /**
   * Create a fallback scenario when the original cannot be loaded
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Object>} Fallback result
   */
  async createFallbackScenario(scenarioId) {
    try {
      const fallbackScenario = {
        id: scenarioId,
        name: this.generateNameFromId(scenarioId),
        description: `Fallback scenario created due to loading error. This is a basic scenario template.`,
        datasets: [],
        systemPrompts: [
          {
            id: 'default-system',
            name: 'Default System Prompt',
            content: 'You are a helpful AI assistant. Analyze the provided data and respond with clear, accurate information.'
          }
        ],
        userPrompts: [
          {
            id: 'default-user',
            name: 'Default User Prompt',
            content: 'Please analyze the provided data and provide insights.'
          }
        ],
        tools: [],
        configuration: {
          allowCustomPrompts: true,
          allowDatasetModification: false,
          defaultStreamingEnabled: true,
          maxIterations: 10,
          recommendedModels: []
        },
        examples: [],
        filename: `${scenarioId}.json`,
        loadedAt: new Date().toISOString(),
        isFallback: true
      }

      return {
        success: true,
        scenario: fallbackScenario
      }

    } catch (error) {
      return { success: false, error: `Fallback creation failed: ${error.message}` }
    }
  }

  /**
   * Load scenario from cache as recovery mechanism
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Object>} Cache result
   */
  async loadFromCache(scenarioId) {
    try {
      // Check content cache first
      const cached = this.contentCache.get(`scenario-file-${scenarioId}.json`)
      if (cached) {
        console.log(`[ScenarioService] Recovered ${scenarioId} from content cache`)
        return {
          success: true,
          scenario: {
            ...cached,
            loadedAt: new Date().toISOString(),
            fromCache: true,
            cacheRecovery: true
          }
        }
      }

      // Check if we have metadata and can reconstruct basic scenario
      const metadata = this.scenarioMetadata.get(scenarioId)
      if (metadata) {
        const basicScenario = {
          id: scenarioId,
          name: metadata.name || this.generateNameFromId(scenarioId),
          description: metadata.description || 'Recovered from metadata cache',
          datasets: [],
          systemPrompts: [],
          userPrompts: [],
          tools: [],
          configuration: {
            allowCustomPrompts: true,
            allowDatasetModification: false,
            defaultStreamingEnabled: true,
            maxIterations: 10,
            recommendedModels: []
          },
          examples: [],
          filename: metadata.filename || `${scenarioId}.json`,
          loadedAt: new Date().toISOString(),
          fromMetadataCache: true,
          cacheRecovery: true
        }

        console.log(`[ScenarioService] Recovered ${scenarioId} from metadata cache`)
        return {
          success: true,
          scenario: basicScenario
        }
      }

      return { success: false, error: 'No cached data available' }

    } catch (error) {
      return { success: false, error: `Cache recovery failed: ${error.message}` }
    }
  }

  /**
   * Create a placeholder scenario for error cases
   * @param {string} scenarioId - The scenario ID
   * @param {Error} originalError - The original error
   * @returns {Promise<Object>} Placeholder result
   */
  async createPlaceholderScenario(scenarioId, originalError) {
    try {
      const placeholderScenario = {
        id: scenarioId,
        name: `${this.generateNameFromId(scenarioId)} (Error)`,
        description: `This scenario could not be loaded due to an error: ${originalError.message}. This is a placeholder to maintain system functionality.`,
        datasets: [],
        systemPrompts: [
          {
            id: 'error-system',
            name: 'Error Recovery System Prompt',
            content: 'You are a helpful AI assistant. The original scenario could not be loaded, but you can still assist with general tasks.'
          }
        ],
        userPrompts: [
          {
            id: 'error-user',
            name: 'Error Recovery User Prompt',
            content: 'Please help me with my request, even though the original scenario is unavailable.'
          }
        ],
        tools: [],
        configuration: {
          allowCustomPrompts: true,
          allowDatasetModification: false,
          defaultStreamingEnabled: true,
          maxIterations: 10,
          recommendedModels: []
        },
        examples: [],
        filename: `${scenarioId}.json`,
        loadedAt: new Date().toISOString(),
        isPlaceholder: true,
        originalError: {
          message: originalError.message,
          type: this.classifyError(originalError),
          timestamp: new Date().toISOString()
        }
      }

      return {
        success: true,
        scenario: placeholderScenario
      }

    } catch (error) {
      throw new Error(`Placeholder creation failed: ${error.message}`)
    }
  }

  /**
   * Create minimal placeholder as last resort
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Object>} Minimal placeholder result
   */
  async createMinimalPlaceholder(scenarioId) {
    const minimalScenario = {
      id: scenarioId || 'unknown-scenario',
      name: 'Error Recovery Scenario',
      description: 'Minimal scenario created due to critical loading error.',
      datasets: [],
      systemPrompts: [],
      userPrompts: [],
      tools: [],
      configuration: {},
      examples: [],
      isMinimalPlaceholder: true,
      loadedAt: new Date().toISOString()
    }

    return {
      success: true,
      scenario: minimalScenario
    }
  }

  /**
   * Generate a human-readable name from scenario ID
   * @param {string} scenarioId - The scenario ID
   * @returns {string} Generated name
   */
  generateNameFromId(scenarioId) {
    if (!scenarioId) return 'Unknown Scenario'

    return scenarioId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  /**
   * Resolve dataset file path for a scenario
   * @param {string} scenarioId - The scenario ID
   * @param {string} datasetFile - The dataset file path from scenario config
   * @returns {Promise<string>} Resolved dataset URL
   */
  async resolveDatasetPath(scenarioId, datasetFile) {
    // If the scenario is loaded from a folder structure, try scenario-relative path first
    const scenario = this.scenarios.get(scenarioId)
    if (scenario && scenario.filename && scenario.filename.includes('/')) {
      const scenarioFolder = scenario.filename.substring(0, scenario.filename.lastIndexOf('/'))
      const scenarioRelativePath = `/scenarios/${scenarioFolder}/${datasetFile}`

      try {
        const response = await fetch(scenarioRelativePath, { method: 'HEAD' })
        if (response.ok) {
          return scenarioRelativePath
        }
      } catch (error) {
        // Continue to fallback
      }
    }

    // Fallback to traditional datasets directory
    const fallbackPath = `/datasets/${datasetFile}`
    try {
      const response = await fetch(fallbackPath, { method: 'HEAD' })
      if (response.ok) {
        return fallbackPath
      }
    } catch (error) {
      // Continue to final fallback
    }

    // Final fallback: try datasets with scenario ID as folder
    const legacyPath = `/datasets/${scenarioId}/${datasetFile}`
    return legacyPath
  }

  /**
   * Get dataset content for a scenario dataset
   * @param {string} scenarioId - The scenario ID
   * @param {string} datasetId - The dataset ID from scenario config
   * @returns {Promise<string>} Dataset content
   */
  async getDatasetContent(scenarioId, datasetId) {
    try {
      const scenario = this.scenarios.get(scenarioId)
      if (!scenario || !scenario.datasets) {
        throw new Error(`Scenario ${scenarioId} not found or has no datasets`)
      }

      const dataset = scenario.datasets.find(d => d.id === datasetId)
      if (!dataset) {
        throw new Error(`Dataset ${datasetId} not found in scenario ${scenarioId}`)
      }

      const datasetUrl = await this.resolveDatasetPath(scenarioId, dataset.file)
      const response = await fetch(datasetUrl)

      if (!response.ok) {
        throw new Error(`Failed to load dataset file: ${response.status} ${response.statusText}`)
      }

      if (dataset.file.endsWith('.json')) {
        const jsonData = await response.json()
        return JSON.stringify(jsonData, null, 2)
      } else {
        return await response.text()
      }
    } catch (error) {
      console.error(`[ScenarioService] Error loading dataset content:`, error)
      throw error
    }
  }

  /**
   * Get suggestions for fixing errors with enhanced context
   * @param {Error} error - The error
   * @param {string} filename - The filename
   * @returns {Array} Array of detailed suggestion objects
   */
  getErrorSuggestions(error, filename) {
    const suggestions = []
    const errorType = this.classifyError(error)
    const errorMessage = error.message || ''

    switch (errorType) {
      case 'json_parse_error':
        suggestions.push({
          type: 'immediate',
          action: 'Check JSON syntax',
          description: 'Look for missing commas, brackets, or quotes in the JSON file',
          priority: 'high'
        })

        if (errorMessage.includes('line')) {
          suggestions.push({
            type: 'specific',
            action: 'Fix syntax error at specific line',
            description: 'The error message indicates the exact line with the problem',
            priority: 'high'
          })
        }

        suggestions.push({
          type: 'tool',
          action: 'Use JSON validator',
          description: 'Use an online JSON validator or IDE extension to identify syntax errors',
          priority: 'medium'
        })

        suggestions.push({
          type: 'prevention',
          action: 'Enable JSON validation in editor',
          description: 'Configure your code editor to validate JSON files automatically',
          priority: 'low'
        })
        break

      case 'file_not_found':
        suggestions.push({
          type: 'immediate',
          action: 'Verify file location',
          description: `Ensure the file ${filename} exists in the /public/scenarios/ directory`,
          priority: 'high'
        })

        suggestions.push({
          type: 'check',
          action: 'Check file name',
          description: 'Verify the file name spelling, case sensitivity, and .json extension',
          priority: 'high'
        })

        suggestions.push({
          type: 'alternative',
          action: 'Create missing file',
          description: 'Use the scenario builder to create the missing scenario file',
          priority: 'medium'
        })
        break

      case 'access_denied':
        suggestions.push({
          type: 'immediate',
          action: 'Check file permissions',
          description: 'Ensure the scenarios directory and files have proper read permissions',
          priority: 'high'
        })

        suggestions.push({
          type: 'server',
          action: 'Verify server configuration',
          description: 'Check that the web server can serve files from the scenarios directory',
          priority: 'medium'
        })
        break

      case 'validation_error':
        suggestions.push({
          type: 'immediate',
          action: 'Review scenario structure',
          description: 'Check the scenario against the expected schema format',
          priority: 'high'
        })

        if (errorMessage.includes('required')) {
          suggestions.push({
            type: 'specific',
            action: 'Add missing required fields',
            description: 'Ensure id, name, and description fields are present and non-empty',
            priority: 'high'
          })
        }

        if (errorMessage.includes('array')) {
          suggestions.push({
            type: 'specific',
            action: 'Fix array formatting',
            description: 'Ensure datasets, prompts, and tools are properly formatted as arrays',
            priority: 'medium'
          })
        }

        suggestions.push({
          type: 'tool',
          action: 'Use scenario builder',
          description: 'Create or edit the scenario using the built-in scenario builder interface',
          priority: 'medium'
        })
        break

      case 'network_error':
        suggestions.push({
          type: 'immediate',
          action: 'Check network connection',
          description: 'Verify your internet connection is stable and working',
          priority: 'high'
        })

        suggestions.push({
          type: 'retry',
          action: 'Retry the operation',
          description: 'Network issues are often temporary - try again in a few moments',
          priority: 'medium'
        })

        suggestions.push({
          type: 'alternative',
          action: 'Use cached version',
          description: 'If available, the system may fall back to a cached version',
          priority: 'low'
        })
        break

      default:
        suggestions.push({
          type: 'diagnostic',
          action: 'Check browser console',
          description: 'Look for additional error details in the browser developer console',
          priority: 'high'
        })

        suggestions.push({
          type: 'retry',
          action: 'Refresh and retry',
          description: 'Try reloading the scenarios or refreshing the page',
          priority: 'medium'
        })

        suggestions.push({
          type: 'support',
          action: 'Report the issue',
          description: 'If the problem persists, report it with the error details',
          priority: 'low'
        })
    }

    return suggestions
  }

  /**
   * Enhanced error logging with context and debugging information
   * @param {string} operation - The operation that failed
   * @param {string} scenarioId - The scenario ID
   * @param {Error} error - The error that occurred
   * @param {Object} context - Additional context
   */
  logScenarioError(operation, scenarioId, error, context = {}) {
    const errorInfo = {
      operation,
      scenarioId,
      error: {
        message: error.message,
        type: this.classifyError(error),
        stack: error.stack
      },
      context: {
        ...context,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      },
      systemState: {
        isInitialized: this.isInitialized,
        scenarioCount: this.scenarios.size,
        metadataCount: this.scenarioMetadata.size,
        cacheStats: {
          metadata: this.metadataCache.getStats(),
          content: this.contentCache.getStats(),
          validation: this.validationCache.getStats()
        }
      }
    }

    // Log to console with structured format
    console.group(`🚨 Scenario Service Error - ${operation}`)
    console.error('Scenario ID:', scenarioId)
    console.error('Error Type:', errorInfo.error.type)
    console.error('Message:', errorInfo.error.message)
    console.error('Context:', errorInfo.context)
    console.error('System State:', errorInfo.systemState)

    if (errorInfo.error.stack) {
      console.error('Stack Trace:', errorInfo.error.stack)
    }

    console.groupEnd()

    // Store error for debugging
    try {
      const errorLog = JSON.parse(localStorage.getItem('scenario-error-log') || '[]')
      errorLog.unshift(errorInfo)
      localStorage.setItem('scenario-error-log', JSON.stringify(errorLog.slice(0, 50)))
    } catch (storageError) {
      console.warn('Failed to store error log:', storageError)
    }

    // Record operation for analytics
    this.recordOperation(operation, scenarioId, {
      success: false,
      error: errorInfo.error.message,
      errorType: errorInfo.error.type,
      context: errorInfo.context
    })
  }

  /**
   * Get comprehensive error diagnostics for debugging
   * @param {string} scenarioId - The scenario ID
   * @returns {Object} Diagnostic information
   */
  getErrorDiagnostics(scenarioId) {
    const diagnostics = {
      scenarioId,
      timestamp: new Date().toISOString(),
      serviceState: {
        isInitialized: this.isInitialized,
        lastScanTime: this.lastScanTime,
        scenarioCount: this.scenarios.size,
        metadataCount: this.scenarioMetadata.size,
        scanErrors: this.scanErrors
      },
      cacheState: {
        metadata: this.metadataCache.getStats(),
        content: this.contentCache.getStats(),
        validation: this.validationCache.getStats(),
        directory: this.directoryCache.getStats()
      },
      performanceMetrics: this.performanceMetrics,
      operationHistory: this.operationHistory.slice(-10), // Last 10 operations
      scenarioStatus: {
        exists: this.scenarios.has(scenarioId),
        hasMetadata: this.scenarioMetadata.has(scenarioId),
        isCached: this.contentCache.get(`scenario-file-${scenarioId}.json`) !== null
      }
    }

    // Add specific scenario information if available
    if (this.scenarios.has(scenarioId)) {
      const scenario = this.scenarios.get(scenarioId)
      diagnostics.scenarioInfo = {
        id: scenario.id,
        name: scenario.name,
        filename: scenario.filename,
        loadedAt: scenario.loadedAt,
        isValid: scenario.validation?.isValid,
        validationErrors: scenario.validation?.errors,
        isRepaired: scenario.repaired,
        isFallback: scenario.isFallback,
        isPlaceholder: scenario.isPlaceholder
      }
    }

    // Add recent errors for this scenario
    try {
      const errorLog = JSON.parse(localStorage.getItem('scenario-error-log') || '[]')
      diagnostics.recentErrors = errorLog
        .filter(entry => entry.scenarioId === scenarioId)
        .slice(0, 5)
    } catch (error) {
      diagnostics.recentErrors = []
    }

    return diagnostics
  }

  /**
   * Validate scenario with enhanced error reporting
   * @param {Object} scenarioData - The scenario data
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Enhanced validation result
   */
  async validateScenarioWithEnhancedErrors(scenarioData, options = {}) {
    const startTime = performance.now()

    try {
      // Perform standard validation
      const validation = await this.validateScenarioOptimized(scenarioData, options)

      // Enhance error messages with suggestions
      if (!validation.isValid) {
        const enhancedErrors = {}

        for (const [field, message] of Object.entries(validation.errors)) {
          enhancedErrors[field] = {
            message,
            suggestions: this.getFieldSpecificSuggestions(field, message, scenarioData),
            severity: this.getErrorSeverity(field, message),
            fixable: this.isFieldFixable(field, message)
          }
        }

        validation.enhancedErrors = enhancedErrors
      }

      // Add performance information
      validation.validationTime = Math.round(performance.now() - startTime)

      // Add context information
      validation.validationContext = {
        timestamp: new Date().toISOString(),
        options,
        scenarioId: scenarioData.id,
        validatorVersion: '1.0.0'
      }

      return validation

    } catch (error) {
      return {
        isValid: false,
        errors: {
          validation: `Enhanced validation failed: ${error.message}`
        },
        enhancedErrors: {
          validation: {
            message: `Enhanced validation failed: ${error.message}`,
            suggestions: [
              {
                type: 'immediate',
                action: 'Check scenario data format',
                description: 'Ensure the scenario data is a valid object',
                priority: 'high'
              }
            ],
            severity: 'high',
            fixable: false
          }
        },
        warnings: [],
        metadata: {},
        validationTime: Math.round(performance.now() - startTime),
        validationContext: {
          timestamp: new Date().toISOString(),
          options,
          error: error.message
        }
      }
    }
  }

  /**
   * Get field-specific suggestions for validation errors
   * @param {string} field - The field with the error
   * @param {string} message - The error message
   * @param {Object} scenarioData - The scenario data
   * @returns {Array} Field-specific suggestions
   */
  getFieldSpecificSuggestions(field, message, scenarioData) {
    const suggestions = []

    switch (field) {
      case 'id':
        if (message.includes('required')) {
          suggestions.push({
            type: 'fix',
            action: 'Add scenario ID',
            description: 'Provide a unique identifier using lowercase letters, numbers, and hyphens',
            example: 'fraud-detection-basic'
          })
        } else if (message.includes('format')) {
          suggestions.push({
            type: 'fix',
            action: 'Fix ID format',
            description: 'Use only lowercase letters, numbers, and hyphens',
            example: scenarioData.id ? scenarioData.id.toLowerCase().replace(/[^a-z0-9-]/g, '-') : 'my-scenario'
          })
        }
        break

      case 'name':
        suggestions.push({
          type: 'fix',
          action: 'Add descriptive name',
          description: 'Provide a human-readable name for the scenario',
          example: 'Fraud Detection Analysis'
        })
        break

      case 'description':
        suggestions.push({
          type: 'fix',
          action: 'Add scenario description',
          description: 'Explain what this scenario is used for and its purpose',
          example: 'Analyze transaction data to identify potential fraud patterns'
        })
        break

      default:
        if (field.includes('datasets')) {
          suggestions.push({
            type: 'fix',
            action: 'Fix dataset configuration',
            description: 'Ensure datasets array contains valid dataset objects with id, name, description, and file fields'
          })
        } else if (field.includes('tools')) {
          suggestions.push({
            type: 'fix',
            action: 'Fix tool configuration',
            description: 'Ensure tools array contains valid tool objects with name, description, and inputSchema fields'
          })
        }
    }

    return suggestions
  }

  /**
   * Determine error severity level
   * @param {string} field - The field with the error
   * @param {string} message - The error message
   * @returns {string} Severity level
   */
  getErrorSeverity(field, message) {
    // Critical errors that prevent scenario from loading
    if (['id', 'name', 'description'].includes(field)) {
      return 'high'
    }

    // Validation errors that affect functionality
    if (message.includes('required') || message.includes('invalid')) {
      return 'medium'
    }

    // Format or structure issues
    return 'low'
  }

  /**
   * Determine if a field error can be automatically fixed
   * @param {string} field - The field with the error
   * @param {string} message - The error message
   * @returns {boolean} Whether the error is fixable
   */
  isFieldFixable(field, message) {
    // Missing required fields can often be auto-generated
    if (['id', 'name', 'description'].includes(field) && message.includes('required')) {
      return true
    }

    // Format issues can usually be corrected
    if (message.includes('format') || message.includes('must be')) {
      return true
    }

    // Array initialization issues are fixable
    if (message.includes('must be an array')) {
      return true
    }

    return false
  }

  /**
   * Get a scenario by ID with lazy loading optimization
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Object|null>} The scenario object or null if not found
   */
  async getScenario(scenarioId) {
    try {
      if (!this.isInitialized) {
        await this.initialize()
      }

      // Check if scenario is already loaded in memory
      const scenario = this.scenarios.get(scenarioId)
      if (scenario) {
        return scenario
      }

      // Try lazy loading if we have metadata but not full content
      const metadata = this.scenarioMetadata.get(scenarioId)
      if (metadata && metadata.filename) {
        console.log(`[ScenarioService] Lazy loading scenario: ${scenarioId}`)

        return this.lazyLoader.load(`scenario-${scenarioId}`, async () => {
          const loadResult = await this.loadScenarioFileOptimized(metadata.filename)

          if (loadResult.success) {
            return this.scenarios.get(scenarioId)
          } else {
            throw new Error(`Failed to lazy load scenario: ${loadResult.error?.message}`)
          }
        })
      }

      console.warn(`[ScenarioService] Scenario not found: ${scenarioId}`)
      return null
    } catch (error) {
      console.error(`[ScenarioService] Error getting scenario ${scenarioId}:`, error)
      throw error
    }
  }

  /**
   * Get scenario metadata by ID
   * @param {string} scenarioId - The scenario ID
   * @returns {Object|null} The scenario metadata or null if not found
   */
  getScenarioMetadata(scenarioId) {
    return this.scenarioMetadata.get(scenarioId) || null
  }

  /**
   * Get list of all available scenarios with optimized loading
   * @returns {Promise<Object[]>} Array of scenario metadata objects
   */
  async getScenarioList() {
    try {
      if (!this.isInitialized) {
        await this.initialize()
      }

      // Check if we have cached metadata list
      const cached = this.metadataCache.get('scenario-list')
      if (cached && this.isRecentCache(cached.timestamp)) {
        console.log('[ScenarioService] Using cached scenario list')
        return cached.scenarios.sort((a, b) => a.name.localeCompare(b.name))
      }

      // Build fresh list from current metadata
      const scenarios = Array.from(this.scenarioMetadata.values()).sort((a, b) => {
        return a.name.localeCompare(b.name)
      })

      // Cache the list
      this.metadataCache.set('scenario-list', {
        scenarios: scenarios,
        timestamp: Date.now()
      })

      return scenarios
    } catch (error) {
      console.error('[ScenarioService] Error getting scenario list:', error)
      return []
    }
  }

  /**
   * Optimized scenario validation with performance caching
   * @param {Object} scenarioData - The scenario data to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  async validateScenarioOptimized(scenarioData, options = {}) {
    const startTime = performance.now()

    try {
      // Create cache key based on content hash for better cache efficiency
      const cacheKey = this.createValidationCacheKey(scenarioData, options)

      // Check validation cache
      if (!options.skipCache) {
        const cached = this.validationCache.get(cacheKey)
        if (cached) {
          console.log('[ScenarioService] Using cached validation result')
          return cached
        }
      }

      // Perform optimized validation
      const result = await this.performOptimizedValidation(scenarioData, options)

      // Cache the result
      this.validationCache.set(cacheKey, result)

      const duration = performance.now() - startTime
      this.recordPerformanceMetric('validation', duration)

      return result
    } catch (error) {
      console.error('[ScenarioService] Error validating scenario:', error)
      return {
        isValid: false,
        errors: { general: `Validation failed: ${error.message}` },
        warnings: [],
        metadata: {},
        validationDetails: {
          schemaValidation: false,
          structureValidation: false,
          contentValidation: false,
          crossReferenceValidation: false
        }
      }
    }
  }

  /**
   * Create efficient cache key for validation
   * @param {Object} scenarioData - The scenario data
   * @param {Object} options - Validation options
   * @returns {string} Cache key
   */
  createValidationCacheKey(scenarioData, options) {
    // Create a lightweight hash of the scenario data
    const keyData = {
      id: scenarioData.id,
      name: scenarioData.name,
      datasetCount: scenarioData.datasets?.length || 0,
      toolCount: scenarioData.tools?.length || 0,
      systemPromptCount: scenarioData.systemPrompts?.length || 0,
      userPromptCount: scenarioData.userPrompts?.length || 0,
      validateFiles: options.validateFiles,
      lastModified: scenarioData.lastModified
    }

    return `validation-${JSON.stringify(keyData)}`
  }

  /**
   * Perform optimized validation with selective checks
   * @param {Object} scenarioData - The scenario data to validate
   * @param {Object} options - Validation options
   * @returns {Object} Detailed validation result
   */
  async performOptimizedValidation(scenarioData, options = {}) {
    const validationDetails = {
      schemaValidation: false,
      structureValidation: false,
      contentValidation: false,
      crossReferenceValidation: false,
      fileValidation: false
    }

    // Step 1: Fast basic schema validation
    const basicValidation = validateScenario(scenarioData)
    validationDetails.schemaValidation = basicValidation.isValid

    if (!basicValidation.isValid) {
      return {
        ...basicValidation,
        validationDetails
      }
    }

    // Step 2: Parallel validation of different aspects
    const validationPromises = []

    // Structure validation (lightweight)
    validationPromises.push(
      this.validateScenarioStructureOptimized(scenarioData)
        .then(result => ({ type: 'structure', result }))
    )

    // Content validation (can be heavy, so make it optional)
    if (options.validateContent !== false) {
      validationPromises.push(
        this.validateScenarioContentOptimized(scenarioData)
          .then(result => ({ type: 'content', result }))
      )
    }

    // Cross-reference validation (lightweight)
    validationPromises.push(
      this.validateCrossReferencesOptimized(scenarioData)
        .then(result => ({ type: 'crossReference', result }))
    )

    // File validation (expensive, only if requested)
    if (options.validateFiles === true) {
      validationPromises.push(
        this.validateReferencedFilesOptimized(scenarioData, {
          scenarioPath: options.filename || scenarioData.filename
        })
          .then(result => ({ type: 'files', result }))
      )
    }

    // Execute validations in parallel
    const validationResults = await Promise.all(validationPromises)

    // Combine results
    const combinedErrors = { ...basicValidation.errors }
    const combinedWarnings = [...basicValidation.warnings]

    for (const { type, result } of validationResults) {
      validationDetails[`${type}Validation`] = result.isValid
      Object.assign(combinedErrors, result.errors)
      combinedWarnings.push(...result.warnings)
    }

    return {
      isValid: Object.keys(combinedErrors).length === 0,
      errors: combinedErrors,
      warnings: combinedWarnings,
      metadata: basicValidation.metadata,
      validationDetails
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async validateScenario(scenarioData, options = {}) {
    return this.validateScenarioOptimized(scenarioData, options)
  }

  /**
   * Perform comprehensive validation with detailed checks
   * @param {Object} scenarioData - The scenario data to validate
   * @param {Object} options - Validation options
   * @returns {Object} Detailed validation result
   */
  async performComprehensiveValidation(scenarioData, options = {}) {
    const validationDetails = {
      schemaValidation: false,
      structureValidation: false,
      contentValidation: false,
      crossReferenceValidation: false,
      fileValidation: false
    }

    // Step 1: Basic schema validation
    const basicValidation = validateScenario(scenarioData)
    validationDetails.schemaValidation = basicValidation.isValid

    if (!basicValidation.isValid) {
      return {
        ...basicValidation,
        validationDetails
      }
    }

    // Step 2: Enhanced structure validation
    const structureValidation = await this.validateScenarioStructure(scenarioData)
    validationDetails.structureValidation = structureValidation.isValid

    // Step 3: Content validation (check for malformed content)
    const contentValidation = await this.validateScenarioContent(scenarioData)
    validationDetails.contentValidation = contentValidation.isValid

    // Step 4: Cross-reference validation (check ID references)
    const crossRefValidation = await this.validateCrossReferences(scenarioData)
    validationDetails.crossReferenceValidation = crossRefValidation.isValid

    // Step 5: File validation (check if referenced files exist)
    let fileValidation = { isValid: true, errors: {}, warnings: [] }
    if (options.validateFiles !== false) {
      fileValidation = await this.validateReferencedFiles(scenarioData)
      validationDetails.fileValidation = fileValidation.isValid
    }

    // Combine all validation results
    const combinedErrors = {
      ...basicValidation.errors,
      ...structureValidation.errors,
      ...contentValidation.errors,
      ...crossRefValidation.errors,
      ...fileValidation.errors
    }

    const combinedWarnings = [
      ...basicValidation.warnings,
      ...structureValidation.warnings,
      ...contentValidation.warnings,
      ...crossRefValidation.warnings,
      ...fileValidation.warnings
    ]

    return {
      isValid: Object.keys(combinedErrors).length === 0,
      errors: combinedErrors,
      warnings: combinedWarnings,
      metadata: basicValidation.metadata,
      validationDetails
    }
  }

  /**
   * Optimized scenario structure validation
   * @param {Object} scenarioData - The scenario data
   * @returns {Object} Structure validation result
   */
  async validateScenarioStructureOptimized(scenarioData) {
    const errors = {}
    const warnings = []

    try {
      // Fast ID validation
      if (scenarioData.id) {
        if (!/^[a-z0-9-]+$/.test(scenarioData.id)) {
          errors.id = 'Scenario ID must contain only lowercase letters, numbers, and hyphens'
        } else if (scenarioData.id.length > 50) {
          errors.id = 'Scenario ID must be 50 characters or less'
        }
      }

      // Quick length checks
      if (scenarioData.description?.length > 1000) {
        warnings.push('Description is very long (>1000 characters) - consider shortening for better readability')
      }

      // Array size checks
      const datasetCount = scenarioData.datasets?.length || 0
      const toolCount = scenarioData.tools?.length || 0

      if (datasetCount > 20) {
        warnings.push('Large number of datasets (>20) may impact performance')
      }

      if (toolCount > 15) {
        warnings.push('Large number of tools (>15) may impact performance')
      }

      // Batch validate prompts for better performance
      if (scenarioData.systemPrompts?.length > 0) {
        const longPrompts = scenarioData.systemPrompts
          .map((prompt, index) => ({ prompt, index }))
          .filter(({ prompt }) => prompt.content?.length > 5000)

        longPrompts.forEach(({ index }) => {
          warnings.push(`System prompt ${index + 1} is very long (>5000 characters)`)
        })
      }

      if (scenarioData.userPrompts?.length > 0) {
        const longPrompts = scenarioData.userPrompts
          .map((prompt, index) => ({ prompt, index }))
          .filter(({ prompt }) => prompt.content?.length > 2000)

        longPrompts.forEach(({ index }) => {
          warnings.push(`User prompt ${index + 1} is very long (>2000 characters)`)
        })
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors,
        warnings
      }
    } catch (error) {
      return {
        isValid: false,
        errors: { structure: `Structure validation failed: ${error.message}` },
        warnings: []
      }
    }
  }

  /**
   * Optimized content validation with security checks
   * @param {Object} scenarioData - The scenario data
   * @returns {Object} Content validation result
   */
  async validateScenarioContentOptimized(scenarioData) {
    const errors = {}
    const warnings = []

    try {
      // Pre-compiled regex patterns for better performance
      const suspiciousPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /data:text\/html/gi,
        /vbscript:/gi
      ]

      // Optimized content checking function
      const checkContent = (content, fieldName) => {
        if (typeof content === 'string' && content.length > 0) {
          for (const pattern of suspiciousPatterns) {
            if (pattern.test(content)) {
              errors[fieldName] = `Potentially unsafe content detected in ${fieldName}`
              break
            }
          }
        }
      }

      // Check description
      checkContent(scenarioData.description, 'description')

      // Batch check prompts
      if (scenarioData.systemPrompts?.length > 0) {
        scenarioData.systemPrompts.forEach((prompt, index) => {
          checkContent(prompt.content, `systemPrompts[${index}].content`)
        })
      }

      if (scenarioData.userPrompts?.length > 0) {
        scenarioData.userPrompts.forEach((prompt, index) => {
          checkContent(prompt.content, `userPrompts[${index}].content`)
        })
      }

      // Validate tool schemas efficiently
      if (scenarioData.tools?.length > 0) {
        const schemaValidationPromises = scenarioData.tools.map(async (tool, index) => {
          try {
            if (tool.inputSchema) {
              this.validateJsonSchemaOptimized(tool.inputSchema)
            }
          } catch (schemaError) {
            errors[`tools[${index}].inputSchema`] = `Invalid JSON Schema: ${schemaError.message}`
          }
        })

        await Promise.all(schemaValidationPromises)
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors,
        warnings
      }
    } catch (error) {
      return {
        isValid: false,
        errors: { content: `Content validation failed: ${error.message}` },
        warnings: []
      }
    }
  }

  /**
   * Optimized cross-reference validation
   * @param {Object} scenarioData - The scenario data
   * @returns {Object} Cross-reference validation result
   */
  async validateCrossReferencesOptimized(scenarioData) {
    const errors = {}
    const warnings = []

    try {
      // Build ID sets efficiently
      const idSets = {
        datasets: new Set(scenarioData.datasets?.map(d => d.id).filter(Boolean) || []),
        systemPrompts: new Set(scenarioData.systemPrompts?.map(p => p.id).filter(Boolean) || []),
        userPrompts: new Set(scenarioData.userPrompts?.map(p => p.id).filter(Boolean) || []),
        tools: new Set(scenarioData.tools?.map(t => t.name).filter(Boolean) || [])
      }

      // Validate examples efficiently
      if (scenarioData.examples?.length > 0) {
        scenarioData.examples.forEach((example, index) => {
          if (example.systemPrompt && !idSets.systemPrompts.has(example.systemPrompt)) {
            errors[`examples[${index}].systemPrompt`] = `References non-existent system prompt: ${example.systemPrompt}`
          }

          if (example.userPrompt && !idSets.userPrompts.has(example.userPrompt)) {
            errors[`examples[${index}].userPrompt`] = `References non-existent user prompt: ${example.userPrompt}`
          }

          if (example.dataset && !idSets.datasets.has(example.dataset)) {
            errors[`examples[${index}].dataset`] = `References non-existent dataset: ${example.dataset}`
          }
        })
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors,
        warnings
      }
    } catch (error) {
      return {
        isValid: false,
        errors: { crossReference: `Cross-reference validation failed: ${error.message}` },
        warnings: []
      }
    }
  }

  /**
   * Optimized file validation with parallel checks (supports scenario folders)
   * @param {Object} scenarioData - The scenario data
   * @param {Object} options - Validation options including scenario path
   * @returns {Object} File validation result
   */
  async validateReferencedFilesOptimized(scenarioData, options = {}) {
    const errors = {}
    const warnings = []

    try {
      if (!scenarioData.datasets?.length) {
        return { isValid: true, errors: {}, warnings: [] }
      }

      // Determine base path for file resolution
      const scenarioPath = options.scenarioPath || ''
      const basePath = scenarioPath.includes('/')
        ? `/scenarios/${scenarioPath.substring(0, scenarioPath.lastIndexOf('/'))}/`
        : '/datasets/'

      // Check files in parallel with limited concurrency
      const batchSize = 3
      const datasets = scenarioData.datasets

      for (let i = 0; i < datasets.length; i += batchSize) {
        const batch = datasets.slice(i, i + batchSize)

        const fileChecks = batch.map(async (dataset, batchIndex) => {
          const index = i + batchIndex

          if (dataset.file) {
            try {
              // Try scenario-relative path first, then fallback to datasets path
              const scenarioRelativePath = `${basePath}${dataset.file}`
              const datasetsPath = `/datasets/${dataset.file}`

              let response = await fetch(scenarioRelativePath, { method: 'HEAD' })

              if (!response.ok && basePath !== '/datasets/') {
                // Fallback to datasets directory
                response = await fetch(datasetsPath, { method: 'HEAD' })
              }

              if (!response.ok) {
                return { index, error: `Dataset file not found: ${dataset.file}` }
              }
            } catch (error) {
              return { index, error: `Cannot access dataset file: ${dataset.file}` }
            }
          }
          return null
        })

        const results = await Promise.all(fileChecks)

        // Process results
        results.forEach(result => {
          if (result) {
            errors[`datasets[${result.index}].file`] = result.error
          }
        })
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors,
        warnings
      }
    } catch (error) {
      return {
        isValid: false,
        errors: { files: `File validation failed: ${error.message}` },
        warnings: []
      }
    }
  }

  /**
   * Optimized JSON Schema validation
   * @param {Object} schema - The JSON schema to validate
   */
  validateJsonSchemaOptimized(schema) {
    if (!schema || typeof schema !== 'object') {
      throw new Error('Schema must be an object')
    }

    // Quick validation of common schema properties
    const validTypes = ['object', 'array', 'string', 'number', 'boolean', 'null']

    if (schema.type && !validTypes.includes(schema.type)) {
      throw new Error(`Invalid schema type: ${schema.type}`)
    }

    if (schema.properties && typeof schema.properties !== 'object') {
      throw new Error('Schema properties must be an object')
    }

    if (schema.required && !Array.isArray(schema.required)) {
      throw new Error('Schema required must be an array')
    }

    // Recursively validate nested schemas (with depth limit for performance)
    if (schema.properties) {
      this.validateNestedSchemas(schema.properties, 0, 5) // Max depth of 5
    }
  }

  /**
   * Validate nested schemas with depth limiting
   * @param {Object} properties - Schema properties
   * @param {number} currentDepth - Current nesting depth
   * @param {number} maxDepth - Maximum allowed depth
   */
  validateNestedSchemas(properties, currentDepth, maxDepth) {
    if (currentDepth >= maxDepth) {
      return // Skip validation at max depth to prevent performance issues
    }

    for (const [key, subSchema] of Object.entries(properties)) {
      if (typeof subSchema === 'object' && subSchema !== null) {
        this.validateJsonSchemaOptimized(subSchema)

        if (subSchema.properties) {
          this.validateNestedSchemas(subSchema.properties, currentDepth + 1, maxDepth)
        }
      }
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async validateScenarioStructure(scenarioData) {
    const errors = {}
    const warnings = []

    try {
      // Validate ID format and uniqueness
      if (scenarioData.id) {
        if (!/^[a-z0-9-]+$/.test(scenarioData.id)) {
          errors.id = 'Scenario ID must contain only lowercase letters, numbers, and hyphens'
        }

        if (scenarioData.id.length > 50) {
          errors.id = 'Scenario ID must be 50 characters or less'
        }
      }

      // Validate content lengths
      if (scenarioData.description && scenarioData.description.length > 1000) {
        warnings.push('Description is very long (>1000 characters) - consider shortening for better readability')
      }

      // Validate array sizes
      if (scenarioData.datasets && scenarioData.datasets.length > 20) {
        warnings.push('Large number of datasets (>20) may impact performance')
      }

      if (scenarioData.tools && scenarioData.tools.length > 15) {
        warnings.push('Large number of tools (>15) may impact performance')
      }

      // Validate prompt content
      if (scenarioData.systemPrompts) {
        scenarioData.systemPrompts.forEach((prompt, index) => {
          if (prompt.content && prompt.content.length > 5000) {
            warnings.push(`System prompt ${index + 1} is very long (>5000 characters)`)
          }
        })
      }

      if (scenarioData.userPrompts) {
        scenarioData.userPrompts.forEach((prompt, index) => {
          if (prompt.content && prompt.content.length > 2000) {
            warnings.push(`User prompt ${index + 1} is very long (>2000 characters)`)
          }
        })
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors,
        warnings
      }
    } catch (error) {
      return {
        isValid: false,
        errors: { structure: `Structure validation failed: ${error.message}` },
        warnings: []
      }
    }
  }

  /**
   * Validate scenario content for malformed data
   * @param {Object} scenarioData - The scenario data
   * @returns {Object} Content validation result
   */
  async validateScenarioContent(scenarioData) {
    const errors = {}
    const warnings = []

    try {
      // Check for potentially malicious content
      const suspiciousPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /data:text\/html/gi,
        /vbscript:/gi
      ]

      const checkContent = (content, fieldName) => {
        if (typeof content === 'string') {
          for (const pattern of suspiciousPatterns) {
            if (pattern.test(content)) {
              errors[fieldName] = `Potentially unsafe content detected in ${fieldName}`
              break
            }
          }
        }
      }

      // Check all text content
      checkContent(scenarioData.description, 'description')

      if (scenarioData.systemPrompts) {
        scenarioData.systemPrompts.forEach((prompt, index) => {
          checkContent(prompt.content, `systemPrompts[${index}].content`)
        })
      }

      if (scenarioData.userPrompts) {
        scenarioData.userPrompts.forEach((prompt, index) => {
          checkContent(prompt.content, `userPrompts[${index}].content`)
        })
      }

      // Validate JSON schema structures in tools
      if (scenarioData.tools) {
        scenarioData.tools.forEach((tool, index) => {
          try {
            if (tool.inputSchema) {
              // Basic JSON Schema validation
              this.validateJsonSchema(tool.inputSchema)
            }
          } catch (schemaError) {
            errors[`tools[${index}].inputSchema`] = `Invalid JSON Schema: ${schemaError.message}`
          }
        })
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors,
        warnings
      }
    } catch (error) {
      return {
        isValid: false,
        errors: { content: `Content validation failed: ${error.message}` },
        warnings: []
      }
    }
  }

  /**
   * Validate cross-references within the scenario
   * @param {Object} scenarioData - The scenario data
   * @returns {Object} Cross-reference validation result
   */
  async validateCrossReferences(scenarioData) {
    const errors = {}
    const warnings = []

    try {
      // Collect all IDs
      const datasetIds = new Set()
      const systemPromptIds = new Set()
      const userPromptIds = new Set()
      const toolNames = new Set()

      if (scenarioData.datasets) {
        scenarioData.datasets.forEach(dataset => {
          if (dataset.id) datasetIds.add(dataset.id)
        })
      }

      if (scenarioData.systemPrompts) {
        scenarioData.systemPrompts.forEach(prompt => {
          if (prompt.id) systemPromptIds.add(prompt.id)
        })
      }

      if (scenarioData.userPrompts) {
        scenarioData.userPrompts.forEach(prompt => {
          if (prompt.id) userPromptIds.add(prompt.id)
        })
      }

      if (scenarioData.tools) {
        scenarioData.tools.forEach(tool => {
          if (tool.name) toolNames.add(tool.name)
        })
      }

      // Validate example references
      if (scenarioData.examples) {
        scenarioData.examples.forEach((example, index) => {
          if (example.systemPrompt && !systemPromptIds.has(example.systemPrompt)) {
            errors[`examples[${index}].systemPrompt`] = `References non-existent system prompt: ${example.systemPrompt}`
          }

          if (example.userPrompt && !userPromptIds.has(example.userPrompt)) {
            errors[`examples[${index}].userPrompt`] = `References non-existent user prompt: ${example.userPrompt}`
          }

          if (example.dataset && !datasetIds.has(example.dataset)) {
            errors[`examples[${index}].dataset`] = `References non-existent dataset: ${example.dataset}`
          }
        })
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors,
        warnings
      }
    } catch (error) {
      return {
        isValid: false,
        errors: { crossReference: `Cross-reference validation failed: ${error.message}` },
        warnings: []
      }
    }
  }

  /**
   * Validate that referenced files exist
   * @param {Object} scenarioData - The scenario data
   * @returns {Object} File validation result
   */
  async validateReferencedFiles(scenarioData) {
    const errors = {}
    const warnings = []

    try {
      // Check dataset files
      if (scenarioData.datasets) {
        const fileChecks = scenarioData.datasets.map(async (dataset, index) => {
          if (dataset.file) {
            try {
              const response = await fetch(`/datasets/${dataset.file}`, { method: 'HEAD' })
              if (!response.ok) {
                errors[`datasets[${index}].file`] = `Dataset file not found: ${dataset.file}`
              }
            } catch (error) {
              errors[`datasets[${index}].file`] = `Cannot access dataset file: ${dataset.file}`
            }
          }
        })

        await Promise.all(fileChecks)
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors,
        warnings
      }
    } catch (error) {
      return {
        isValid: false,
        errors: { files: `File validation failed: ${error.message}` },
        warnings: []
      }
    }
  }

  /**
   * Basic JSON Schema validation
   * @param {Object} schema - The JSON schema to validate
   */
  validateJsonSchema(schema) {
    if (!schema || typeof schema !== 'object') {
      throw new Error('Schema must be an object')
    }

    // Check for required JSON Schema properties
    if (schema.type && !['object', 'array', 'string', 'number', 'boolean', 'null'].includes(schema.type)) {
      throw new Error(`Invalid schema type: ${schema.type}`)
    }

    if (schema.properties && typeof schema.properties !== 'object') {
      throw new Error('Schema properties must be an object')
    }

    if (schema.required && !Array.isArray(schema.required)) {
      throw new Error('Schema required must be an array')
    }

    // Recursively validate nested schemas
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (typeof subSchema === 'object' && subSchema !== null) {
          this.validateJsonSchema(subSchema)
        }
      }
    }
  }

  /**
   * Get system prompts for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Array>} Array of system prompts
   */
  async getSystemPrompts(scenarioId) {
    try {
      const scenario = await this.getScenario(scenarioId)
      return scenario?.systemPrompts || []
    } catch (error) {
      console.error(`[ScenarioService] Error getting system prompts for ${scenarioId}:`, error)
      return []
    }
  }

  /**
   * Get user prompts for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Array>} Array of user prompts
   */
  async getUserPrompts(scenarioId) {
    try {
      const scenario = await this.getScenario(scenarioId)
      return scenario?.userPrompts || []
    } catch (error) {
      console.error(`[ScenarioService] Error getting user prompts for ${scenarioId}:`, error)
      return []
    }
  }

  /**
   * Get datasets for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Array>} Array of datasets
   */
  async getDatasets(scenarioId) {
    try {
      const scenario = await this.getScenario(scenarioId)
      return scenario?.datasets || []
    } catch (error) {
      console.error(`[ScenarioService] Error getting datasets for ${scenarioId}:`, error)
      return []
    }
  }

  /**
   * Get tool configuration for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Object|null>} Tool configuration object
   */
  async getToolConfiguration(scenarioId) {
    try {
      const scenario = await this.getScenario(scenarioId)

      if (!scenario?.tools || scenario.tools.length === 0) {
        return null
      }

      // Convert scenario tools to the format expected by the tool system
      const toolConfig = {
        tools: scenario.tools.map(tool => ({
          toolSpec: {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          },
          handler: tool.handler || null
        })),
        executionMode: this.getToolExecutionMode(scenarioId),
        scenarioId: scenarioId
      }

      return toolConfig
    } catch (error) {
      console.error(`[ScenarioService] Error getting tool configuration for ${scenarioId}:`, error)
      return null
    }
  }

  /**
   * Get UI configuration for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Object>} UI configuration object
   */
  async getUIConfiguration(scenarioId) {
    try {
      const scenario = await this.getScenario(scenarioId)

      if (!scenario) {
        return {
          showDatasetSelector: false,
          showSystemPromptSelector: false,
          showUserPromptSelector: false,
          showToolSettings: false,
          allowCustomPrompts: true
        }
      }

      return {
        showDatasetSelector: this.shouldShowDatasetSelector(scenarioId),
        showSystemPromptSelector: (scenario.systemPrompts?.length || 0) > 0,
        showUserPromptSelector: (scenario.userPrompts?.length || 0) > 0,
        showToolSettings: this.shouldShowToolSettings(scenarioId),
        allowCustomPrompts: scenario.configuration?.allowCustomPrompts !== false,
        allowDatasetModification: scenario.configuration?.allowDatasetModification === true,
        defaultStreamingEnabled: scenario.configuration?.defaultStreamingEnabled !== false,
        maxIterations: scenario.configuration?.maxIterations || 10,
        recommendedModels: scenario.configuration?.recommendedModels || []
      }
    } catch (error) {
      console.error(`[ScenarioService] Error getting UI configuration for ${scenarioId}:`, error)
      return {
        showDatasetSelector: false,
        showSystemPromptSelector: false,
        showUserPromptSelector: false,
        showToolSettings: false,
        allowCustomPrompts: true
      }
    }
  }

  /**
   * Check if dataset selector should be shown for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {boolean} True if dataset selector should be shown
   */
  shouldShowDatasetSelector(scenarioId) {
    const metadata = this.getScenarioMetadata(scenarioId)
    return metadata?.hasDatasets === true && metadata?.datasetCount > 0
  }

  /**
   * Check if tool settings should be shown for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {boolean} True if tool settings should be shown
   */
  shouldShowToolSettings(scenarioId) {
    const metadata = this.getScenarioMetadata(scenarioId)
    return metadata?.hasTools === true && metadata?.toolCount > 0
  }

  /**
   * Get tool execution mode for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {string} Tool execution mode ('detection', 'execution', or 'none')
   */
  getToolExecutionMode(scenarioId) {
    try {
      const scenario = this.scenarios.get(scenarioId)

      if (!scenario?.tools || scenario.tools.length === 0) {
        return 'none'
      }

      // Check if any tools have handlers (execution mode)
      const hasExecutionCapability = scenario.tools.some(tool => tool.handler)

      return hasExecutionCapability ? 'execution' : 'detection'
    } catch (error) {
      console.error(`[ScenarioService] Error getting tool execution mode for ${scenarioId}:`, error)
      return 'none'
    }
  }

  /**
   * Reload scenarios from disk
   * @returns {Promise<Object>} Reload result
   */
  async reloadScenarios() {
    try {
      console.log('[ScenarioService] Reloading scenarios from disk...')

      const loadResult = await this.loadScenarios()
      this.lastScanTime = new Date()

      return {
        success: true,
        message: `Reloaded ${loadResult.successCount} scenarios`,
        scenarioCount: this.scenarios.size,
        errors: this.scanErrors
      }
    } catch (error) {
      const errorInfo = analyzeError(error, { operation: 'reloadScenarios', service: 'ScenarioService' })

      return {
        success: false,
        message: errorInfo.userMessage,
        error: errorInfo.originalMessage
      }
    }
  }

  /**
   * Get comprehensive service status and statistics
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      scenarioCount: this.scenarios.size,
      lastScanTime: this.lastScanTime,
      scanErrors: this.scanErrors,
      currentScenario: this.currentScenario,
      availableScenarios: Array.from(this.scenarioMetadata.keys()),

      // Performance-optimized caching information
      caching: {
        metadata: this.metadataCache.getStats(),
        validation: this.validationCache.getStats(),
        content: this.contentCache.getStats(),
        directory: this.directoryCache.getStats()
      },

      // Lazy loading statistics
      lazyLoading: this.lazyLoader.getStats(),

      // File management
      fileManagement: {
        pendingOperations: this.pendingOperations.size,
        operationHistorySize: this.operationHistory.length,
        fileWatchingEnabled: this.fileWatchingEnabled
      },

      // Enhanced performance metrics
      performance: {
        ...this.getPerformanceStats(),
        lastOptimization: this.performanceMetrics.lastOptimization,
        memoryUsage: this.getMemoryUsageEstimate()
      }
    }
  }

  /**
   * Estimate memory usage of caches
   * @returns {Object} Memory usage estimates
   */
  getMemoryUsageEstimate() {
    const estimate = {
      scenarios: this.scenarios.size * 50, // Rough estimate per scenario (KB)
      metadata: this.scenarioMetadata.size * 5, // Rough estimate per metadata (KB)
      caches: {
        metadata: this.metadataCache.cache.size * 2,
        validation: this.validationCache.cache.size * 10,
        content: this.contentCache.cache.size * 100,
        directory: this.directoryCache.cache.size * 1
      }
    }

    estimate.total = estimate.scenarios + estimate.metadata +
      Object.values(estimate.caches).reduce((sum, val) => sum + val, 0)

    return estimate
  }

  /**
   * Get average validation time from recent operations
   * @returns {number|null} Average validation time in milliseconds
   */
  getAverageValidationTime() {
    const validationOps = this.operationHistory
      .filter(op => op.operation === 'validate' && op.details.duration)
      .slice(0, 10) // Last 10 validations

    if (validationOps.length === 0) return null

    const totalTime = validationOps.reduce((sum, op) => sum + op.details.duration, 0)
    return Math.round(totalTime / validationOps.length)
  }

  /**
   * Calculate cache hit rate
   * @returns {number} Cache hit rate as percentage
   */
  getCacheHitRate() {
    const cacheOps = this.operationHistory
      .filter(op => op.details.cacheHit !== undefined)
      .slice(0, 50) // Last 50 cache operations

    if (cacheOps.length === 0) return 0

    const hits = cacheOps.filter(op => op.details.cacheHit).length
    return Math.round((hits / cacheOps.length) * 100)
  }

  /**
   * Set the current scenario
   * @param {string} scenarioId - The scenario ID to set as current
   * @returns {Promise<boolean>} True if scenario was set successfully
   */
  async setCurrentScenario(scenarioId) {
    try {
      const scenario = await this.getScenario(scenarioId)

      if (scenario) {
        this.currentScenario = scenarioId
        console.log(`[ScenarioService] Set current scenario to: ${scenarioId}`)
        return true
      } else {
        console.warn(`[ScenarioService] Cannot set current scenario - not found: ${scenarioId}`)
        return false
      }
    } catch (error) {
      console.error(`[ScenarioService] Error setting current scenario ${scenarioId}:`, error)
      return false
    }
  }

  /**
   * Get the current scenario
   * @returns {Promise<Object|null>} The current scenario or null
   */
  async getCurrentScenario() {
    if (!this.currentScenario) {
      return null
    }

    return await this.getScenario(this.currentScenario)
  }

  /**
   * Clear the current scenario
   */
  clearCurrentScenario() {
    this.currentScenario = null
    console.log('[ScenarioService] Cleared current scenario')
  }

  /**
   * Create a new scenario with default structure
   * @param {string} id - Scenario ID
   * @param {string} name - Scenario name
   * @param {string} description - Scenario description
   * @returns {Object} New scenario object
   */
  createNewScenario(id, name, description) {
    return createDefaultScenario(id, name, description)
  }

  /**
   * Save a scenario to disk
   * @param {Object} scenarioData - The scenario data to save
   * @param {Object} options - Save options
   * @returns {Promise<Object>} Save result
   */
  async saveScenario(scenarioData, options = {}) {
    const operationId = `save-${scenarioData.id}-${Date.now()}`

    try {
      this.pendingOperations.add(operationId)
      console.log(`[ScenarioService] Saving scenario: ${scenarioData.id}`)

      // Validate before saving
      const validation = await this.validateScenario(scenarioData, { validateFiles: false })

      if (!validation.isValid && !options.force) {
        return {
          success: false,
          message: 'Scenario validation failed',
          errors: validation.errors,
          warnings: validation.warnings
        }
      }

      // Prepare scenario data for saving
      const scenarioToSave = {
        ...scenarioData,
        lastModified: new Date().toISOString(),
        version: scenarioData.version ? scenarioData.version + 1 : 1
      }

      // In a real implementation, this would write to the file system
      // For now, we'll simulate the save operation and update our cache
      const filename = `${scenarioData.id}.json`
      const saveResult = await this.performFileSave(filename, scenarioToSave)

      if (saveResult.success) {
        // Update internal cache
        this.scenarios.set(scenarioData.id, {
          ...scenarioToSave,
          filename: filename,
          loadedAt: new Date().toISOString(),
          validation: validation
        })

        const metadata = extractScenarioMetadata(scenarioToSave)
        this.scenarioMetadata.set(scenarioData.id, {
          ...metadata,
          filename: filename,
          loadedAt: new Date().toISOString()
        })

        // Clear validation cache for this scenario
        this.clearValidationCache(scenarioData.id)

        // Record operation
        this.recordOperation('save', scenarioData.id, { success: true, filename })

        console.log(`[ScenarioService] Successfully saved scenario: ${scenarioData.id}`)

        return {
          success: true,
          message: `Scenario saved successfully`,
          filename: filename,
          validation: validation
        }
      } else {
        throw new Error(saveResult.error || 'Failed to save scenario file')
      }

    } catch (error) {
      console.error(`[ScenarioService] Error saving scenario ${scenarioData.id}:`, error)

      this.recordOperation('save', scenarioData.id, {
        success: false,
        error: error.message
      })

      return {
        success: false,
        message: `Failed to save scenario: ${error.message}`,
        error: error.message
      }
    } finally {
      this.pendingOperations.delete(operationId)
    }
  }

  /**
   * Delete a scenario from disk and cache
   * @param {string} scenarioId - The scenario ID to delete
   * @returns {Promise<Object>} Delete result
   */
  async deleteScenario(scenarioId) {
    const operationId = `delete-${scenarioId}-${Date.now()}`

    try {
      this.pendingOperations.add(operationId)
      console.log(`[ScenarioService] Deleting scenario: ${scenarioId}`)

      const scenario = this.scenarios.get(scenarioId)
      if (!scenario) {
        return {
          success: false,
          message: 'Scenario not found'
        }
      }

      // Perform file deletion
      const deleteResult = await this.performFileDelete(scenario.filename)

      if (deleteResult.success) {
        // Remove from cache
        this.scenarios.delete(scenarioId)
        this.scenarioMetadata.delete(scenarioId)
        this.clearValidationCache(scenarioId)

        // Clear current scenario if it was the deleted one
        if (this.currentScenario === scenarioId) {
          this.currentScenario = null
        }

        // Record operation
        this.recordOperation('delete', scenarioId, { success: true })

        console.log(`[ScenarioService] Successfully deleted scenario: ${scenarioId}`)

        return {
          success: true,
          message: 'Scenario deleted successfully'
        }
      } else {
        throw new Error(deleteResult.error || 'Failed to delete scenario file')
      }

    } catch (error) {
      console.error(`[ScenarioService] Error deleting scenario ${scenarioId}:`, error)

      this.recordOperation('delete', scenarioId, {
        success: false,
        error: error.message
      })

      return {
        success: false,
        message: `Failed to delete scenario: ${error.message}`,
        error: error.message
      }
    } finally {
      this.pendingOperations.delete(operationId)
    }
  }

  /**
   * Duplicate a scenario with a new ID
   * @param {string} sourceScenarioId - The scenario to duplicate
   * @param {string} newId - New scenario ID
   * @param {string} newName - New scenario name
   * @returns {Promise<Object>} Duplication result
   */
  async duplicateScenario(sourceScenarioId, newId, newName) {
    try {
      console.log(`[ScenarioService] Duplicating scenario ${sourceScenarioId} to ${newId}`)

      const sourceScenario = await this.getScenario(sourceScenarioId)
      if (!sourceScenario) {
        return {
          success: false,
          message: 'Source scenario not found'
        }
      }

      // Check if new ID already exists
      if (this.scenarios.has(newId)) {
        return {
          success: false,
          message: 'A scenario with this ID already exists'
        }
      }

      // Create duplicate scenario
      const duplicateScenario = {
        ...sourceScenario,
        id: newId,
        name: newName,
        description: `Copy of ${sourceScenario.description}`,
        version: 1,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString()
      }

      // Remove internal fields
      delete duplicateScenario.filename
      delete duplicateScenario.loadedAt
      delete duplicateScenario.validation

      // Save the duplicate
      const saveResult = await this.saveScenario(duplicateScenario)

      if (saveResult.success) {
        console.log(`[ScenarioService] Successfully duplicated scenario: ${newId}`)
        return {
          success: true,
          message: 'Scenario duplicated successfully',
          newScenarioId: newId
        }
      } else {
        return saveResult
      }

    } catch (error) {
      console.error(`[ScenarioService] Error duplicating scenario:`, error)
      return {
        success: false,
        message: `Failed to duplicate scenario: ${error.message}`,
        error: error.message
      }
    }
  }

  /**
   * Perform actual file save operation
   * @param {string} filename - The filename to save
   * @param {Object} data - The data to save
   * @returns {Promise<Object>} Save operation result
   */
  async performFileSave(filename, data) {
    try {
      // In a browser environment, we can't directly write files to the file system
      // This would typically be handled by a backend service or file system API
      // For now, we'll simulate the operation and provide feedback

      console.log(`[ScenarioService] Simulating file save: ${filename}`)

      // Validate JSON serialization
      const jsonString = JSON.stringify(data, null, 2)

      if (jsonString.length > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('Scenario file too large (>10MB)')
      }

      // In a real implementation, this would be:
      // await fs.writeFile(`/public/scenarios/${filename}`, jsonString)

      return {
        success: true,
        filename: filename,
        size: jsonString.length
      }

    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Perform actual file delete operation
   * @param {string} filename - The filename to delete
   * @returns {Promise<Object>} Delete operation result
   */
  async performFileDelete(filename) {
    try {
      console.log(`[ScenarioService] Simulating file delete: ${filename}`)

      // In a real implementation, this would be:
      // await fs.unlink(`/public/scenarios/${filename}`)

      return {
        success: true,
        filename: filename
      }

    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Manage cache size by removing oldest entries
   * @param {Map} cache - The cache to manage
   */
  manageCacheSize(cache) {
    if (cache.size > this.maxCacheSize) {
      const entries = Array.from(cache.entries())
      const sortedEntries = entries.sort((a, b) => {
        const aTime = a[1].timestamp || 0
        const bTime = b[1].timestamp || 0
        return aTime - bTime
      })

      // Remove oldest entries
      const toRemove = sortedEntries.slice(0, cache.size - this.maxCacheSize)
      toRemove.forEach(([key]) => cache.delete(key))

      console.log(`[ScenarioService] Cleaned cache, removed ${toRemove.length} entries`)
    }
  }

  /**
   * Clear validation cache for a specific scenario
   * @param {string} scenarioId - The scenario ID to clear cache for
   */
  clearValidationCache(scenarioId) {
    const keysToDelete = []

    for (const [key, value] of this.validationCache.entries()) {
      try {
        const data = JSON.parse(key)
        if (data.id === scenarioId) {
          keysToDelete.push(key)
        }
      } catch (error) {
        // Invalid cache key, remove it
        keysToDelete.push(key)
      }
    }

    keysToDelete.forEach(key => this.validationCache.delete(key))
    console.log(`[ScenarioService] Cleared validation cache for scenario: ${scenarioId}`)
  }

  /**
   * Clear all caches with performance tracking
   */
  clearAllCaches() {
    const beforeStats = {
      metadata: this.metadataCache.getStats(),
      validation: this.validationCache.getStats(),
      content: this.contentCache.getStats(),
      directory: this.directoryCache.getStats()
    }

    this.metadataCache.clear()
    this.validationCache.clear()
    this.contentCache.clear()
    this.directoryCache.clear()
    this.lazyLoader.clear()

    console.log('[ScenarioService] Cleared all caches:', beforeStats)
  }

  /**
   * Check if cache timestamp is recent enough
   * @param {number} timestamp - Cache timestamp
   * @returns {boolean} True if cache is recent
   */
  isRecentCache(timestamp) {
    return Date.now() - timestamp < (2 * 60 * 1000) // 2 minutes
  }

  /**
   * Record performance metric
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   */
  recordPerformanceMetric(operation, duration) {
    if (!this.performanceMetrics[`${operation}Durations`]) {
      this.performanceMetrics[`${operation}Durations`] = []
    }

    const durations = this.performanceMetrics[`${operation}Durations`]
    durations.push(duration)

    // Keep only last 20 measurements
    if (durations.length > 20) {
      durations.shift()
    }

    // Log slow operations
    if (duration > 1000) { // > 1 second
      console.warn(`[ScenarioService] Slow ${operation} operation: ${Math.round(duration)}ms`)
    }
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance statistics
   */
  getPerformanceStats() {
    const stats = {
      caches: {
        metadata: this.metadataCache.getStats(),
        validation: this.validationCache.getStats(),
        content: this.contentCache.getStats(),
        directory: this.directoryCache.getStats()
      },
      lazyLoader: this.lazyLoader.getStats(),
      operations: {}
    }

    // Calculate average durations for each operation
    for (const [key, durations] of Object.entries(this.performanceMetrics)) {
      if (key.endsWith('Durations') && Array.isArray(durations) && durations.length > 0) {
        const operation = key.replace('Durations', '')
        const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length
        const min = Math.min(...durations)
        const max = Math.max(...durations)

        stats.operations[operation] = {
          average: Math.round(avg),
          min: Math.round(min),
          max: Math.round(max),
          samples: durations.length
        }
      }
    }

    return stats
  }

  /**
   * Refresh scenarios in background for cache warming
   */
  async refreshScenariosInBackground() {
    try {
      console.log('[ScenarioService] Starting background scenario refresh...')

      // Use a timeout to prevent blocking
      setTimeout(async () => {
        try {
          await this.loadScenariosOptimized()
          console.log('[ScenarioService] Background refresh completed')
        } catch (error) {
          console.warn('[ScenarioService] Background refresh failed:', error)
        }
      }, 1000) // 1 second delay

    } catch (error) {
      console.warn('[ScenarioService] Failed to start background refresh:', error)
    }
  }

  /**
   * Invalidate cache for specific scenario
   * @param {string} scenarioId - Scenario ID to invalidate
   */
  invalidateScenarioCache(scenarioId) {
    // Find and remove from content cache
    const contentKey = `scenario-file-${scenarioId}.json`
    this.contentCache.delete(contentKey)

    // Remove from lazy loader
    this.lazyLoader.invalidate(`scenario-${scenarioId}`)

    // Clear validation cache entries for this scenario
    const validationKeys = []
    for (const [key] of this.validationCache.cache.entries()) {
      if (key.includes(scenarioId)) {
        validationKeys.push(key)
      }
    }

    validationKeys.forEach(key => this.validationCache.delete(key))

    // Invalidate metadata list cache
    this.metadataCache.delete('scenario-list')

    console.log(`[ScenarioService] Invalidated cache for scenario: ${scenarioId}`)
  }

  /**
   * Optimize caches by removing expired entries
   */
  optimizeCaches() {
    const startTime = performance.now()

    // Let the PerformanceCache handle its own optimization
    // Just trigger a cleanup cycle

    const beforeStats = this.getPerformanceStats()

    // Force cleanup by accessing each cache
    this.metadataCache.get('__cleanup_trigger__')
    this.validationCache.get('__cleanup_trigger__')
    this.contentCache.get('__cleanup_trigger__')
    this.directoryCache.get('__cleanup_trigger__')

    const duration = performance.now() - startTime
    this.performanceMetrics.lastOptimization = Date.now()

    console.log(`[ScenarioService] Cache optimization completed in ${Math.round(duration)}ms`)

    return {
      duration: Math.round(duration),
      beforeStats,
      afterStats: this.getPerformanceStats()
    }
  }

  /**
   * Get cached metadata with expiry check
   * @param {string} scenarioId - The scenario ID
   * @returns {Object|null} Cached metadata or null if expired/not found
   */
  getCachedMetadata(scenarioId) {
    const cached = this.metadataCache.get(scenarioId)
    const expiry = this.cacheExpiry.get(`metadata-${scenarioId}`)

    if (cached && expiry && Date.now() < expiry) {
      return cached
    }

    // Remove expired cache
    if (cached) {
      this.metadataCache.delete(scenarioId)
      this.cacheExpiry.delete(`metadata-${scenarioId}`)
    }

    return null
  }

  /**
   * Cache metadata with expiry
   * @param {string} scenarioId - The scenario ID
   * @param {Object} metadata - The metadata to cache
   */
  cacheMetadata(scenarioId, metadata) {
    this.metadataCache.set(scenarioId, metadata)
    this.cacheExpiry.set(`metadata-${scenarioId}`, Date.now() + this.cacheTimeout)
    this.manageCacheSize(this.metadataCache)
  }

  /**
   * Record file system operation for history tracking with enhanced logging
   * @param {string} operation - The operation type
   * @param {string} scenarioId - The scenario ID
   * @param {Object} details - Operation details
   */
  recordOperation(operation, scenarioId, details) {
    const operationRecord = {
      operation,
      scenarioId,
      details: {
        ...details,
        userAgent: navigator.userAgent,
        url: window.location.href,
        serviceState: {
          isInitialized: this.isInitialized,
          scenarioCount: this.scenarios.size,
          metadataCount: this.scenarioMetadata.size
        }
      },
      timestamp: new Date().toISOString(),
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    this.operationHistory.unshift(operationRecord)

    // Keep history size manageable
    if (this.operationHistory.length > this.maxHistorySize) {
      this.operationHistory = this.operationHistory.slice(0, this.maxHistorySize)
    }

    // Enhanced logging based on operation type and result
    if (details.success === false || operation === 'error') {
      console.group(`🚨 [ScenarioService] Operation Failed: ${operation}`)
      console.error('Scenario ID:', scenarioId)
      console.error('Details:', details)
      console.error('Timestamp:', operationRecord.timestamp)
      console.groupEnd()

      // Store critical errors for debugging
      this.storeCriticalError(operationRecord)
    } else if (operation === 'recovery') {
      console.group(`🔧 [ScenarioService] Recovery Operation: ${operation}`)
      console.log('Scenario ID:', scenarioId)
      console.log('Recovery Method:', details.method)
      console.log('Success:', details.success)
      if (details.warnings) {
        console.warn('Warnings:', details.warnings)
      }
      console.groupEnd()
    } else if (import.meta.env.DEV) {
      console.log(`[ScenarioService] ${operation}:`, { scenarioId, ...details })
    }

    // Performance tracking
    if (details.loadTime || details.duration) {
      this.recordPerformanceMetric(operation, details.loadTime || details.duration)
    }
  }

  /**
   * Store critical errors for debugging and support
   * @param {Object} operationRecord - The operation record
   */
  storeCriticalError(operationRecord) {
    try {
      const criticalErrors = JSON.parse(localStorage.getItem('scenario-critical-errors') || '[]')
      criticalErrors.unshift({
        ...operationRecord,
        severity: 'critical',
        browserInfo: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform,
          cookieEnabled: navigator.cookieEnabled,
          onLine: navigator.onLine
        },
        pageInfo: {
          url: window.location.href,
          referrer: document.referrer,
          title: document.title
        }
      })

      // Keep only last 20 critical errors
      localStorage.setItem('scenario-critical-errors', JSON.stringify(criticalErrors.slice(0, 20)))
    } catch (storageError) {
      console.warn('Failed to store critical error:', storageError)
    }
  }

  /**
   * Get operation history
   * @param {Object} options - Filter options
   * @returns {Array} Operation history
   */
  getOperationHistory(options = {}) {
    let history = [...this.operationHistory]

    if (options.scenarioId) {
      history = history.filter(op => op.scenarioId === options.scenarioId)
    }

    if (options.operation) {
      history = history.filter(op => op.operation === options.operation)
    }

    if (options.limit) {
      history = history.slice(0, options.limit)
    }

    return history
  }

  /**
   * Initialize file watching for development
   */
  initializeFileWatching() {
    if (!this.fileWatchingEnabled) {
      return
    }

    console.log('[ScenarioService] File watching not implemented in browser environment')
    // In a Node.js environment, this would set up file system watchers
    // For browser environment, we could implement periodic polling or WebSocket updates
  }

  /**
   * Check for scenario file changes (polling-based for browser)
   * @returns {Promise<Object>} Check result
   */
  async checkForFileChanges() {
    try {
      console.log('[ScenarioService] Checking for scenario file changes...')

      const currentScenarios = await this.scanScenariosDirectory()
      const knownScenarios = Array.from(this.scenarioMetadata.keys())

      const changes = {
        added: [],
        removed: [],
        modified: []
      }

      // Check for new files
      for (const filename of currentScenarios) {
        const scenarioId = filename.replace('.json', '')
        if (!this.scenarios.has(scenarioId)) {
          changes.added.push(filename)
        }
      }

      // Check for removed files
      for (const scenarioId of knownScenarios) {
        const scenario = this.scenarios.get(scenarioId)
        if (scenario && !currentScenarios.includes(scenario.filename)) {
          changes.removed.push(scenario.filename)
        }
      }

      // In a real implementation, we would check file modification times
      // For now, we'll just report what we found

      if (changes.added.length > 0 || changes.removed.length > 0) {
        console.log('[ScenarioService] File changes detected:', changes)

        // Reload scenarios if changes detected
        await this.reloadScenarios()
      }

      return {
        success: true,
        changes: changes,
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      console.error('[ScenarioService] Error checking for file changes:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      metadataCache: {
        size: this.metadataCache.size,
        maxSize: this.maxCacheSize
      },
      validationCache: {
        size: this.validationCache.size,
        maxSize: this.maxCacheSize
      },
      cacheTimeout: this.cacheTimeout,
      pendingOperations: this.pendingOperations.size,
      operationHistorySize: this.operationHistory.length
    }
  }

  /**
   * Enhanced debugging support with comprehensive system state
   * @returns {Object} Complete debugging information
   */
  getDebugInfo() {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',

      // Service State
      serviceState: {
        isInitialized: this.isInitialized,
        lastScanTime: this.lastScanTime,
        scenarioCount: this.scenarios.size,
        metadataCount: this.scenarioMetadata.size,
        scanErrors: this.scanErrors,
        fileWatchingEnabled: this.fileWatchingEnabled
      },

      // Cache Statistics
      cacheStats: {
        metadata: this.metadataCache.getStats(),
        content: this.contentCache.getStats(),
        validation: this.validationCache.getStats(),
        directory: this.directoryCache.getStats()
      },

      // Performance Metrics
      performanceMetrics: {
        ...this.performanceMetrics,
        averages: this.calculatePerformanceAverages()
      },

      // Operation History (last 20)
      recentOperations: this.operationHistory.slice(0, 20),

      // Scenario Status
      scenarioStatus: Array.from(this.scenarios.entries()).map(([id, scenario]) => ({
        id,
        name: scenario.name,
        filename: scenario.filename,
        loadedAt: scenario.loadedAt,
        isValid: scenario.validation?.isValid,
        hasErrors: scenario.validation?.errors && Object.keys(scenario.validation.errors).length > 0,
        isRepaired: scenario.repaired,
        isFallback: scenario.isFallback,
        isPlaceholder: scenario.isPlaceholder,
        fromCache: scenario.fromCache
      })),

      // System Information
      systemInfo: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        localStorage: this.getLocalStorageInfo(),
        url: window.location.href,
        referrer: document.referrer
      },

      // Error Logs
      errorLogs: this.getStoredErrorLogs(),

      // Batch Processor State
      batchProcessorState: {
        queueSize: this.batchProcessor.queue.length,
        isProcessing: this.batchProcessor.isProcessing,
        batchSize: this.batchProcessor.batchSize,
        batchTimeout: this.batchProcessor.batchTimeout
      },

      // Lazy Loader State
      lazyLoaderState: this.lazyLoader.getStats()
    }

    return debugInfo
  }

  /**
   * Calculate performance averages for debugging
   * @returns {Object} Performance averages
   */
  calculatePerformanceAverages() {
    const averages = {}

    for (const [metric, values] of Object.entries(this.performanceMetrics)) {
      if (Array.isArray(values) && values.length > 0) {
        averages[metric] = {
          average: values.reduce((sum, val) => sum + val, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          count: values.length,
          recent: values.slice(-5) // Last 5 measurements
        }
      }
    }

    return averages
  }

  /**
   * Get localStorage information for debugging
   * @returns {Object} localStorage info
   */
  getLocalStorageInfo() {
    try {
      const info = {
        available: typeof Storage !== 'undefined',
        quotaUsed: 0,
        itemCount: 0,
        scenarioRelatedItems: []
      }

      if (info.available) {
        info.itemCount = localStorage.length

        // Calculate approximate quota usage
        let totalSize = 0
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          const value = localStorage.getItem(key)
          totalSize += key.length + value.length

          // Track scenario-related items
          if (key.includes('scenario') || key.includes('error')) {
            info.scenarioRelatedItems.push({
              key,
              size: key.length + value.length,
              type: this.classifyStorageItem(key)
            })
          }
        }

        info.quotaUsed = totalSize
      }

      return info
    } catch (error) {
      return {
        available: false,
        error: error.message
      }
    }
  }

  /**
   * Classify localStorage items by type
   * @param {string} key - The storage key
   * @returns {string} Item type
   */
  classifyStorageItem(key) {
    if (key.includes('error-log')) return 'error-log'
    if (key.includes('critical-errors')) return 'critical-errors'
    if (key.includes('scenario-cache')) return 'cache'
    if (key.includes('scenario-metadata')) return 'metadata'
    return 'unknown'
  }

  /**
   * Get stored error logs for debugging
   * @returns {Object} Error logs
   */
  getStoredErrorLogs() {
    try {
      return {
        scenarioErrors: JSON.parse(localStorage.getItem('scenario-error-log') || '[]').slice(0, 10),
        criticalErrors: JSON.parse(localStorage.getItem('scenario-critical-errors') || '[]').slice(0, 5),
        generalErrors: JSON.parse(localStorage.getItem('error-reports') || '[]').slice(0, 5)
      }
    } catch (error) {
      return {
        error: `Failed to retrieve error logs: ${error.message}`
      }
    }
  }

  /**
   * Export debug information for support
   * @returns {string} JSON string of debug info
   */
  exportDebugInfo() {
    const debugInfo = this.getDebugInfo()

    // Add export metadata
    debugInfo.exportInfo = {
      exportedAt: new Date().toISOString(),
      exportedBy: 'ScenarioService.exportDebugInfo',
      version: '1.0.0'
    }

    return JSON.stringify(debugInfo, null, 2)
  }

  /**
   * Clear debug data and reset service state
   * @param {Object} options - Clear options
   */
  clearDebugData(options = {}) {
    const {
      clearCache = true,
      clearHistory = true,
      clearErrors = true,
      clearPerformanceMetrics = true
    } = options

    console.log('[ScenarioService] Clearing debug data...', options)

    if (clearCache) {
      this.metadataCache.clear()
      this.contentCache.clear()
      this.validationCache.clear()
      this.directoryCache.clear()
      this.lazyLoader.clear()
    }

    if (clearHistory) {
      this.operationHistory = []
    }

    if (clearErrors) {
      this.scanErrors = []
      try {
        localStorage.removeItem('scenario-error-log')
        localStorage.removeItem('scenario-critical-errors')
      } catch (error) {
        console.warn('Failed to clear error logs:', error)
      }
    }

    if (clearPerformanceMetrics) {
      this.performanceMetrics = {
        scanDurations: [],
        loadDurations: [],
        validationDurations: [],
        lastOptimization: null
      }
    }

    console.log('[ScenarioService] Debug data cleared successfully')
  }

  /**
   * Debug method to get detailed scenario information
   * @param {string} scenarioId - Optional scenario ID to debug
   * @returns {Object} Debug information
   */
  debugScenario(scenarioId = null) {
    const debug = {
      timestamp: new Date().toISOString(),
      serviceStatus: this.getStatus(),
      cacheStats: this.getCacheStats(),
      scenarios: {}
    }

    if (scenarioId) {
      const scenario = this.scenarios.get(scenarioId)
      const metadata = this.scenarioMetadata.get(scenarioId)
      const cachedMetadata = this.getCachedMetadata(scenarioId)

      debug.specificScenario = {
        id: scenarioId,
        exists: !!scenario,
        metadata: metadata,
        cachedMetadata: cachedMetadata,
        scenario: scenario ? {
          id: scenario.id,
          name: scenario.name,
          hasDatasets: !!scenario.datasets?.length,
          hasSystemPrompts: !!scenario.systemPrompts?.length,
          hasUserPrompts: !!scenario.userPrompts?.length,
          hasTools: !!scenario.tools?.length,
          validation: scenario.validation
        } : null,
        diagnostics: this.getErrorDiagnostics(scenarioId)
      }
    } else {
      // Debug all scenarios
      for (const [id, metadata] of this.scenarioMetadata.entries()) {
        debug.scenarios[id] = metadata
      }
    }

    console.log('[ScenarioService] Debug info:', debug)
    return debug
  }
}

// Create and export singleton instance
export const scenarioService = new ScenarioService()

// Performance optimization and monitoring setup
if (import.meta.env.DEV) {
  // Expose debug methods globally in development
  window.debugScenario = (scenarioId) => scenarioService.debugScenario(scenarioId)
  window.reloadScenarios = () => scenarioService.reloadScenarios()
  window.clearScenarioCache = () => scenarioService.clearAllCaches()
  window.checkScenarioFiles = () => scenarioService.checkForFileChanges()
  window.getScenarioStats = () => scenarioService.getPerformanceStats()
  window.validateScenarioFile = (scenarioData) => scenarioService.validateScenario(scenarioData)
  window.optimizeCaches = () => scenarioService.optimizeCaches()
  window.getScenarioStatus = () => scenarioService.getStatus()

  // Auto-check for file changes in development (every 30 seconds)
  if (scenarioService.fileWatchingEnabled) {
    setInterval(() => {
      scenarioService.checkForFileChanges().catch(error => {
        console.warn('[ScenarioService] File change check failed:', error)
      })
    }, 30000)
  }

  // Periodic cache optimization (every 5 minutes)
  setInterval(() => {
    try {
      scenarioService.optimizeCaches()
    } catch (error) {
      console.warn('[ScenarioService] Cache optimization failed:', error)
    }
  }, 5 * 60 * 1000)

  // Performance monitoring
  let performanceCheckCount = 0
  setInterval(() => {
    performanceCheckCount++
    const stats = scenarioService.getPerformanceStats()

    // Log performance summary every 10 checks (roughly every 10 minutes)
    if (performanceCheckCount % 10 === 0) {
      console.log('[ScenarioService] Performance Summary:', {
        cacheHitRates: {
          metadata: stats.caches.metadata.hitRate + '%',
          validation: stats.caches.validation.hitRate + '%',
          content: stats.caches.content.hitRate + '%',
          directory: stats.caches.directory.hitRate + '%'
        },
        operationAverages: stats.operations,
        memoryUsage: scenarioService.getMemoryUsageEstimate()
      })
    }
  }, 60000) // Every minute
}
