/**
 * SettingsDialog Component
 * Provides a comprehensive settings interface with tabbed sections
 * Handles validation, persistence, and user feedback
 */

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useSettings, useDeterminismSettings, useUISettings, useAWSSettings } from '../hooks/useSettings.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import HelpTooltip from './HelpTooltip.jsx';

/**
 * Main SettingsDialog component
 */
function SettingsDialog({ isOpen, onClose, onSave }) {
  const [activeTab, setActiveTab] = useState('determinism');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving', 'success', 'error'
  const [saveMessage, setSaveMessage] = useState('');

  const {
    allSettings,
    isLoading: globalLoading,
    error: globalError,
    isInitialized,
    resetToDefaults,
    exportSettings,
    importSettings
  } = useSettings();

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Handle close with unsaved changes warning
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to close without saving?'
      );
      if (!confirmed) return;
    }

    setHasUnsavedChanges(false);
    setSaveStatus(null);
    setSaveMessage('');
    onClose();
  }, [hasUnsavedChanges, onClose]);

  // Handle save all settings
  const handleSaveAll = useCallback(async () => {
    setSaveStatus('saving');
    setSaveMessage('Saving settings...');

    try {
      // The individual sections will handle their own saving
      // This is more of a confirmation action
      setHasUnsavedChanges(false);
      setSaveStatus('success');
      setSaveMessage('Settings saved successfully!');

      if (onSave) {
        onSave(allSettings);
      }

      // Clear success message after 2 seconds
      setTimeout(() => {
        setSaveStatus(null);
        setSaveMessage('');
      }, 2000);
    } catch (error) {
      setSaveStatus('error');
      setSaveMessage(`Failed to save settings: ${error.message}`);
    }
  }, [allSettings, onSave]);

  // Handle reset to defaults
  const handleResetToDefaults = useCallback(async () => {
    const confirmed = window.confirm(
      'Are you sure you want to reset all settings to their default values? This cannot be undone.'
    );

    if (!confirmed) return;

    setSaveStatus('saving');
    setSaveMessage('Resetting to defaults...');

    try {
      const result = await resetToDefaults();
      if (result.success) {
        setHasUnsavedChanges(false);
        setSaveStatus('success');
        setSaveMessage('Settings reset to defaults successfully!');

        setTimeout(() => {
          setSaveStatus(null);
          setSaveMessage('');
        }, 2000);
      } else {
        setSaveStatus('error');
        setSaveMessage(result.error || 'Failed to reset settings');
      }
    } catch (error) {
      setSaveStatus('error');
      setSaveMessage(`Failed to reset settings: ${error.message}`);
    }
  }, [resetToDefaults]);

  // Handle export settings
  const handleExportSettings = useCallback(() => {
    try {
      const exportData = exportSettings();
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `promptatron-settings-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSaveStatus('success');
      setSaveMessage('Settings exported successfully!');

      setTimeout(() => {
        setSaveStatus(null);
        setSaveMessage('');
      }, 2000);
    } catch (error) {
      setSaveStatus('error');
      setSaveMessage(`Failed to export settings: ${error.message}`);
    }
  }, [exportSettings]);

  // Handle import settings
  const handleImportSettings = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importData = JSON.parse(e.target.result);

        setSaveStatus('saving');
        setSaveMessage('Importing settings...');

        const result = await importSettings(importData);
        if (result.success) {
          setHasUnsavedChanges(false);
          setSaveStatus('success');
          setSaveMessage('Settings imported successfully!');

          setTimeout(() => {
            setSaveStatus(null);
            setSaveMessage('');
          }, 2000);
        } else {
          setSaveStatus('error');
          setSaveMessage(result.error || 'Failed to import settings');
        }
      } catch (error) {
        setSaveStatus('error');
        setSaveMessage(`Failed to import settings: ${error.message}`);
      }
    };
    reader.readAsText(file);

    // Reset file input
    event.target.value = '';
  }, [importSettings]);

  if (!isOpen) return null;

  const tabs = [
    { id: 'determinism', label: 'Determinism' },
    { id: 'ui', label: 'Interface' },
    { id: 'aws', label: 'AWS' }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-secondary-100">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Application Settings</h2>
              <p className="text-sm text-gray-600">Configure your Promptatron 3000 experience</p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Loading State with Smooth Transition */}
        {globalLoading && (
          <div className="flex items-center justify-center py-12 animate-fade-in">
            <LoadingSpinner size="lg" text="Loading settings..." />
          </div>
        )}

        {/* Error State with Smooth Transition */}
        {globalError && (
          <div className="p-6 animate-fade-in">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4" role="alert">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-sm font-medium text-red-800">Settings Error</span>
              </div>
              <p className="text-sm text-red-700 mt-1">{globalError}</p>
            </div>
          </div>
        )}

        {/* Main Content */}
        {isInitialized && !globalLoading && (
          <>
            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200 bg-gray-50">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors duration-200 ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600 bg-white'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content with Smooth Transitions */}
            <div className="p-6 overflow-y-auto h-[30rem]">
              {activeTab === 'determinism' && (
                <div className="animate-fade-in">
                  <DeterminismSettingsTab onSettingsChange={() => setHasUnsavedChanges(true)} />
                </div>
              )}
              {activeTab === 'ui' && (
                <div className="animate-fade-in">
                  <UISettingsTab onSettingsChange={() => setHasUnsavedChanges(true)} />
                </div>
              )}
              {activeTab === 'aws' && (
                <div className="animate-fade-in">
                  <AWSSettingsTab onSettingsChange={() => setHasUnsavedChanges(true)} />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center space-x-4">
                {/* Import/Export */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleExportSettings}
                    className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                  >
                    Export
                  </button>
                  <span className="text-gray-300">|</span>
                  <label className="text-sm text-gray-600 hover:text-gray-800 font-medium cursor-pointer">
                    Import
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportSettings}
                      className="hidden"
                    />
                  </label>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={handleResetToDefaults}
                    className="text-sm text-red-600 hover:text-red-700 font-medium"
                  >
                    Reset to Defaults
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {/* Save Status */}
                {saveStatus && (
                  <div className="flex items-center space-x-2">
                    {saveStatus === 'saving' && <LoadingSpinner size="sm" />}
                    {saveStatus === 'success' && (
                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {saveStatus === 'error' && (
                      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    )}
                    <span className={`text-sm ${
                      saveStatus === 'success' ? 'text-green-600' :
                      saveStatus === 'error' ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {saveMessage}
                    </span>
                  </div>
                )}

                {/* Action Buttons */}
                <button
                  onClick={handleClose}
                  className="btn-secondary"
                >
                  {hasUnsavedChanges ? 'Cancel' : 'Close'}
                </button>

                {hasUnsavedChanges && (
                  <button
                    onClick={handleSaveAll}
                    className="btn-primary"
                    disabled={saveStatus === 'saving'}
                  >
                    {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Determinism Settings Tab
 */
function DeterminismSettingsTab({ onSettingsChange }) {
  const {
    settings,
    updateSettings,
    validateSettings,
    isLoading,
    error
  } = useDeterminismSettings();

  const [localSettings, setLocalSettings] = useState(settings);
  const [validationErrors, setValidationErrors] = useState({});

  // Update local settings when global settings change
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Handle field changes
  const handleFieldChange = useCallback(async (field, value) => {
    const newSettings = { ...localSettings, [field]: value };
    setLocalSettings(newSettings);

    // Validate the change
    const validation = validateSettings(newSettings);
    setValidationErrors(validation.errors || {});

    // Save immediately if valid
    if (validation.isValid) {
      const result = await updateSettings(newSettings);
      if (result.success) {
        onSettingsChange();
      }
    } else {
      onSettingsChange();
    }
  }, [localSettings, validateSettings, updateSettings, onSettingsChange]);

  if (isLoading) {
    return <LoadingSpinner size="md" text="Loading determinism settings..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Determinism Evaluation Settings</h3>
        <p className="text-sm text-gray-600 mb-6">
          Configure how determinism evaluation works when testing model consistency.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Test Count */}
        <div>
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
            <span>Number of Test Runs</span>
            <HelpTooltip
              content="How many additional responses to generate for determinism evaluation. More tests provide better accuracy but take longer."
              position="bottom"
            />
          </label>
          <input
            type="number"
            min="3"
            max="50"
            value={localSettings.testCount || 10}
            onChange={(e) => handleFieldChange('testCount', parseInt(e.target.value))}
            className={`input-field ${validationErrors.testCount ? 'border-red-300' : ''}`}
          />
          {validationErrors.testCount && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.testCount}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Recommended: 10-20 for good balance of accuracy and speed
          </p>
        </div>

        {/* Max Retry Attempts */}
        <div>
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
            <span>Max Retry Attempts</span>
            <HelpTooltip
              content="How many times to retry a failed request before giving up. Higher values increase reliability but may slow down evaluation."
              position="bottom"
            />
          </label>
          <input
            type="number"
            min="1"
            max="5"
            value={localSettings.maxRetryAttempts || 3}
            onChange={(e) => handleFieldChange('maxRetryAttempts', parseInt(e.target.value))}
            className={`input-field ${validationErrors.maxRetryAttempts ? 'border-red-300' : ''}`}
          />
          {validationErrors.maxRetryAttempts && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.maxRetryAttempts}</p>
          )}
        </div>

        {/* Enable Throttling Alerts */}
        <div>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={localSettings.enableThrottlingAlerts || false}
              onChange={(e) => handleFieldChange('enableThrottlingAlerts', e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">Show Throttling Alerts</span>
              <p className="text-xs text-gray-500">Display notifications when AWS rate limits are encountered</p>
            </div>
          </label>
        </div>

        {/* Show Detailed Progress */}
        <div>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={localSettings.showDetailedProgress || false}
              onChange={(e) => handleFieldChange('showDetailedProgress', e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">Detailed Progress Display</span>
              <p className="text-xs text-gray-500">Show detailed progress information during evaluation</p>
            </div>
          </label>
        </div>

        {/* Enable Determinism Feature */}
        <div className="md:col-span-2">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={localSettings.enabled !== false}
              onChange={(e) => handleFieldChange('enabled', e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">Enable Determinism Evaluation</span>
              <p className="text-xs text-gray-500">
                When disabled, the determinism checkbox and evaluation features will be hidden
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Performance Impact Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-2">
          <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-sm font-medium text-blue-800">Performance Impact</h4>
            <p className="text-sm text-blue-700 mt-1">
              Higher test counts and retry attempts will increase evaluation time and AWS API usage.
              With {localSettings.testCount || 10} tests, expect evaluation to take approximately{' '}
              {Math.ceil((localSettings.testCount || 10) * 2 / 60)} minutes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * UI Settings Tab
 */
function UISettingsTab({ onSettingsChange }) {
  const {
    settings,
    updateSettings,
    validateSettings,
    isLoading,
    error
  } = useUISettings();

  const [localSettings, setLocalSettings] = useState(settings);

  // Update local settings when global settings change
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Handle field changes
  const handleFieldChange = useCallback(async (field, value) => {
    const newSettings = { ...localSettings, [field]: value };
    setLocalSettings(newSettings);

    // Save immediately
    const result = await updateSettings(newSettings);
    if (result.success) {
      onSettingsChange();
    }
  }, [localSettings, updateSettings, onSettingsChange]);

  if (isLoading) {
    return <LoadingSpinner size="md" text="Loading UI settings..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Interface Settings</h3>
        <p className="text-sm text-gray-600 mb-6">
          Customize the appearance and behavior of the user interface.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Theme */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Theme
          </label>
          <select
            value={localSettings.theme || 'light'}
            onChange={(e) => handleFieldChange('theme', e.target.value)}
            className="input-field"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Auto (System)</option>
          </select>
        </div>

        {/* Default Tab */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default Tab
          </label>
          <select
            value={localSettings.defaultTab || 'test'}
            onChange={(e) => handleFieldChange('defaultTab', e.target.value)}
            className="input-field"
          >
            <option value="test">Test</option>
            <option value="history">History</option>
            <option value="comparison">Comparison</option>
          </select>
        </div>

        {/* Animations Enabled */}
        <div>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={localSettings.animationsEnabled !== false}
              onChange={(e) => handleFieldChange('animationsEnabled', e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">Enable Animations</span>
              <p className="text-xs text-gray-500">Smooth transitions and visual effects</p>
            </div>
          </label>
        </div>

        {/* Compact Mode */}
        <div>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={localSettings.compactMode || false}
              onChange={(e) => handleFieldChange('compactMode', e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">Compact Mode</span>
              <p className="text-xs text-gray-500">Reduce spacing and padding for more content</p>
            </div>
          </label>
        </div>

        {/* Show Help Tooltips */}
        <div className="md:col-span-2">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={localSettings.showHelpTooltips !== false}
              onChange={(e) => handleFieldChange('showHelpTooltips', e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">Show Help Tooltips</span>
              <p className="text-xs text-gray-500">Display helpful tooltips throughout the interface</p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}

/**
 * AWS Settings Tab
 */
function AWSSettingsTab({ onSettingsChange }) {
  const {
    settings,
    updateSettings,
    validateSettings,
    isLoading,
    error
  } = useAWSSettings();

  const [localSettings, setLocalSettings] = useState(settings);
  const [validationErrors, setValidationErrors] = useState({});

  // Update local settings when global settings change
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Handle field changes
  const handleFieldChange = useCallback(async (field, value) => {
    const newSettings = { ...localSettings, [field]: value };
    setLocalSettings(newSettings);

    // Validate the change
    const validation = validateSettings(newSettings);
    setValidationErrors(validation.errors || {});

    // Save immediately if valid
    if (validation.isValid) {
      const result = await updateSettings(newSettings);
      if (result.success) {
        onSettingsChange();
      }
    } else {
      onSettingsChange();
    }
  }, [localSettings, validateSettings, updateSettings, onSettingsChange]);

  if (isLoading) {
    return <LoadingSpinner size="md" text="Loading AWS settings..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">AWS Configuration</h3>
        <p className="text-sm text-gray-600 mb-6">
          Configure AWS service settings and connection parameters.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Region */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default Region
          </label>
          <input
            type="text"
            value={localSettings.region || 'us-east-1'}
            onChange={(e) => handleFieldChange('region', e.target.value)}
            className={`input-field ${validationErrors.region ? 'border-red-300' : ''}`}
            placeholder="us-east-1"
          />
          {validationErrors.region && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.region}</p>
          )}
        </div>

        {/* Timeout */}
        <div>
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
            <span>Request Timeout (ms)</span>
            <HelpTooltip
              content="How long to wait for AWS API responses before timing out"
              position="bottom"
            />
          </label>
          <input
            type="number"
            min="5000"
            max="300000"
            step="1000"
            value={localSettings.timeout || 30000}
            onChange={(e) => handleFieldChange('timeout', parseInt(e.target.value))}
            className={`input-field ${validationErrors.timeout ? 'border-red-300' : ''}`}
          />
          {validationErrors.timeout && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.timeout}</p>
          )}
        </div>

        {/* Retry Attempts */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Retry Attempts
          </label>
          <input
            type="number"
            min="0"
            max="10"
            value={localSettings.retryAttempts || 3}
            onChange={(e) => handleFieldChange('retryAttempts', parseInt(e.target.value))}
            className={`input-field ${validationErrors.retryAttempts ? 'border-red-300' : ''}`}
          />
          {validationErrors.retryAttempts && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.retryAttempts}</p>
          )}
        </div>

        {/* Enable Credential Validation */}
        <div>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={localSettings.enableCredentialValidation !== false}
              onChange={(e) => handleFieldChange('enableCredentialValidation', e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">Validate Credentials</span>
              <p className="text-xs text-gray-500">Test AWS credentials on startup</p>
            </div>
          </label>
        </div>
      </div>

      {/* Security Notice */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start space-x-2">
          <svg className="w-5 h-5 text-yellow-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <h4 className="text-sm font-medium text-yellow-800">Security Notice</h4>
            <p className="text-sm text-yellow-700 mt-1">
              AWS credentials are configured through environment variables (.env.local file) and are not stored in these settings.
              Use the local-setup.sh script to configure credentials securely.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

SettingsDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func
};

DeterminismSettingsTab.propTypes = {
  onSettingsChange: PropTypes.func.isRequired
};

UISettingsTab.propTypes = {
  onSettingsChange: PropTypes.func.isRequired
};

AWSSettingsTab.propTypes = {
  onSettingsChange: PropTypes.func.isRequired
};

export default SettingsDialog;
