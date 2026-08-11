import { HandlerUtils } from './handlerUtils.js';

/**
 * Update risk profile for an account
 * @param {Object} parameters - Update risk profile parameters
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Update result
 */
export async function updateRiskProfile(parameters, context) {
  const {
    account_id,
    risk_level,
    risk_factors,
    monitoring_level,
    update_reason,
    valid_until
  } = parameters;

  try {
    // Initialize storage if needed
    const db = await HandlerUtils.initializeStorage();

    // Get current account data or create new record
    let accountData = await HandlerUtils.getFromStorage(db, 'accounts', account_id) || {
      account_id,
      created_at: new Date().toISOString()
    };

    // Store previous risk level for comparison
    const previousRiskLevel = accountData.risk_level || 'medium';

    // Update risk profile
    accountData.risk_level = risk_level;
    accountData.risk_factors = risk_factors;
    accountData.monitoring_level = monitoring_level;
    accountData.risk_update_reason = update_reason;
    accountData.risk_valid_until = valid_until;
    accountData.risk_updated_at = new Date().toISOString();
    accountData.previous_risk_level = previousRiskLevel;
    accountData.updated_at = new Date().toISOString();

    // Add risk history entry
    accountData.risk_history = accountData.risk_history || [];
    accountData.risk_history.push({
      timestamp: accountData.risk_updated_at,
      previous_level: previousRiskLevel,
      new_level: risk_level,
      reason: update_reason,
      factors: risk_factors
    });

    // Keep only last 10 history entries
    if (accountData.risk_history.length > 10) {
      accountData.risk_history = accountData.risk_history.slice(-10);
    }

    await HandlerUtils.saveToStorage(db, 'accounts', accountData);

    const result = {
      success: true,
      account_id,
      profile_update_id: HandlerUtils.generateId('RISK'),
      previous_risk_level: previousRiskLevel,
      new_risk_level: risk_level,
      risk_change: getRiskChange(previousRiskLevel, risk_level),
      monitoring_level,
      update_timestamp: accountData.risk_updated_at,
      valid_until,
      recommended_actions: getRecommendedActions(risk_level, risk_factors),
      monitoring_frequency: getMonitoringFrequency(monitoring_level),
      review_schedule: getReviewSchedule(risk_level, valid_until)
    };

    return result;

  } catch (error) {
    throw new Error(`Failed to update risk profile for ${account_id}: ${error.message}`);
  }
}

/**
 * Get risk change direction
 */
function getRiskChange(previousLevel, newLevel) {
  const levels = ['very_low', 'low', 'medium', 'high', 'very_high'];
  const prevIndex = levels.indexOf(previousLevel);
  const newIndex = levels.indexOf(newLevel);

  if (newIndex > prevIndex) return 'increased';
  if (newIndex < prevIndex) return 'decreased';
  return 'unchanged';
}

/**
 * Get recommended actions based on risk level and factors
 */
function getRecommendedActions(riskLevel, riskFactors) {
  const actions = {
    very_high: ['Immediate review required', 'Consider account restrictions', 'Enhanced monitoring'],
    high: ['Increase monitoring frequency', 'Review recent transactions', 'Customer verification'],
    medium: ['Standard monitoring', 'Periodic review', 'Watch for patterns'],
    low: ['Routine monitoring', 'Quarterly review'],
    very_low: ['Minimal monitoring', 'Annual review']
  };
  return actions[riskLevel] || actions.medium;
}

/**
 * Get monitoring frequency based on level
 */
function getMonitoringFrequency(level) {
  const frequencies = {
    intensive: 'Real-time monitoring with immediate alerts',
    enhanced: 'Hourly monitoring with daily reports',
    standard: 'Daily monitoring with weekly reports'
  };
  return frequencies[level] || frequencies.standard;
}

/**
 * Get review schedule based on risk level and validity
 */
function getReviewSchedule(riskLevel, validUntil) {
  const schedules = {
    very_high: 'Weekly review required',
    high: 'Bi-weekly review required',
    medium: 'Monthly review required',
    low: 'Quarterly review required',
    very_low: 'Annual review required'
  };

  const baseSchedule = schedules[riskLevel] || schedules.medium;
  if (validUntil) {
    return `${baseSchedule} (expires ${validUntil})`;
  }
  return baseSchedule;
}
