/**
 * Simple test script to verify error handling functionality
 * This can be run in the browser console to test the error handling system
 */

import { tokenEstimationService } from '../services/tokenEstimationService.js';
import { costCalculationService } from '../services/costCalculationService.js';
import { notificationManager } from './notificationManager.js';
import { handleTokenEstimationError, handleCostCalculationError } from './tokenCostErrorHandling.js';

/**
 * Test token estimation error handling
 */
export async function testTokenEstimationErrorHandling() {
  console.log('Testing token estimation error handling...');

  try {
    // Force an error by passing invalid data
    const result = tokenEstimationService.estimateTokens(null, 'invalid-model');
    console.log('Token estimation result:', result);

    // Test error handling directly
    const error = new Error('Test token estimation error');
    const errorResult = handleTokenEstimationError(error, {
      modelId: 'test-model',
      text: 'test text',
      estimationMethod: 'test-method'
    });

    console.log('Error handling result:', errorResult);

    // Test notification
    notificationManager.notifyTokenEstimationError(
      errorResult.errorInfo,
      errorResult
    );

    console.log('Token estimation error handling test completed');
    return true;
  } catch (error) {
    console.error('Token estimation error handling test failed:', error);
    return false;
  }
}

/**
 * Test cost calculation error handling
 */
export async function testCostCalculationErrorHandling() {
  console.log('Testing cost calculation error handling...');

  try {
    // Test error handling directly
    const error = new Error('Test cost calculation error');
    const errorResult = handleCostCalculationError(error, {
      modelId: 'test-model',
      usage: { input_tokens: 100, output_tokens: 50 },
      region: 'us-east-1'
    });

    console.log('Error handling result:', errorResult);

    // Test notification
    notificationManager.notifyCostCalculationError(
      errorResult.errorInfo,
      errorResult
    );

    console.log('Cost calculation error handling test completed');
    return true;
  } catch (error) {
    console.error('Cost calculation error handling test failed:', error);
    return false;
  }
}

/**
 * Test notification manager
 */
export function testNotificationManager() {
  console.log('Testing notification manager...');

  try {
    // Add various types of notifications
    const errorId = notificationManager.addNotification({
      type: 'error',
      title: 'Test Error',
      message: 'This is a test error notification',
      actions: ['Retry', 'Dismiss'],
      dismissible: true
    });

    const warningId = notificationManager.addNotification({
      type: 'warning',
      title: 'Test Warning',
      message: 'This is a test warning notification',
      actions: ['Continue', 'Fix'],
      dismissible: true,
      autoHide: 5000
    });

    const infoId = notificationManager.addNotification({
      type: 'info',
      title: 'Test Info',
      message: 'This is a test info notification',
      dismissible: true,
      autoHide: 3000
    });

    console.log('Added notifications:', { errorId, warningId, infoId });

    // Get statistics
    const stats = notificationManager.getStatistics();
    console.log('Notification statistics:', stats);

    // Test deduplication
    const duplicateId = notificationManager.addNotification({
      type: 'error',
      title: 'Test Error',
      message: 'This is a test error notification', // Same message
      actions: ['Retry', 'Dismiss'],
      dismissible: true
    });

    console.log('Duplicate notification ID (should be null):', duplicateId);

    console.log('Notification manager test completed');
    return true;
  } catch (error) {
    console.error('Notification manager test failed:', error);
    return false;
  }
}

/**
 * Run all error handling tests
 */
export async function runAllErrorHandlingTests() {
  console.log('Running all error handling tests...');

  const results = {
    tokenEstimation: await testTokenEstimationErrorHandling(),
    costCalculation: await testCostCalculationErrorHandling(),
    notificationManager: testNotificationManager()
  };

  console.log('Test results:', results);

  const allPassed = Object.values(results).every(result => result === true);
  console.log(allPassed ? '✅ All tests passed!' : '❌ Some tests failed');

  return results;
}

// Export for browser console testing
if (typeof window !== 'undefined') {
  window.errorHandlingTests = {
    testTokenEstimationErrorHandling,
    testCostCalculationErrorHandling,
    testNotificationManager,
    runAllErrorHandlingTests
  };
}
