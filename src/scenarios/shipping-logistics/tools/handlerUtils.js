/**
 * Shipping logistics handler utilities
 * Provides storage initialization and helper methods for shipping handlers
 */
export class HandlerUtils {
  static dbName = 'ShippingToolsDB';
  static dbVersion = 1;
  static db = null;

  /**
   * Initialize IndexedDB storage for shipping logistics
   * @returns {Promise<IDBDatabase>} Database instance
   */
  static async initializeStorage() {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.seedDemoData().then(() => resolve(this.db));
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores
        if (!db.objectStoreNames.contains('orders')) {
          const orderStore = db.createObjectStore('orders', { keyPath: 'orderId' });
          orderStore.createIndex('customerId', 'customerId', { unique: false });
          orderStore.createIndex('status', 'status', { unique: false });
        }

        if (!db.objectStoreNames.contains('carriers')) {
          const carrierStore = db.createObjectStore('carriers', { keyPath: 'orderId' });
          carrierStore.createIndex('status', 'status', { unique: false });
        }

        if (!db.objectStoreNames.contains('packages')) {
          db.createObjectStore('packages', { keyPath: 'orderId' });
        }

        if (!db.objectStoreNames.contains('customers')) {
          const customerStore = db.createObjectStore('customers', { keyPath: 'customerId' });
          customerStore.createIndex('tier', 'tier', { unique: false });
        }

        if (!db.objectStoreNames.contains('slas')) {
          db.createObjectStore('slas', { keyPath: 'orderId' });
        }

        if (!db.objectStoreNames.contains('actions')) {
          const actionStore = db.createObjectStore('actions', { keyPath: 'actionId' });
          actionStore.createIndex('orderId', 'orderId', { unique: false });
          actionStore.createIndex('actionType', 'actionType', { unique: false });
        }
      };
    });
  }

  /**
   * Seed demo data for Order B456
   */
  static async seedDemoData() {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Check if data already exists
    const existingOrder = await this.getFromStorage(this.db, 'orders', 'B456');
    if (existingOrder) {
      return; // Data already seeded
    }

    const demoData = {
      order: {
        orderId: 'B456',
        created: '2025-09-28T14:22:00Z',
        customerId: 'C8821',
        status: 'exception'
      },
      customer: {
        customerId: 'C8821',
        name: 'Margaret Thompson',
        tier: 'VIP',
        accountValue: 12400,
        joinDate: '2019-03-15',
        satisfactionScore: 4.8
      },
      carrier: {
        orderId: 'B456',
        name: 'RegionalExpress',
        trackingNumber: 'RX8829912847',
        status: 'delivery_exception',
        lastUpdate: '2025-09-30T11:15:00Z',
        exceptionNote: 'Box felt warm to touch. Customer not home. Returned to depot.',
        attemptsRemaining: 1
      },
      package: {
        orderId: 'B456',
        contents: ['Wagyu Beef Steaks (qty: 2)'],
        isPerishable: true,
        isHazmat: false,
        requiresRefrigeration: true,
        weight: 3.2,
        declaredValue: 340
      },
      sla: {
        orderId: 'B456',
        tier: '2-day',
        promisedDeliveryBy: '2025-09-30T20:00:00Z',
        currentStatus: 'at_risk',
        hoursUntilDeadline: 8,
        penaltyPerDay: 200
      }
    };

    await this.saveToStorage(this.db, 'orders', demoData.order);
    await this.saveToStorage(this.db, 'customers', demoData.customer);
    await this.saveToStorage(this.db, 'carriers', demoData.carrier);
    await this.saveToStorage(this.db, 'packages', demoData.package);
    await this.saveToStorage(this.db, 'slas', demoData.sla);
  }

  /**
   * Save data to IndexedDB
   * @param {IDBDatabase} db - Database instance
   * @param {string} storeName - Store name
   * @param {Object} data - Data to save
   * @returns {Promise<void>}
   */
  static async saveToStorage(db, storeName, data) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to save to ${storeName}`));
    });
  }

  /**
   * Get data from IndexedDB
   * @param {IDBDatabase} db - Database instance
   * @param {string} storeName - Store name
   * @param {string} key - Key to retrieve
   * @returns {Promise<Object|null>}
   */
  static async getFromStorage(db, storeName, key) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error(`Failed to get from ${storeName}`));
    });
  }

  /**
   * Generate unique ID with prefix
   * @param {string} prefix - ID prefix
   * @returns {string} Generated ID
   */
  static generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Validate parameters against schema (basic validation)
   * @param {Object} parameters - Parameters to validate
   * @param {Array<string>} requiredFields - Required field names
   * @returns {Object} Validation result
   */
  static validateParameters(parameters, requiredFields = []) {
    const validation = {
      isValid: true,
      errors: []
    };

    for (const field of requiredFields) {
      if (!(field in parameters)) {
        validation.errors.push(`Missing required field: ${field}`);
        validation.isValid = false;
      }
    }

    return validation;
  }

  /**
   * Get all actions for an order (for debugging/demo)
   * @param {IDBDatabase} db - Database instance
   * @param {string} orderId - Order ID
   * @returns {Promise<Array>} Array of actions
   */
  static async getOrderActions(db, orderId) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = db.transaction(['actions'], 'readonly');
      const store = transaction.objectStore('actions');
      const index = store.index('orderId');
      const request = index.getAll(orderId);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('Failed to get actions'));
    });
  }

  /**
   * Reset demo data (for testing different iterations)
   * @param {IDBDatabase} db - Database instance
   * @returns {Promise<void>}
   */
  static async resetDemoData(db) {
    if (!db) {
      throw new Error('Database not initialized');
    }

    // Clear actions only, preserve core data
    const transaction = db.transaction(['actions'], 'readwrite');
    const store = transaction.objectStore('actions');
    await new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear actions'));
    });

    // Reset order status
    const orderData = await this.getFromStorage(db, 'orders', 'B456');
    if (orderData) {
      orderData.status = 'exception';
      orderData.lastAction = null;
      orderData.updated = new Date().toISOString();
      await this.saveToStorage(db, 'orders', orderData);
    }
  }

  /**
   * Create metadata object for responses
   * @param {Object} options - Metadata options
   * @returns {Object} Standardized metadata object
   */
  static createResponseMeta(options = {}) {
    const {
      etag,
      timestamp = new Date().toISOString(),
      fromCache = false,
      rateLimitInfo = null,
      includePaging = false,
      nextCursor = null,
      hasMore = false,
      nextSteps = null
    } = options;



    const meta = {
      etag: etag || this.generateEtag({ timestamp }),
      last_modified: timestamp,
      from_cache: fromCache,
      rate_limit: rateLimitInfo,
      next_steps: nextSteps
    };

    // Only include paging for list operations
    if (includePaging) {
      meta.paging = {
        next_cursor: nextCursor,
        has_more: hasMore
      };
    }

    return meta;
  }

  /**
   * Determine if an operation should include paging metadata
   * @param {string} toolName - Name of the tool
   * @param {string} operation - Type of operation (get, list, create, update, delete)
   * @returns {boolean} Whether to include paging metadata
   */
  static shouldIncludePaging(toolName, operation = 'get') {
    // Only list operations should include paging
    const listOperations = ['list', 'search', 'query'];
    const listTools = ['listOrders'];

    return listOperations.includes(operation) || listTools.includes(toolName);
  }

  /**
   * Generate ETag for response data
   * @param {Object} data - Response data to generate ETag for
   * @returns {string} ETag value
   */
  static generateEtag(data) {
    const content = JSON.stringify(data);
    return `"${Date.now()}-${content.length}"`;
  }

  /**
   * Flush cache and clear rate limiting data
   * @returns {Promise<Object>} Result of flush operation
   */
  static async flushCache() {
    // Import the flush function from shared utils
    const { flushCache } = await import('./sharedUtils.js');
    return await flushCache();
  }

  /**
   * Check if caching is enabled
   * @returns {boolean} Whether caching is enabled
   */
  static isCacheEnabled() {
    // This will be determined by the shared utils
    return true; // Placeholder - actual implementation in sharedUtils
  }

  /**
   * Handle idempotency key conflict by returning existing result
   * @param {Object} existingAction - The existing action record
   * @param {string} toolName - Current tool name
   * @returns {Object} The existing action result
   */
  static handleIdempotencyConflict(existingAction, toolName = 'unknown') {
    // Check if the existing action has a stored result
    if (existingAction.result && existingAction.result.meta) {
      // Return the existing result with updated meta to indicate it's from cache
      const result = {
        ...existingAction.result,
        meta: {
          ...existingAction.result.meta,
          from_cache: true,
          idempotent_response: true,
          original_timestamp: existingAction.timestamp
        }
      };
      return result;
    }

    // Fallback: create a basic response for legacy action records without stored results
    return {
      success: true,
      action_id: existingAction.actionId || existingAction.id,
      order_id: existingAction.orderId,
      status: existingAction.status || 'completed',
      message: `Action already completed with idempotency key ${existingAction.idempotencyKey}`,
      meta: {
        etag: this.generateEtag({ actionId: existingAction.actionId, timestamp: existingAction.timestamp }),
        last_modified: existingAction.timestamp,
        from_cache: true,
        idempotent_response: true,
        original_timestamp: existingAction.timestamp,
        rate_limit: null,
        next_steps: "Previous action result returned due to idempotency key match"
      }
    };
  }
}
