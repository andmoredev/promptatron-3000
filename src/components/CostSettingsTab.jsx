/**
 * CostSettingsTab Component
 * Provides cost-related settings configuration within the SettingsDialog
 * Handles cost display toggle, pricing data information, and related preferences
 */

import React, { useState, useEffect, useCallback } from 'react';
import Pros from 'prop-types';
import { useCostSettings } from '../hooks/useSettings.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import HelpTooltip from './HelpTooltip.jsx';

/**
 * Cost Settings Tab Component
 */
function CostSettingsTab({ onSettingsChange }) {
  const {
    settings,
    updateSettings,
    validateSettings,
    isLoading,
    error,
    showCostEstimates,
    costCurrency,
    includePricingDisclaimer,
    autoUpdatePricing,
    pricingDataSource,
    lastPricingUpdate
  } = useCostSettings();

  const [localSettings, setLocalSettings] = useState(settings);
  const [validationErrors, setValidationErrors] = useState({});
  const [previewEnabled, setPreviewEnabled] = useState(false);

  // Update local settings when global settings change
  useEffect(() => {
    setLocalSettings(settings);
    setPreviewEnabled(settings.showCostEstimates || false);
  }, [settings]);

  // Handle field changes with immediate preview
  const handleFieldChange = useCallback(async (field, value) => {
    const newSettings = { ...localSettings, [field]: value };
    setLocalSettings(newSettings);

    // Update preview for cost display toggle
    if (field === 'showCostEstimates') {
      setPreviewEnabled(value);
    }

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

  // Format last update timestamp
  const formatLastUpdate = useCallback((timestamp) => {
    if (!timestamp) return 'Never';

    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString();
    } catch (error) {
      return 'Invalid date';
    }
  }, []);

  if (isLoading) {
    return <LoadingSpinner size="md" text="Loading cost settings..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost & Token Settings</h3>
        <p className="text-sm text-gray-600 mb-6">
          Configure cost estimation display and token tracking preferences for AWS Bedrock model usage.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Cost Display Toggle with Preview */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={localSettings.showCostEstimates || false}
                  onChange={(e) => handleFieldChange('showCostEstimates', e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Show Cost Estimates</span>
                  <div className="flex items-center space-x-2 mt-1">
                    <p className="text-xs text-gray-600">
                      Display estimated costs for model requests in test results and history
                    </p>
                    <HelpTooltip
                      content="When enabled, the application will calculate and display estimated costs based on token usage and current AWS Bedrock pricing. Costs are estimates and may vary from actual billing."
                      position="right"
                    />
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Live Preview */}
          <div className="mt-4 p-3 bg-white border border-gray-200 rounded-md">
            <h4 className="text-xs font-medium text-gray-700 mb-2">Preview:</h4>
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>Input tokens: 150</span>
                <span>Output tokens: 75</span>
              </div>
              <div className="flex justify-between">
                <span>Total tokens: 225</span>
                {previewEnabled && (
                  <span className="text-green-600 font-medium">
                    Est. cost: $0.0045 {costCurrency}
                  </span>
                )}
              </div>
              {previewEnabled && includePricingDisclaimer && (
                <p className="text-xs text-gray-500 italic mt-2">
                  * Cost estimates are based on current AWS Bedrock pricing and may vary
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Cost Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Currency */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <span>Currency</span>
              <HelpTooltip
                content="Currency to display for cost estimates. Note that AWS Bedrock pricing is primarily in USD."
                position="bottom"
              />
            </label>
            <select
              value={localSettings.costCurrency || 'USD'}
              onChange={(e) => handleFieldChange('costCurrency', e.target.value)}
              className={`input-field ${validationErrors.costCurrency ? 'border-red-300' : ''}`}
              disabled={!localSettings.showCostEstimates}
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
            {validationErrors.costCurrency && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.costCurrency}</p>
            )}
          </div>

          {/* Pricing Data Source */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <span>Pricing Data Source</span>
              <HelpTooltip
                content="Source of pricing information for cost calculations. Currently only AWS Bedrock official pricing is supported."
                position="bottom"
              />
            </label>
            <select
              value={localSettings.pricingDataSource || 'aws-bedrock'}
              onChange={(e) => handleFieldChange('pricingDataSource', e.target.value)}
              className={`input-field ${validationErrors.pricingDataSource ? 'border-red-300' : ''}`}
              disabled={!localSettings.showCostEstimates}
            >
              <option value="aws-bedrock">AWS Bedrock Official</option>
            </select>
            {validationErrors.pricingDataSource && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.pricingDataSource}</p>
            )}
          </div>

          {/* Include Pricing Disclaimer */}
          <div>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={localSettings.includePricingDisclaimer !== false}
                onChange={(e) => handleFieldChange('includePricingDisclaimer', e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                disabled={!localSettings.showCostEstimates}
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Show Pricing Disclaimer</span>
                <p className="text-xs text-gray-500">Display disclaimer that costs are estimates</p>
              </div>
            </label>
          </div>

          {/* Auto Update Pricing */}
          <div>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={localSettings.autoUpdatePricing !== false}
                onChange={(e) => handleFieldChange('autoUpdatePricing', e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                disabled={!localSettings.showCostEstimates}
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Auto-Update Pricing</span>
                <p className="text-xs text-gray-500">Automatically check for pricing updates</p>
              </div>
            </label>
          </div>
        </div>

        {/* Pricing Data Information */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-blue-800">Pricing Data Information</h4>
              <div className="text-sm text-blue-700 mt-1 space-y-1">
                <p><strong>Data Source:</strong> {pricingDataSource || 'aws-bedrock'}</p>
                <p><strong>Last Updated:</strong> {formatLastUpdate(lastPricingUpdate)}</p>
                <p><strong>Currency:</strong> {costCurrency}</p>
              </div>
              <p className="text-xs text-blue-600 mt-2">
                Pricing data is embedded in the application and updated with new releases.
                Cost estimates are based on current AWS Bedrock on-demand pricing.
              </p>
            </div>
          </div>
        </div>

        {/* Performance Impact Notice */}
        {localSettings.showCostEstimates && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <svg className="w-5 h-5 text-yellow-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-yellow-800">Performance Impact</h4>
                <p className="text-sm text-yellow-700 mt-1">
                  Enabling cost estimates adds minimal computational overhead. Token estimation and cost calculations
                  are performed locally and do not require additional API calls.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Cost Accuracy Notice */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <svg className="w-5 h-5 text-gray-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-gray-700">Cost Accuracy</h4>
              <p className="text-sm text-gray-600 mt-1">
                Cost estimates are calculated using current AWS Bedrock pricing and token counts from API responses
                when available, or estimated using the tiktoken library. Actual costs may vary due to:
              </p>
              <ul className="text-xs text-gray-600 mt-2 ml-4 space-y-1">
                <li>• Regional pricing differences</li>
                <li>• Pricing changes not yet reflected in the application</li>
                <li>• Token estimation accuracy for non-OpenAI models</li>
                <li>• Additional AWS charges (data transfer, etc.)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

CostSettingsTab.propTypes = {
  onSettingsChange: PropTypes.func.isRequired
};

export default CostSettingsTab;
