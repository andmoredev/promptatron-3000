/**
 * Settings Service
 * Manages system-wide application settings with persistence and validatn
 * Provides centralized configuration for determinism, UI, AWS, and other features
 */

import { handleError } from '../utils/errorHandling.js';

/**
 * Storage key for application settings
 */
const SETTINGS_STORAGE_KEY = 'promptatron_app_settings';

/**
 * Default settings structure with all sections
 */
const DEFAULT_SETTINGS = {
  determinism: {
    testCount: 10,
    enableThrottlingAlerts: true,
    maxRetryAttempts: 3,
    showDetailedProgress: true,
    enabled: true
  },
  ui: {
    theme: 'light',
    animationsEnabled: true,
    defaultTab: 'test',
    compactMode: false,
    showHelpTooltips: true
  },
  aws: {
    region: 'us-east-1',
    timeout: 30000,
    retryAttempts: 3,
    enableCredentialValidation: true
  },
  cost: {
    showCostEstimates: false,
    costCurrency: 'USD',
    includePricingDisclaimer: true,
    autoUpdatePricing: true,
    pricingDataSource: 'aws-bedrock',
    lastPricingUpdate: null
  },
  version: '1.0.0',
  lastUpdated: null
};

/**
 * Validation rules for settings sections
 */
const VALIDATION_RULES = {
  determinism: {
    testCount: { min: 3, max: 50, type: 'number' },
    enableThrottlingAlerts: { type: 'boolean' },
    maxRetryAttempts: { min: 1, max: 5, type: 'number' },
    showDetailedProgress: { type: 'boolean' },
    enabled: { type: 'boolean' }
  },
  ui: {
    theme: { values: ['light', 'dark', 'auto'], type: 'string' },
    animationsEnabled: { type: 'boolean' },
    defaultTab: { values: ['test', 'history', 'comparison'], type: 'string' },
    compactMode: { type: 'boolean' },
    showHelpTooltips: { type: 'boolean' }
  },
  aws: {
    region: { type: 'string', minLength: 1 },
    timeout: { min: 5000, max: 300000, type: 'number' },
    retryAttempts: { min: 0, max: 10, type: 'number' },
    enableCredentialValidation: { type: 'boolean' }
  },
  cost: {
    showCostEstimates: { type: 'boolean' },
    costCurrency: { values: ['USD', 'EUR', 'GBP', 'JPY'], type: 'string' },
    includePricingDisclaimer: { type: 'boolean' },
    autoUpdatePricing: { type: 'boolean' },
    pricingDataSource: { values: ['aws-bedrock'], type: 'string' },
    lastPricingUpdate: { type: 'string', allowNull: true }
  }
};

/**
 * SettingsService class for comprehensive settings management
 */
export class SettingsService {
  constructor() {
    this.settings = null;
    this.isInitialized = false;
    this.changeListeners = new Set();
    this.validationCache = new Map();

    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.save = this.save.bind(this);
    this.load = this.load.bind(this);
    this.validateSection = this.validateSection.bind(this);
  }

  /**
   * Initialize the settings service
   */
  async initialize() {
    try {
      // Load existing settings or use defaults
      this.settings = await this.load();

      // Migrate settings if needed
      this.settings = this.migrateSettings(this.settings);

      // Validate all sections
      const validationResult = this.validateAllSections(this.settings);
      if (!validationResult.isValid) {
        console.warn('Settings validation issues found:', validationResult.errors);
        // Use defaults for invalid sections
        this.settings = this.repairInvalidSettings(this.settings, validationResult);
      }

      // Save repaired settings
      await this.save(this.settings);

      this.isInitialized = true;

      return { success: true, settings: this.settings };
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'SettingsService',
        action: 'initialize'
      });

      console.error('SettingsService initialization failed:', errorInfo.userMessage);

      // Fallback to defaults
      this.settings = { ...DEFAULT_SETTINGS };
      this.isInitialized = true;

      return { success: false, error: errorInfo.userMessage, settings: this.settings };
    }
  }

  /**
   * Get current settings
   */
  getSettings() {
    if (!this.isInitialized) {
      console.warn('SettingsService not initialized, returning defaults');
      return { ...DEFAULT_SETTINGS };
    }
    return { ...this.settings };
  }

  /**
   * Get settings for a specific section
   */
  getSection(sectionName) {
    const settings = this.getSettings();
    return settings[sectionName] || DEFAULT_SETTINGS[sectionName] || {};
  }

  /**
   * Update settings for a specific section
   */
  async updateSection(sectionName, sectionData) {
    try {
      if (!this.isInitialized) {
        throw new Error('SettingsService not initialized');
      }

      // Validate the section data
      const validationResult = this.validateSection(sectionName, sectionData);
      if (!validationResult.isValid) {
        return {
          success: false,
          errors: validationResult.errors,
          warnings: validationResult.warnings
        };
      }

      // Update the section
      const updatedSettings = {
        ...this.settings,
        [sectionName]: {
          ...this.settings[sectionName],
          ...sectionData
        },
        lastUpdated: new Date().toISOString()
      };

      // Save the updated settings
      const saveResult = await this.save(updatedSettings);
      if (saveResult.success) {
        this.settings = updatedSettings;
        this.notifyListeners(sectionName, sectionData);

        return {
          success: true,
          settings: this.settings,
          warnings: validationResult.warnings
        };
      } else {
        return {
          success: false,
          error: saveResult.error
        };
      }
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'SettingsService',
        action: 'updateSection',
        sectionName
      });

      return {
        success: false,
        error: errorInfo.userMessage
      };
    }
  }

  /**
   * Update multiple sections at once
   */
  async updateMultipleSections(sectionsData) {
    try {
      if (!this.isInitialized) {
        throw new Error('SettingsService not initialized');
      }

      const results = {};
      let hasErrors = false;
      const updatedSettings = { ...this.settings };

      // Validate all sections first
      for (const [sectionName, sectionData] of Object.entries(sectionsData)) {
        const validationResult = this.validateSection(sectionName, sectionData);
        results[sectionName] = validationResult;

        if (!validationResult.isValid) {
          hasErrors = true;
        } else {
          updatedSettings[sectionName] = {
            ...updatedSettings[sectionName],
            ...sectionData
          };
        }
      }

      if (hasErrors) {
        return {
          success: false,
          results,
          error: 'Some sections failed validation'
        };
      }

      // Update timestamp
      updatedSettings.lastUpdated = new Date().toISOString();

      // Save all changes
      const saveResult = await this.save(updatedSettings);
      if (saveResult.success) {
        this.settings = updatedSettings;

        // Notify listeners for each changed section
        for (const [sectionName, sectionData] of Object.entries(sectionsData)) {
          this.notifyListeners(sectionName, sectionData);
        }

        return {
          success: true,
          settings: this.settings,
          results
        };
      } else {
        return {
          success: false,
          error: saveResult.error,
          results
        };
      }
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'SettingsService',
        action: 'updateMultipleSections'
      });

      return {
        success: false,
        error: errorInfo.userMessage
      };
    }
  }

  /**
   * Reset settings to defaults
   */
  async resetToDefaults() {
    try {
      const defaultSettings = {
        ...DEFAULT_SETTINGS,
        lastUpdated: new Date().toISOString()
      };

      const saveResult = await this.save(defaultSettings);
      if (saveResult.success) {
        this.settings = defaultSettings;
        this.notifyListeners('*', defaultSettings); // Notify all listeners

        return {
          success: true,
          settings: this.settings
        };
      } else {
        return {
          success: false,
          error: saveResult.error
        };
      }
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'SettingsService',
        action: 'resetToDefaults'
      });

      return {
        success: false,
        error: errorInfo.userMessage
      };
    }
  }

  /**
   * Validate a settings section
   */
  validateSection(sectionName, sectionData) {
    const cacheKey = `${sectionName}_${JSON.stringify(sectionData)}`;

    // Check validation cache
    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey);
    }

    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      const rules = VALIDATION_RULES[sectionName];
      if (!rules) {
        result.warnings.push(`No validation rules defined for section: ${sectionName}`);
        this.validationCache.set(cacheKey, result);
        return result;
      }

      for (const [fieldName, fieldValue] of Object.entries(sectionData)) {
        const rule = rules[fieldName];
        if (!rule) {
          result.warnings.push(`No validation rule for field: ${sectionName}.${fieldName}`);
          continue;
        }

        // Type validation (with null check)
        if (rule.type && typeof fieldValue !== rule.type) {
          // Allow null values if explicitly permitted
          if (!(rule.allowNull && fieldValue === null)) {
            result.isValid = false;
            result.errors.push(`${sectionName}.${fieldName} must be of type ${rule.type}`);
            continue;
          }
        }

        // Range validation for numbers
        if (rule.type === 'number') {
          if (rule.min !== undefined && fieldValue < rule.min) {
            result.isValid = false;
            result.errors.push(`${sectionName}.${fieldName} must be at least ${rule.min}`);
          }
          if (rule.max !== undefined && fieldValue > rule.max) {
            result.isValid = false;
            result.errors.push(`${sectionName}.${fieldName} must be at most ${rule.max}`);
          }
        }

        // String length validation
        if (rule.type === 'string') {
          if (rule.minLength !== undefined && fieldValue.length < rule.minLength) {
            result.isValid = false;
            result.errors.push(`${sectionName}.${fieldName} must be at least ${rule.minLength} characters`);
          }
          if (rule.maxLength !== undefined && fieldValue.length > rule.maxLength) {
            result.isValid = false;
            result.errors.push(`${sectionName}.${fieldName} must be at most ${rule.maxLength} characters`);
          }
        }

        // Allowed values validation
        if (rule.values && !rule.values.includes(fieldValue)) {
          result.isValid = false;
          result.errors.push(`${sectionName}.${fieldName} must be one of: ${rule.values.join(', ')}`);
        }
      }

      // Cache the result
      this.validationCache.set(cacheKey, result);

      return result;
    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation error: ${error.message}`);
      return result;
    }
  }

  /**
   * Validate all settings sections
   */
  validateAllSections(settings) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sectionResults: {}
    };

    for (const sectionName of Object.keys(VALIDATION_RULES)) {
      if (settings[sectionName]) {
        const sectionResult = this.validateSection(sectionName, settings[sectionName]);
        result.sectionResults[sectionName] = sectionResult;

        if (!sectionResult.isValid) {
          result.isValid = false;
          result.errors.push(...sectionResult.errors);
        }

        result.warnings.push(...sectionResult.warnings);
      }
    }

    return result;
  }

  /**
   * Repair invalid settings by replacing with defaults
   */
  repairInvalidSettings(settings, validationResult) {
    const repairedSettings = { ...settings };

    for (const [sectionName, sectionResult] of Object.entries(validationResult.sectionResults)) {
      if (!sectionResult.isValid) {
        console.warn(`Repairing invalid settings section: ${sectionName}`);
        repairedSettings[sectionName] = { ...DEFAULT_SETTINGS[sectionName] };
      }
    }

    return repairedSettings;
  }

  /**
   * Migrate settings from older versions
   */
  migrateSettings(settings) {
    // Add migration logic here as the application evolves
    // For now, just ensure all required sections exist
    const migratedSettings = { ...DEFAULT_SETTINGS, ...settings };

    // Ensure each section has all required fields
    for (const [sectionName, defaultSection] of Object.entries(DEFAULT_SETTINGS)) {
      if (typeof defaultSection === 'object' && defaultSection !== null) {
        migratedSettings[sectionName] = {
          ...defaultSection,
          ...migratedSettings[sectionName]
        };
      }
    }

    return migratedSettings;
  }

  /**
   * Save settings to localStorage
   */
  async save(settings) {
    try {
      const settingsToSave = {
        ...settings,
        lastUpdated: new Date().toISOString()
      };

      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsToSave));

      return { success: true };
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        return {
          success: false,
          error: 'Storage quota exceeded. Please clear some browser data and try again.'
        };
      }

      return {
        success: false,
        error: `Failed to save settings: ${error.message}`
      };
    }
  }

  /**
   * Load settings from localStorage
   */
  async load() {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!stored) {
        return { ...DEFAULT_SETTINGS };
      }

      const parsed = JSON.parse(stored);
      return parsed;
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Get default settings
   */
  static getDefaults() {
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Add a change listener
   */
  addChangeListener(listener) {
    this.changeListeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Notify all change listeners
   */
  notifyListeners(sectionName, sectionData) {
    for (const listener of this.changeListeners) {
      try {
        listener(sectionName, sectionData, this.settings);
      } catch (error) {
        console.error('Error in settings change listener:', error);
      }
    }
  }

  /**
   * Clear validation cache
   */
  clearValidationCache() {
    this.validationCache.clear();
  }

  /**
   * Get settings information for debugging
   */
  getSettingsInfo() {
    return {
      isInitialized: this.isInitialized,
      hasSettings: !!this.settings,
      lastUpdated: this.settings?.lastUpdated,
      version: this.settings?.version,
      listenerCount: this.changeListeners.size,
      cacheSize: this.validationCache.size
    };
  }

  /**
   * Export settings for backup
   */
  exportSettings() {
    return {
      settings: this.getSettings(),
      exportedAt: new Date().toISOString(),
      version: DEFAULT_SETTINGS.version
    };
  }

  /**
   * Import settings from backup
   */
  async importSettings(exportedData) {
    try {
      if (!exportedData.settings) {
        throw new Error('Invalid export data: missing settings');
      }

      // Validate imported settings
      const validationResult = this.validateAllSections(exportedData.settings);
      if (!validationResult.isValid) {
        return {
          success: false,
          error: 'Imported settings failed validation',
          validationErrors: validationResult.errors
        };
      }

      // Save imported settings
      const saveResult = await this.save(exportedData.settings);
      if (saveResult.success) {
        this.settings = exportedData.settings;
        this.notifyListeners('*', this.settings);

        return {
          success: true,
          settings: this.settings
        };
      } else {
        return saveResult;
      }
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'SettingsService',
        action: 'importSettings'
      });

      return {
        success: false,
        error: errorInfo.userMessage
      };
    }
  }
}

// Create and export singleton instance
export const settingsService = new SettingsService();

// Export class for testing
export default SettingsService;
