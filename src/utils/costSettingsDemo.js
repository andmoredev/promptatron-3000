/**
 * Cost Settings Demo
 * Demonstrates how to use the useCostSettings hook
 */

// This would be used in a React component like this:

/*
import { useCostSettings } from '../hooks/useSettings.js';

function CostSettingsExample() {
  const {
    settings,
    showCostEstimates,
    costCurrency,
    updateSetting,
    toggleCostDisplay,
    updatePricingTimestamp,
    isLoading,
    error
  } = useCostSettings();

  if (isLoading) {
    return <div>Loading cost settings...</div>;
  }

  if (error) {
    return <div>Error loading cost settings: {error}</div>;
  }

  return (
    <div className="cost-settings-demo">
      <h3>Cost Settings Demo</h3>

      <div className="setting-item">
        <label>
          <input
            type="checkbox"
            checked={showCostEstimates}
            onChange={() => toggleCostDisplay()}
          />
          Show Cost Estimates
        </label>
      </div>

      <div className="setting-item">
        <label>
          Currency:
          <select
            value={costCurrency}
            onChange={(e) => updateSetting('costCurrency', e.target.value)}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="JPY">JPY</option>
          </select>
        </label>
      </div>

      <div className="setting-item">
        <label>
          <input
            type="checkbox"
            checked={settings.includePricingDisclaimer}
            onChange={(e) => updateSetting('includePricingDisclaimer', e.target.checked)}
          />
          Include Pricing Disclaimer
        </label>
      </div>

      <div className="setting-item">
        <label>
          <input
            type="checkbox"
            checked={settings.autoUpdatePricing}
            onChange={(e) => updateSetting('autoUpdatePricing', e.target.checked)}
          />
          Auto Update Pricing
        </label>
      </div>

      <div className="setting-item">
        <button onClick={() => updatePricingTimestamp()}>
          Update Pricing Timestamp
        </button>
        {settings.lastPricingUpdate && (
          <p>Last updated: {new Date(settings.lastPricingUpdate).toLocaleString()}</p>
        )}
      </div>

      <div className="current-settings">
        <h4>Current Settings:</h4>
        <pre>{JSON.stringify(settings, null, 2)}</pre>
      </div>
    </div>
  );
}

export default CostSettingsExample;
*/

// For testing in browser console:
export const costSettingsUsageExample = {
  description: 'Example of how to use useCostSettings hook',

  // Basic usage
  basicUsage: `
    const { showCostEstimates, toggleCostDisplay } = useCostSettings();

    // Toggle cost display
    await toggleCostDisplay();
  `,

  // Update specific setting
  updateSetting: `
    const { updateSetting } = useCostSettings();

    // Change currency
    await updateSetting('costCurrency', 'EUR');
  `,

  // Update multiple settings
  updateMultiple: `
    const { updateSettings } = useCostSettings();

    // Update multiple settings at once
    await updateSettings({
      showCostEstimates: true,
      costCurrency: 'GBP',
      includePricingDisclaimer: false
    });
  `,

  // Convenience getters
  convenientAccess: `
    const {
      showCostEstimates,    // boolean
      costCurrency,         // string
      includePricingDisclaimer, // boolean
      autoUpdatePricing,    // boolean
      lastPricingUpdate     // string | null
    } = useCostSettings();
  `
};

// Export for browser console
if (typeof window !== 'undefined') {
  window.costSettingsUsageExample = costSettingsUsageExample;
}
