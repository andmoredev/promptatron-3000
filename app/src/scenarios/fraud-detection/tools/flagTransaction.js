import { HandlerUtils } from './handlerUtils.js';

/**
 * Flag a suspicious transaction for review
 * @param {Object} parameters - Flag transaction parameters
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Flag result
 */
export async function flagSuspiciousTransaction(parameters, context) {
  const {
    transaction_id,
    account_id,
    fraud_indicators,
    risk_score,
    confidence_level,
    recommended_action,
    notes = ''
  } = parameters;

  try {
    // Initialize storage if needed
    const db = await HandlerUtils.initializeStorage();

    // Create or update transaction record
    let txnData = await HandlerUtils.getFromStorage(db, 'transactions', transaction_id) || {
      transaction_id,
      account_id,
      created_at: new Date().toISOString()
    };

    txnData.flagged = true;
    txnData.fraud_indicators = fraud_indicators;
    txnData.risk_score = risk_score;
    txnData.confidence_level = confidence_level;
    txnData.recommended_action = recommended_action;
    txnData.flag_notes = notes;
    txnData.flag_timestamp = new Date().toISOString();
    txnData.updated_at = new Date().toISOString();

    await HandlerUtils.saveToStorage(db, 'transactions', txnData);

    // Update account risk if needed
    if (risk_score > 70) {
      await updateAccountRiskFromTransaction(db, account_id, risk_score, fraud_indicators);
    }

    const result = {
      success: true,
      transaction_id,
      flag_id: HandlerUtils.generateId('FLAG'),
      status: 'flagged',
      flag_timestamp: txnData.flag_timestamp,
      risk_assessment: {
        score: risk_score,
        level: getRiskLevel(risk_score),
        confidence: confidence_level,
        indicators: fraud_indicators
      },
      recommended_action,
      review_priority: getReviewPriority(risk_score, confidence_level),
      estimated_review_time: getEstimatedReviewTime(confidence_level, recommended_action)
    };

    return result;

  } catch (error) {
    throw new Error(`Failed to flag transaction ${transaction_id}: ${error.message}`);
  }
}

/**
 * Update account risk based on transaction
 */
async function updateAccountRiskFromTransaction(db, accountId, riskScore, indicators) {
  try {
    let accountData = await HandlerUtils.getFromStorage(db, 'accounts', accountId) || {
      account_id: accountId,
      created_at: new Date().toISOString()
    };

    // Increase monitoring if high risk transaction
    if (riskScore > 80) {
      accountData.monitoring_level = 'intensive';
    } else if (riskScore > 60) {
      accountData.monitoring_level = 'enhanced';
    }

    accountData.last_high_risk_transaction = new Date().toISOString();
    accountData.recent_risk_indicators = indicators;
    accountData.updated_at = new Date().toISOString();

    await HandlerUtils.saveToStorage(db, 'accounts', accountData);
  } catch (error) {
    // Log error but don't fail the main operation
    console.warn(`Failed to update account risk for ${accountId}:`, error);
  }
}

/**
 * Get risk level from score
 */
function getRiskLevel(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * Get review priority based on risk score and confidence
 */
function getReviewPriority(riskScore, confidence) {
  if (riskScore >= 80 && confidence === 'high') return 'urgent';
  if (riskScore >= 60 && confidence !== 'low') return 'high';
  if (riskScore >= 40) return 'medium';
  return 'low';
}

/**
 * Get estimated review time
 */
function getEstimatedReviewTime(confidence, action) {
  const times = {
    high: { monitor: '24 hours', review: '4 hours', block: '1 hour', verify_with_customer: '2 hours' },
    medium: { monitor: '48 hours', review: '8 hours', block: '2 hours', verify_with_customer: '4 hours' },
    low: { monitor: '72 hours', review: '24 hours', block: '4 hours', verify_with_customer: '8 hours' }
  };
  return times[confidence]?.[action] || '24 hours';
}
