/**
 * useSettings Hook
 * Provides React integration for the SettingsService
 * Manages settings state and provides convenient methods for components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { settingsService } from '../services/settingsService.js';

/**
 * Custom hook for managing application settings
 * @param {string|null} sectionName - Optional section name to focus on specific settings
 * @returns {Object} Settings state and management functions
 */
export function useSettings(sectionName = null) {
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const unsubscribeRef = useRef(null);

  // Initialize settings service and load settings
  useEffect(() => {
    let mounted = true;

    const initializeSettings = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const result = await settingsService.initialize();

        if (mounted) {
          if (result.success) {
            setSettings(result.settings);
            setIsInitialized(true);
          } else {
            setError(result.error);
            // Still set settings to defaults even if there was an error
            setSettings(result.settings);
            setIsInitialized(true);
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err.message);
          // Fallback to defaults
          setSettings(settingsService.getSettings());
          setIsInitialized(true);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initializeSettings();

    return () => {
      mounted = false;
    };
  }, []);

  // Set up change listener
  useEffect(() => {
    if (!isInitialized) return;

    const handleSettingsChange = (changedSection, changedData, allSettings) => {
      // Update settings if we're listening to all sections or the specific section changed
      if (!sectionName || changedSection === sectionName || changedSection === '*') {
        setSettings(allSettings);
      }
    };

    unsubscribeRef.current = settingsService.addChangeListener(handleSettingsChange);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [isInitialized, sectionName]);

  // Get current settings or section
  const getCurrentSettings = useCallback(() => {
    if (!settings) return null;

    if (sectionName) {
      return settings[sectionName] || {};
    }

    return settings;
  }, [settings, sectionName]);

  // Update a specific section
  const updateSection = useCallback(async (sectionNameToUpdate, sectionData) => {
    try {
      setError(null);
      const result = await settingsService.updateSection(sectionNameToUpdate, sectionData);

      if (!result.success) {
        setError(result.error || 'Failed to update settings');
        return result;
      }

      // Settings will be updated via the change listener
      return result;
    } catch (err) {
      setError(err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }, []);

  // Update multiple sections
  const updateMultipleSections = useCallback(async (sectionsData) => {
    try {
      setError(null);
      const result = await settingsService.updateMultipleSections(sectionsData);

      if (!result.success) {
        setError(result.error || 'Failed to update settings');
        return result;
      }

      return result;
    } catch (err) {
      setError(err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }, []);

  // Reset to defaults
  const resetToDefaults = useCallback(async () => {
    try {
      setError(null);
      const result = await settingsService.resetToDefaults();

      if (!result.success) {
        setError(result.error || 'Failed to reset settings');
        return result;
      }

      return result;
    } catch (err) {
      setError(err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }, []);

  // Validate section data
  const validateSection = useCallback((sectionNameToValidate, sectionData) => {
    return settingsService.validateSection(sectionNameToValidate, sectionData);
  }, []);

  // Get a specific setting value with fallback
  const getSetting = useCallback((path, fallback = null) => {
    if (!settings) return fallback;

    const keys = path.split('.');
    let value = settings;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return fallback;
      }
    }

    return value;
  }, [settings]);

  // Update a specific setting by path
  const updateSetting = useCallback(async (path, value) => {
    if (!settings) return { success: false, error: 'Settings not loaded' };

    const keys = path.split('.');
    if (keys.length < 2) {
      return { success: false, error: 'Invalid setting path' };
    }

    const sectionNameToUpdate = keys[0];
    const settingKey = keys.slice(1).join('.');

    // Get current section
    const currentSection = settings[sectionNameToUpdate] || {};

    // Create updated section with the new value
    const updatedSection = { ...currentSection };

    // Handle nested paths
    if (keys.length === 2) {
      updatedSection[keys[1]] = value;
    } else {
      // For deeper nesting, we'd need more complex logic
      // For now, just handle simple cases
      updatedSection[settingKey] = value;
    }

    return await updateSection(sectionNameToUpdate, updatedSection);
  }, [settings, updateSection]);

  // Export settings
  const exportSettings = useCallback(() => {
    return settingsService.exportSettings();
  }, []);

  // Import settings
  const importSettings = useCallback(async (exportedData) => {
    try {
      setError(null);
      const result = await settingsService.importSettings(exportedData);

      if (!result.success) {
        setError(result.error || 'Failed to import settings');
        return result;
      }

      return result;
    } catch (err) {
      setError(err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }, []);

  return {
    // State
    settings: getCurrentSettings(),
    allSettings: settings,
    isLoading,
    error,
    isInitialized,

    // Actions
    updateSection,
    updateMultipleSections,
    updateSetting,
    resetToDefaults,
    validateSection,
    getSetting,
    exportSettings,
    importSettings,

    // Utilities
    clearError: () => setError(null),
    getSettingsInfo: () => settingsService.getSettingsInfo()
  };
}

/**
 * Hook specifically for determinism settings
 */
export function useDeterminismSettings() {
  const {
    settings: determinismSettings,
    updateSection,
    validateSection,
    getSetting,
    updateSetting,
    isLoading,
    error,
    isInitialized
  } = useSettings('determinism');

  const updateDeterminismSettings = useCallback((newSettings) => {
    return updateSection('determinism', newSettings);
  }, [updateSection]);

  const updateDeterminismSetting = useCallback((key, value) => {
    return updateSetting(`determinism.${key}`, value);
  }, [updateSetting]);

  const validateDeterminismSettings = useCallback((settingsData) => {
    return validateSection('determinism', settingsData);
  }, [validateSection]);

  return {
    settings: determinismSettings || {},
    updateSettings: updateDeterminismSettings,
    updateSetting: updateDeterminismSetting,
    validateSettings: validateDeterminismSettings,
    getSetting: (key, fallback) => getSetting(`determinism.${key}`, fallback),
    isLoading,
    error,
    isInitialized
  };
}

/**
 * Hook specifically for UI settings
 */
export function useUISettings() {
  const {
    settings: uiSettings,
    updateSection,
    validateSection,
    getSetting,
    updateSetting,
    isLoading,
    error,
    isInitialized
  } = useSettings('ui');

  const updateUISettings = useCallback((newSettings) => {
    return updateSection('ui', newSettings);
  }, [updateSection]);

  const updateUISetting = useCallback((key, value) => {
    return updateSetting(`ui.${key}`, value);
  }, [updateSetting]);

  const validateUISettings = useCallback((settingsData) => {
    return validateSection('ui', settingsData);
  }, [validateSection]);

  return {
    settings: uiSettings || {},
    updateSettings: updateUISettings,
    updateSetting: updateUISetting,
    validateSettings: validateUISettings,
    getSetting: (key, fallback) => getSetting(`ui.${key}`, fallback),
    isLoading,
    error,
    isInitialized
  };
}

/**
 * Hook specifically for AWS settings
 */
export function useAWSSettings() {
  const {
    settings: awsSettings,
    updateSection,
    validateSection,
    getSetting,
    updateSetting,
    isLoading,
    error,
    isInitialized
  } = useSettings('aws');

  const updateAWSSettings = useCallback((newSettings) => {
    return updateSection('aws', newSettings);
  }, [updateSection]);

  const updateAWSSetting = useCallback((key, value) => {
    return updateSetting(`aws.${key}`, value);
  }, [updateSetting]);

  const validateAWSSettings = useCallback((settingsData) => {
    return validateSection('aws', settingsData);
  }, [validateSection]);

  return {
    settings: awsSettings || {},
    updateSettings: updateAWSSettings,
    updateSetting: updateAWSSetting,
    validateSettings: validateAWSSettings,
    getSetting: (key, fallback) => getSetting(`aws.${key}`, fallback),
    isLoading,
    error,
    isInitialized
  };
}

/**
 * Hook specifically for cost settings
 */
export function useCostSettings() {
  const {
    settings: costSettings,
    updateSection,
    validateSection,
    getSetting,
    updateSetting,
    isLoading,
    error,
    isInitialized
  } = useSettings('cost');

  const updateCostSettings = useCallback((newSettings) => {
    return updateSection('cost', newSettings);
  }, [updateSection]);

  const updateCostSetting = useCallback((key, value) => {
    return updateSetting(`cost.${key}`, value);
  }, [updateSetting]);

  const validateCostSettings = useCallback((settingsData) => {
    return validateSection('cost', settingsData);
  }, [validateSection]);

  // Convenience method to toggle cost display
  const toggleCostDisplay = useCallback(async () => {
    const currentValue = costSettings?.showCostEstimates || false;
    return await updateCostSetting('showCostEstimates', !currentValue);
  }, [costSettings?.showCostEstimates, updateCostSetting]);

  // Method to update pricing data timestamp
  const updatePricingTimestamp = useCallback(async () => {
    return await updateCostSetting('lastPricingUpdate', new Date().toISOString());
  }, [updateCostSetting]);

  return {
    settings: costSettings || {},
    updateSettings: updateCostSettings,
    updateSetting: updateCostSetting,
    validateSettings: validateCostSettings,
    getSetting: (key, fallback) => getSetting(`cost.${key}`, fallback),
    toggleCostDisplay,
    updatePricingTimestamp,
    isLoading,
    error,
    isInitialized,

    // Convenience getters for commonly used settings
    showCostEstimates: costSettings?.showCostEstimates || false,
    costCurrency: costSettings?.costCurrency || 'USD',
    includePricingDisclaimer: costSettings?.includePricingDisclaimer !== false,
    autoUpdatePricing: costSettings?.autoUpdatePricing !== false,
    pricingDataSource: costSettings?.pricingDataSource || 'aws-bedrock',
    lastPricingUpdate: costSettings?.lastPricingUpdate || null
  };
}

export default useSettings;
