import { HandlerUtils } from './handlerUtils.js';

/**
 * Create a fraud alert for investigation
 * @param {Object} parameters - Create alert parameters
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Alert result
 */
export async function createFraudAlert(parameters, context) {
  const {
    alert_type,
    affected_accounts,
    related_transactions = [],
    priority,
    description,
    estimated_loss = 0,
    investigation_notes = ''
  } = parameters;

  try {
    // Initialize storage if needed
    const db = await HandlerUtils.initializeStorage();

    const alertId = HandlerUtils.generateId('ALERT');

    const alertData = {
      alert_id: alertId,
      alert_type,
      affected_accounts,
      related_transactions,
      priority,
      description,
      estimated_loss,
      investigation_notes,
      status: 'open',
      created_at: new Date().toISOString(),
      assigned_to: null,
      resolution_deadline: calculateResolutionDeadline(priority)
    };

    await HandlerUtils.saveToStorage(db, 'alerts', alertData);

    // Update affected accounts
    for (const accountId of affected_accounts) {
      let accountData = await HandlerUtils.getFromStorage(db, 'accounts', accountId) || {
        account_id: accountId,
        created_at: new Date().toISOString()
      };

      accountData.active_alerts = accountData.active_alerts || [];
      accountData.active_alerts.push(alertId);
      accountData.updated_at = new Date().toISOString();

      await HandlerUtils.saveToStorage(db, 'accounts', accountData);
    }

    const result = {
      success: true,
      alert_id: alertId,
      status: 'created',
      created_timestamp: alertData.created_at,
      affected_accounts_count: affected_accounts.length,
      related_transactions_count: related_transactions.length,
      priority_level: priority,
      estimated_impact: getEstimatedImpact(estimated_loss, affected_accounts.length),
      resolution_deadline: alertData.resolution_deadline,
      investigation_team: getInvestigationTeam(alert_type, priority),
      case_reference: `CASE_${alertId}`
    };

    return result;

  } catch (error) {
    throw new Error(`Failed to create fraud alert: ${error.message}`);
  }
}

/**
 * Calculate resolution deadline based on priority
 */
function calculateResolutionDeadline(priority) {
  const now = new Date();
  const deadlines = {
    critical: 4, // 4 hours
    high: 24,    // 24 hours
    medium: 72,  // 72 hours
    low: 168     // 1 week
  };

  const hours = deadlines[priority] || 72;
  now.setHours(now.getHours() + hours);
  return now.toISOString();
}

/**
 * Get estimated impact based on loss and account count
 */
function getEstimatedImpact(loss, accountCount) {
  if (loss > 100000 || accountCount > 50) return 'high';
  if (loss > 10000 || accountCount > 10) return 'medium';
  return 'low';
}

/**
 * Get investigation team based on alert type and priority
 */
function getInvestigationTeam(alertType, priority) {
  const teams = {
    account_takeover: 'Identity Fraud Team',
    identity_theft: 'Identity Fraud Team',
    card_testing: 'Payment Fraud Team',
    money_laundering: 'AML Investigation Team',
    organized_fraud: 'Complex Fraud Team',
    synthetic_identity: 'Identity Fraud Team'
  };

  const team = teams[alertType] || 'General Fraud Team';
  return priority === 'critical' ? `Senior ${team}` : team;
}
