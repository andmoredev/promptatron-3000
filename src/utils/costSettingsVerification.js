/**
 * Cost Settings Verification Utility
 * Provides verification functions for cost settings functionality
 */

import { settingsService } from '../services/settingsService.js';

/**
 * Verify cost settings are properly configured
 */
export async function verifyCostSettings() {
  const results = {
    success: true,
    tests: [],
    errors: []
  };

  try {
    // Test 1: Verify cost section exists in defaults
    const defaults = settingsService.constructor.getDefaults();
    if (!defaults.cost) {
      results.success = false;
      results.errors.push('Cost section missing from default settings');
    } else {
      results.tests.push('✅ Cost section exists in defaults');
    }

    // Test 2: Verify cost settings structure
    const expectedFields = [
      'showCostEstimates',
      'costCurrency',
      'includePricingDisclaimer',
      'autoUpdatePricing',
      'pricingDataSource',
      'lastPricingUpdate'
    ];

    for (const field of expectedFields) {
      if (!(field in defaults.cost)) {
        results.success = false;
        results.errors.push(`Missing cost setting field: ${field}`);
      } else {
        results.tests.push(`✅ Cost field '${field}' exists`);
      }
    }

    // Test 3: Verify validation rules exist
    const costSettings = settingsService.getSection('cost');
    const validationResult = settingsService.validateSection('cost', costSettings);

    if (!validationResult) {
      results.success = false;
      results.errors.push('Cost settings validation not working');
    } else {
      results.tests.push('✅ Cost settings validation is functional');
    }

    // Test 4: Test invalid values are rejected
    const invalidValidation = settingsService.validateSection('cost', {
      showCostEstimates: 'not-boolean',
      costCurrency: 'INVALID_CURRENCY'
    });

    if (invalidValidation.isValid) {
      results.success = false;
      results.errors.push('Cost settings validation should reject invalid values');
    } else {
      results.tests.push('✅ Cost settings validation rejects invalid values');
    }

    // Test 5: Test valid values are accepted
    const validValidation = settingsService.validateSection('cost', {
      showCostEstimates: true,
      costCurrency: 'EUR',
      includePricingDisclaimer: false
    });

    if (!validValidation.isValid) {
      results.success = false;
      results.errors.push(`Cost settings validation rejected valid values: ${validValidation.errors.join(', ')}`);
    } else {
      results.tests.push('✅ Cost settings validation accepts valid values');
    }

  } catch (error) {
    results.success = false;
    results.errors.push(`Verification error: ${error.message}`);
  }

  return results;
}

/**
 * Log verification results to console
 */
export function logVerificationResults(results) {
  console.log('\n=== Cost Settings Verification ===');

  if (results.success) {
    console.log('🎉 All cost settings verification tests passed!');
  } else {
    console.log('❌ Cost settings verification failed');
  }

  console.log('\nTest Results:');
  results.tests.forEach(test => console.log(`  ${test}`));

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(error => console.log(`  ❌ ${error}`));
  }

  console.log('=====================================\n');
}

/**
 * Run verification and log results
 */
export async function runCostSettingsVerification() {
  const results = await verifyCostSettings();
  logVerificationResults(results);
  return results;
}

// Export for browser console testing
if (typeof window !== 'undefined') {
  window.verifyCostSettings = runCostSettingsVerification;
}
