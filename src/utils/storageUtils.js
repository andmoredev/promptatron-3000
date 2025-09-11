/**
 * Storage utilities with IndexedDB and localStorage fallback
 * Provides a unified interface for data persistence with graceful degradation
 */

import { isIndexedDBSupported, isLocalStorageSupported } from './browserCompatibility.js'
import { handleError, ErrorTypes } from './errorHandling.js'

/**
 * Storage types
 */
export const StorageType = {
  INDEXED_DB: 'indexedDB',
  LOCAL_STORAGE: 'localStorage',
  SESSION_STORAGE: 'sessionStorage',
  MEMORY: 'memory'
}

/**
 * Storage configuration
 */
const STORAGE_CONFIG = {
  dbName: 'PromptAnalyzerDB',
  dbVersion: 1,
  stores: {
    evaluations: 'determinism_evaluations',
tory: 'test_history',
    cache: 'response_cache'
  }
}

/**
 * Unified storage interface with automatic fallback
 */
export class UnifiedStorage {
  constructor() {
    this.primaryStorage = null
    this.fallbackStorage = null
    this.storageType = null
    this.db = null
    this.memoryStore = new Map()
    this.initialized = false
  }

  /**
   * Initialize storage with automatic fallback detection
   */
  async initialize() {
    if (this.initialized) {
      return this.storageType
    }

    try {
      // Try IndexedDB first
      if (isIndexedDBSupported()) {
        await this.initializeIndexedDB()
        this.storageType = StorageType.INDEXED_DB
        this.primaryStorage = 'indexedDB'
        this.fallbackStorage = isLocalStorageSupported() ? 'localStorage' : 'memory'
      }
      // Fall back to localStorage
      else if (isLocalStorageSupported()) {
        this.storageType = StorageType.LOCAL_STORAGE
        this.primaryStorage = 'localStorage'
        this.fallbackStorage = 'memory'
      }
      // Last resort: memory storage
      else {
        this.storageType = StorageType.MEMORY
        this.primaryStorage = 'memory'
        this.fallbackStorage = null
        console.warn('No persistent storage available - using memory storage')
      }

      this.initialized = true
      console.log(`Storage initialized: ${this.storageType}`)

      return this.storageType
    } catch (error) {
      console.error('Storage initialization failed:', error)

      // Fall back to memory storage
      this.storageType = StorageType.MEMORY
      this.primaryStorage = 'memory'
      this.fallbackStorage = null
      this.initialized = true

      handleError(error, {
        context: 'storage_initialization',
        attemptedStorage: this.primaryStorage
      })

      return this.storageType
    }
  }

  /**
   * Initialize IndexedDB
   */
  async initializeIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(STORAGE_CONFIG.dbName, STORAGE_CONFIG.dbVersion)

      request.onerror = () => {
        reject(new Error(`IndexedDB open failed: ${request.error?.message || 'Unknown error'}`))
      }

      request.onsuccess = () => {
        this.db = request.result

        // Handle database errors
        this.db.onerror = (event) => {
          console.error('IndexedDB error:', event.target.error)
        }

        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result

        // Create object stores
        Object.values(STORAGE_CONFIG.stores).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' })

            // Add indexes for common queries
            if (storeName === STORAGE_CONFIG.stores.evaluations) {
              store.createIndex('testId', 'testId', { unique: false })
              store.createIndex('timestamp', 'timestamp', { unique: false })
              store.createIndex('status', 'status', { unique: false })
            } else if (storeName === STORAGE_CONFIG.stores.history) {
              store.createIndex('timestamp', 'timestamp', { unique: false })
              store.createIndex('modelId', 'modelId', { unique: false })
            }
          }
        })
      }
    })
  }

  /**
   * Store data with automatic fallback
   */
  async setItem(store, key, data) {
    if (!this.initialized) {
      await this.initialize()
    }

    const item = {
      id: key,
      data,
      timestamp: Date.now(),
      storageType: this.storageType
    }

    try {
      switch (this.storageType) {
        case StorageType.INDEXED_DB:
          return await this.setItemIndexedDB(store, item)

        case StorageType.LOCAL_STORAGE:
          return this.setItemLocalStorage(store, key, item)

        case StorageType.MEMORY:
          return this.setItemMemory(store, key, item)

        default:
          throw new Error(`Unknown storage type: ${this.storageType}`)
      }
    } catch (error) {
      console.error(`Failed to store item in ${this.storageType}:`, error)

      // Try fallback storage
      if (this.fallbackStorage) {
        console.log(`Attempting fallback to ${this.fallbackStorage}`)
        return await this.setItemFallback(store, key, item)
      }

      throw error
    }
  }

  /**
   * Retrieve data with automatic fallback
   */
  async getItem(store, key) {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      switch (this.storageType) {
        case StorageType.INDEXED_DB:
          return await this.getItemIndexedDB(store, key)

        case StorageType.LOCAL_STORAGE:
          return this.getItemLocalStorage(store, key)

        case StorageType.MEMORY:
          return this.getItemMemory(store, key)

        default:
          throw new Error(`Unknown storage type: ${this.storageType}`)
      }
    } catch (error) {
      console.error(`Failed to retrieve item from ${this.storageType}:`, error)

      // Try fallback storage
      if (this.fallbackStorage) {
        console.log(`Attempting fallback to ${this.fallbackStorage}`)
        return await this.getItemFallback(store, key)
      }

      return null
    }
  }

  /**
   * Remove data with automatic fallback
   */
  async removeItem(store, key) {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      switch (this.storageType) {
        case StorageType.INDEXED_DB:
          return await this.removeItemIndexedDB(store, key)

        case StorageType.LOCAL_STORAGE:
          return this.removeItemLocalStorage(store, key)

        case StorageType.MEMORY:
          return this.removeItemMemory(store, key)

        default:
          throw new Error(`Unknown storage type: ${this.storageType}`)
      }
    } catch (error) {
      console.error(`Failed to remove item from ${this.storageType}:`, error)

      // Try fallback storage
      if (this.fallbackStorage) {
        console.log(`Attempting fallback to ${this.fallbackStorage}`)
        return await this.removeItemFallback(store, key)
      }

      throw error
    }
  }

  /**
   * Get all items from a store
   */
  async getAllItems(store) {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      switch (this.storageType) {
        case StorageType.INDEXED_DB:
          return await this.getAllItemsIndexedDB(store)

        case StorageType.LOCAL_STORAGE:
          return this.getAllItemsLocalStorage(store)

        case StorageType.MEMORY:
          return this.getAllItemsMemory(store)

        default:
          throw new Error(`Unknown storage type: ${this.storageType}`)
      }
    } catch (error) {
      console.error(`Failed to get all items from ${this.storageType}:`, error)
      return []
    }
  }

  /**
   * Clear all data from a store
   */
  async clearStore(store) {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      switch (this.storageType) {
        case StorageType.INDEXED_DB:
          return await this.clearStoreIndexedDB(store)

        case StorageType.LOCAL_STORAGE:
          return this.clearStoreLocalStorage(store)

        case StorageType.MEMORY:
          return this.clearStoreMemory(store)

        default:
          throw new Error(`Unknown storage type: ${this.storageType}`)
      }
    } catch (error) {
      console.error(`Failed to clear store in ${this.storageType}:`, error)
      throw error
    }
  }

  // IndexedDB implementation methods
  async setItemIndexedDB(store, item) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readwrite')
      const objectStore = transaction.objectStore(store)
      const request = objectStore.put(item)

      request.onsuccess = () => resolve(item.id)
      request.onerror = () => reject(request.error)
    })
  }

  async getItemIndexedDB(store, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readonly')
      const objectStore = transaction.objectStore(store)
      const request = objectStore.get(key)

      request.onsuccess = () => {
        const result = request.result
        resolve(result ? result.data : null)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async removeItemIndexedDB(store, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readwrite')
      const objectStore = transaction.objectStore(store)
      const request = objectStore.delete(key)

      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error)
    })
  }

  async getAllItemsIndexedDB(store) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readonly')
      const objectStore = transaction.objectStore(store)
      const request = objectStore.getAll()

      request.onsuccess = () => {
        const results = request.result || []
        resolve(results.map(item => ({ key: item.id, data: item.data, timestamp: item.timestamp })))
      }
      request.onerror = () => reject(request.error)
    })
  }

  async clearStoreIndexedDB(store) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readwrite')
      const objectStore = transaction.objectStore(store)
      const request = objectStore.clear()

      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error)
    })
  }

  // localStorage implementation methods
  setItemLocalStorage(store, key, item) {
    const storageKey = `${store}_${key}`
    localStorage.setItem(storageKey, JSON.stringify(item))
    return key
  }

  getItemLocalStorage(store, key) {
    const storageKey = `${store}_${key}`
    const item = localStorage.getItem(storageKey)
    return item ? JSON.parse(item).data : null
  }

  removeItemLocalStorage(store, key) {
    const storageKey = `${store}_${key}`
    localStorage.removeItem(storageKey)
    return true
  }

  getAllItemsLocalStorage(store) {
    const items = []
    const prefix = `${store}_`

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) {
        const item = JSON.parse(localStorage.getItem(key))
        items.push({
          key: key.substring(prefix.length),
          data: item.data,
          timestamp: item.timestamp
        })
      }
    }

    return items.sort((a, b) => b.timestamp - a.timestamp)
  }

  clearStoreLocalStorage(store) {
    const prefix = `${store}_`
    const keysToRemove = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key))
    return true
  }

  // Memory storage implementation methods
  setItemMemory(store, key, item) {
    const storeKey = `${store}_${key}`
    this.memoryStore.set(storeKey, item)
    return key
  }

  getItemMemory(store, key) {
    const storeKey = `${store}_${key}`
    const item = this.memoryStore.get(storeKey)
    return item ? item.data : null
  }

  removeItemMemory(store, key) {
    const storeKey = `${store}_${key}`
    return this.memoryStore.delete(storeKey)
  }

  getAllItemsMemory(store) {
    const items = []
    const prefix = `${store}_`

    for (const [key, item] of this.memoryStore.entries()) {
      if (key.startsWith(prefix)) {
        items.push({
          key: key.substring(prefix.length),
          data: item.data,
          timestamp: item.timestamp
        })
      }
    }

    return items.sort((a, b) => b.timestamp - a.timestamp)
  }

  clearStoreMemory(store) {
    const prefix = `${store}_`
    const keysToRemove = []

    for (const key of this.memoryStore.keys()) {
      if (key.startsWith(prefix)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach(key => this.memoryStore.delete(key))
    return true
  }

  // Fallback methods
  async setItemFallback(store, key, item) {
    if (this.fallbackStorage === 'localStorage') {
      return this.setItemLocalStorage(store, key, item)
    } else if (this.fallbackStorage === 'memory') {
      return this.setItemMemory(store, key, item)
    }
    throw new Error('No fallback storage available')
  }

  async getItemFallback(store, key) {
    if (this.fallbackStorage === 'localStorage') {
      return this.getItemLocalStorage(store, key)
    } else if (this.fallbackStorage === 'memory') {
      return this.getItemMemory(store, key)
    }
    return null
  }

  async removeItemFallback(store, key) {
    if (this.fallbackStorage === 'localStorage') {
      return this.removeItemLocalStorage(store, key)
    } else if (this.fallbackStorage === 'memory') {
      return this.removeItemMemory(store, key)
    }
    return false
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    const stats = {
      type: this.storageType,
      primaryStorage: this.primaryStorage,
      fallbackStorage: this.fallbackStorage,
      initialized: this.initialized,
      stores: {}
    }

    // Get stats for each store
    for (const [storeName, storeKey] of Object.entries(STORAGE_CONFIG.stores)) {
      try {
        const items = await this.getAllItems(storeKey)
        stats.stores[storeName] = {
          itemCount: items.length,
          totalSize: this.calculateStorageSize(items),
          oldestItem: items.length > 0 ? Math.min(...items.map(item => item.timestamp)) : null,
          newestItem: items.length > 0 ? Math.max(...items.map(item => item.timestamp)) : null
        }
      } catch (error) {
        stats.stores[storeName] = { error: error.message }
      }
    }

    return stats
  }

  /**
   * Calculate approximate storage size
   */
  calculateStorageSize(items) {
    return items.reduce((total, item) => {
      return total + JSON.stringify(item.data).length
    }, 0)
  }

  /**
   * Get storage info for debugging
   */
  getStorageInfo() {
    return {
      type: this.storageType,
      primaryStorage: this.primaryStorage,
      fallbackStorage: this.fallbackStorage,
      initialized: this.initialized,
      hasIndexedDB: isIndexedDBSupported(),
      hasLocalStorage: isLocalStorageSupported(),
      memoryStoreSize: this.memoryStore.size
    }
  }
}

// Export singleton instance
export const unifiedStorage = new UnifiedStorage()

// Convenience functions for common operations
export async function storeEvaluationResult(evaluationId, result) {
  return await unifiedStorage.setItem(STORAGE_CONFIG.stores.evaluations, evaluationId, result)
}

export async function getEvaluationResult(evaluationId) {
  return await unifiedStorage.getItem(STORAGE_CONFIG.stores.evaluations, evaluationId)
}

export async function getAllEvaluationResults() {
  return await unifiedStorage.getAllItems(STORAGE_CONFIG.stores.evaluations)
}

export async function storeTestHistory(testId, testResult) {
  return await unifiedStorage.setItem(STORAGE_CONFIG.stores.history, testId, testResult)
}

export async function getTestHistory(testId) {
  return await unifiedStorage.getItem(STORAGE_CONFIG.stores.history, testId)
}

export async function getAllTestHistory() {
  return await unifiedStorage.getAllItems(STORAGE_CONFIG.stores.history)
}

export async function clearEvaluationHistory() {
  return await unifiedStorage.clearStore(STORAGE_CONFIG.stores.evaluations)
}

export async function getStorageStatistics() {
  return await unifiedStorage.getStorageStats()
}
