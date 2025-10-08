/**
 * Shared utilities for handler-based tool execution
 * Provides common functionality for storage, validation, and response formatting
 */
 class HandlerUtils {
  /**
   * Initialize IndexedDB storage for handlers
   * @param {string} dbName - Database name
   * @param {number} version - Database version
   * @param {Array} stores - Array of store configurations
   * @returns {Promise<IDBDatabase>} Database instance
   */
  static async initializeStorage(dbName, version, stores) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, version);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error}`));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create stores if they don't exist
        stores.forEach(storeConfig => {
          if (!db.objectStoreNames.contains(storeConfig.name)) {
            const store = db.createObjectStore(storeConfig.name, {
              keyPath: storeConfig.keyPath || 'id',
              autoIncrement: storeConfig.autoIncrement || false
            });

            // Create indexes if specified
            if (storeConfig.indexes) {
              storeConfig.indexes.forEach(index => {
                store.createIndex(index.name, index.keyPath, {
                  unique: index.unique || false
                });
              });
            }
          }
        });
      };
    });
  }

  /**
   * Save data to IndexedDB storage
   * @param {IDBDatabase} db - Database instance
   * @param {string} storeName - Store name
   * @param {Object} data - Data to save
   * @returns {Promise<void>}
   */
  static async saveToStorage(db, storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onerror = () => {
        reject(new Error(`Failed to save data: ${request.error}`));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Get data from IndexedDB storage
   * @param {IDBDatabase} db - Database instance
   * @param {string} storeName - Store name
   * @param {string} key - Key to retrieve
   * @returns {Promise<Object|null>} Retrieved data or null if not found
   */
  static async getFromStorage(db, storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onerror = () => {
        reject(new Error(`Failed to get data: ${request.error}`));
      };

      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  }

  /**
   * Get all data from IndexedDB storage
   * @param {IDBDatabase} db - Database instance
   * @param {string} storeName - Store name
   * @returns {Promise<Array>} All data from the store
   */
  static async getAllFromStorage(db, storeName) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onerror = () => {
        reject(new Error(`Failed to get all data: ${request.error}`));
      };

      request.onsuccess = () => {
        resolve(request.result || []);
      };
    });
  }

  /**
   * Validate parameters against a schema
   * @param {Object} parameters - Parameters to validate
   * @param {Object} schema - JSON schema for validation
   * @returns {Object} Validation result with isValid and errors
   */
  static validateParameters(parameters, schema) {
    const errors = [];

    if (!parameters || typeof parameters !== 'object') {
      return {
        isValid: false,
        errors: ['Parameters must be an object']
      };
    }

    if (!schema || !schema.properties) {
      return {
        isValid: true,
        errors: []
      };
    }

    // Check required properties
    if (schema.required && Array.isArray(schema.required)) {
      schema.required.forEach(requiredProp => {
        if (!(requiredProp in parameters)) {
          errors.push(`Missing required parameter: ${requiredProp}`);
        }
      });
    }

    // Validate property types
    Object.keys(schema.properties).forEach(propName => {
      const propSchema = schema.properties[propName];
      const value = parameters[propName];

      if (value !== undefined && value !== null) {
        if (propSchema.type) {
          const expectedType = propSchema.type;
          const actualType = typeof value;

          if (expectedType === 'string' && actualType !== 'string') {
            errors.push(`Parameter '${propName}' must be a string`);
          } else if (expectedType === 'number' && actualType !== 'number') {
            errors.push(`Parameter '${propName}' must be a number`);
          } else if (expectedType === 'boolean' && actualType !== 'boolean') {
            errors.push(`Parameter '${propName}' must be a boolean`);
          } else if (expectedType === 'array' && !Array.isArray(value)) {
            errors.push(`Parameter '${propName}' must be an array`);
          } else if (expectedType === 'object' && (actualType !== 'object' || Array.isArray(value))) {
            errors.push(`Parameter '${propName}' must be an object`);
          }
        }

        // Check string length constraints
        if (propSchema.minLength && typeof value === 'string' && value.length < propSchema.minLength) {
          errors.push(`Parameter '${propName}' must be at least ${propSchema.minLength} characters long`);
        }

        if (propSchema.maxLength && typeof value === 'string' && value.length > propSchema.maxLength) {
          errors.push(`Parameter '${propName}' must be no more than ${propSchema.maxLength} characters long`);
        }

        // Check enum values
        if (propSchema.enum && !propSchema.enum.includes(value)) {
          errors.push(`Parameter '${propName}' must be one of: ${propSchema.enum.join(', ')}`);
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate a unique ID with optional prefix
   * @param {string} prefix - Optional prefix for the ID
   * @returns {string} Generated ID
   */
  static generateId(prefix = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
  }

  /**
   * Format a successful response
   * @param {Object} data - Response data
   * @param {Object} metadata - Optional metadata
   * @returns {Object} Formatted response
   */
  static formatSuccessResponse(data, metadata = {}) {
    return {
      success: true,
      timestamp: new Date().toISOString(),
      ...data,
      ...metadata
    };
  }

  /**
   * Format an error response
   * @param {string} message - Error message
   * @param {string} code - Optional error code
   * @param {Object} details - Optional error details
   * @returns {Object} Formatted error response
   */
  static formatErrorResponse(message, code = 'HANDLER_ERROR', details = {}) {
    return {
      success: false,
      error: {
        message,
        code,
        timestamp: new Date().toISOString(),
        ...details
      }
    };
  }

  /**
   * Sleep for a specified duration (useful for simulating delays)
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  static async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate realistic demo data with random variations
   * @param {Object} template - Template object with possible values
   * @param {Object} overrides - Optional property overrides
   * @returns {Object} Generated data
   */
  static generateDemoData(template, overrides = {}) {
    const result = {};

    Object.keys(template).forEach(key => {
      const value = template[key];

      if (Array.isArray(value)) {
        // Pick random item from array
        result[key] = value[Math.floor(Math.random() * value.length)];
      } else if (typeof value === 'function') {
        // Execute function to generate value
        result[key] = value();
      } else {
        // Use value as-is
        result[key] = value;
      }
    });

    // Apply overrides
    Object.assign(result, overrides);

    return result;
  }

  /**
   * Create a random delay for realistic response timing
   * @param {number} minMs - Minimum delay in milliseconds
   * @param {number} maxMs - Maximum delay in milliseconds
   * @returns {Promise<void>}
   */
  static async randomDelay(minMs = 100, maxMs = 500) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return this.sleep(delay);
  }

  /**
   * Deep clone an object
   * @param {Object} obj - Object to clone
   * @returns {Object} Cloned object
   */
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item));
    }

    const cloned = {};
    Object.keys(obj).forEach(key => {
      cloned[key] = this.deepClone(obj[key]);
    });

    return cloned;
  }

  /**
   * Sanitize input to prevent XSS and other security issues
   * @param {string} input - Input string to sanitize
   * @returns {string} Sanitized string
   */
  static sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  /**
   * Format currency values
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code (default: USD)
   * @returns {string} Formatted currency string
   */
  static formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  /**
   * Format date values
   * @param {Date|string} date - Date to format
   * @param {Object} options - Formatting options
   * @returns {string} Formatted date string
   */
  static formatDate(date, options = {}) {
    const dateObj = date instanceof Date ? date : new Date(date);

    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };

    return new Intl.DateTimeFormat('en-US', { ...defaultOptions, ...options }).format(dateObj);
  }
}
