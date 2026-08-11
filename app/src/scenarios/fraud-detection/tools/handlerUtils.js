/**
 * Fraud detection handler utilities
 * Provides shared utilities for fraud detection handlers including storage and helper methods
 */
export class HandlerUtils {
  static dbName = 'FraudToolsDB';
  static dbVersion = 1;
  statb = null;

  /**
   * Initialize IndexedDB storage for fraud detection handlers
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
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores for fraud detection data
        if (!db.objectStoreNames.contains('accounts')) {
          const accountStore = db.createObjectStore('accounts', { keyPath: 'account_id' });
          accountStore.createIndex('risk_level', 'risk_level', { unique: false });
          accountStore.createIndex('frozen', 'frozen', { unique: false });
          accountStore.createIndex('monitoring_level', 'monitoring_level', { unique: false });
        }

        if (!db.objectStoreNames.contains('transactions')) {
          const txnStore = db.createObjectStore('transactions', { keyPath: 'transaction_id' });
          txnStore.createIndex('account_id', 'account_id', { unique: false });
          txnStore.createIndex('flagged', 'flagged', { unique: false });
          txnStore.createIndex('risk_score', 'risk_score', { unique: false });
        }

        if (!db.objectStoreNames.contains('alerts')) {
          const alertStore = db.createObjectStore('alerts', { keyPath: 'alert_id' });
          alertStore.createIndex('priority', 'priority', { unique: false });
          alertStore.createIndex('alert_type', 'alert_type', { unique: false });
          alertStore.createIndex('status', 'status', { unique: false });
        }
      };
    });
  }

  /**
   * Save data to IndexedDB
   * @param {IDBDatabase} db - Database instance
   * @param {string} storeName - Object store name
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
   * @param {string} storeName - Object store name
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
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Validate parameters against a basic schema
   * @param {Object} parameters - Parameters to validate
   * @param {Object} schema - Validation schema
   * @returns {Object} Validation result
   */
  static validateParameters(parameters, schema) {
    const validation = {
      isValid: false,
      errors: [],
      warnings: []
    };

    try {
      const schemaProps = schema.properties || {};
      const requiredFields = schema.required || [];

      // Check required fields
      for (const field of requiredFields) {
        if (!(field in parameters)) {
          validation.errors.push(`Missing required field: ${field}`);
        }
      }

      // Check field types and patterns
      for (const [fieldName, fieldValue] of Object.entries(parameters)) {
        const fieldSchema = schemaProps[fieldName];
        if (!fieldSchema) {
          validation.warnings.push(`Unexpected field: ${fieldName}`);
          continue;
        }

        // Type validation
        if (!this.validateFieldType(fieldValue, fieldSchema)) {
          validation.errors.push(`Invalid type for ${fieldName}`);
        }

        // Pattern validation
        if (fieldSchema.pattern && typeof fieldValue === 'string') {
          const regex = new RegExp(fieldSchema.pattern);
          if (!regex.test(fieldValue)) {
            validation.errors.push(`Invalid format for ${fieldName}`);
          }
        }

        // Enum validation
        if (fieldSchema.enum && !fieldSchema.enum.includes(fieldValue)) {
          validation.errors.push(`Invalid value for ${fieldName}. Must be one of: ${fieldSchema.enum.join(', ')}`);
        }

        // Array validation
        if (fieldSchema.type === 'array' && Array.isArray(fieldValue)) {
          if (fieldSchema.minItems && fieldValue.length < fieldSchema.minItems) {
            validation.errors.push(`${fieldName} must have at least ${fieldSchema.minItems} items`);
          }
        }

        // String length validation
        if (fieldSchema.type === 'string' && typeof fieldValue === 'string') {
          if (fieldSchema.minLength && fieldValue.length < fieldSchema.minLength) {
            validation.errors.push(`${fieldName} must be at least ${fieldSchema.minLength} characters`);
          }
        }

        // Number range validation
        if (fieldSchema.type === 'number' && typeof fieldValue === 'number') {
          if (fieldSchema.minimum !== undefined && fieldValue < fieldSchema.minimum) {
            validation.errors.push(`${fieldName} must be at least ${fieldSchema.minimum}`);
          }
          if (fieldSchema.maximum !== undefined && fieldValue > fieldSchema.maximum) {
            validation.errors.push(`${fieldName} must be at most ${fieldSchema.maximum}`);
          }
        }
      }

      validation.isValid = validation.errors.length === 0;
      return validation;

    } catch (error) {
      validation.errors.push(`Validation failed: ${error.message}`);
      return validation;
    }
  }

  /**
   * Validate field type against schema
   * @param {*} value - Field value
   * @param {Object} fieldSchema - Field schema
   * @returns {boolean} True if valid
   */
  static validateFieldType(value, fieldSchema) {
    const expectedType = fieldSchema.type;

    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true; // Allow unknown types
    }
  }

  /**
   * Get all records from a store by index
   * @param {IDBDatabase} db - Database instance
   * @param {string} storeName - Object store name
   * @param {string} indexName - Index name (optional)
   * @param {*} indexValue - Index value (optional)
   * @returns {Promise<Array>} Array of records
   */
  static async getAllFromStorage(db, storeName, indexName = null, indexValue = null) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);

      let request;
      if (indexName && indexValue !== null) {
        const index = store.index(indexName);
        request = index.getAll(indexValue);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error(`Failed to get all from ${storeName}`));
    });
  }

  /**
   * Delete record from storage
   * @param {IDBDatabase} db - Database instance
   * @param {string} storeName - Object store name
   * @param {string} key - Key to delete
   * @returns {Promise<void>}
   */
  static async deleteFromStorage(db, storeName, key) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to delete from ${storeName}`));
    });
  }

  /**
   * Clear all data from a store
   * @param {IDBDatabase} db - Database instance
   * @param {string} storeName - Object store name
   * @returns {Promise<void>}
   */
  static async clearStorage(db, storeName) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to clear ${storeName}`));
    });
  }

  /**
   * Seed demo data for fraud detection scenarios
   * @param {IDBDatabase} db - Database instance
   * @returns {Promise<void>}
   */
  static async seedDemoData(db) {
    try {
      // Seed some demo accounts
      const demoAccounts = [
        {
          account_id: 'A1001',
          risk_level: 'low',
          monitoring_level: 'standard',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          account_id: 'A1002',
          risk_level: 'high',
          monitoring_level: 'enhanced',
          frozen: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      for (const account of demoAccounts) {
        await this.saveToStorage(db, 'accounts', account);
      }

      // Seed some demo transactions
      const demoTransactions = [
        {
          transaction_id: 'T1001',
          account_id: 'A1001',
          flagged: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          transaction_id: 'T1002',
          account_id: 'A1002',
          flagged: true,
          risk_score: 85,
          fraud_indicators: ['unusual_amount', 'velocity_check_failed'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      for (const transaction of demoTransactions) {
        await this.saveToStorage(db, 'transactions', transaction);
      }

    } catch (error) {
      console.warn('Failed to seed demo data:', error);
    }
  }

  /**
   * Format response with consistent structure
   * @param {boolean} success - Success status
   * @param {Object} data - Response data
   * @param {string} message - Optional message
   * @returns {Object} Formatted response
   */
  static formatResponse(success, data = {}, message = null) {
    const response = {
      success,
      timestamp: new Date().toISOString(),
      ...data
    };

    if (message) {
      response.message = message;
    }

    return response;
  }

  /**
   * Handle errors consistently
   * @param {Error} error - Error object
   * @param {string} context - Error context
   * @returns {Object} Error response
   */
  static handleError(error, context = 'Handler execution') {
    console.error(`${context} failed:`, error);

    return this.formatResponse(false, {
      error: error.message,
      context,
      error_code: error.code || 'HANDLER_ERROR'
    });
  }
}
