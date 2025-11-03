/**
 * Compliance Check Tool
 * Comprehensive compliance validation for expense reports
 */

// Load seed data
let seedData = null;

async function loadSeedData() {
  if (!seedData) {
    try {
      const response = await fetch('/src/scenarios/expense-report-validator/seed-data.json');
      seedData = await response.json();
    } catch (error) {
      console.error('Failed to load seed data:', error);
      throw new Error('Unable to load expense data');
    }
  }
  return seedData;
}

export async function checkComplianceRules(params) {
  const { expense_id, expense_data, check_types = ['policy_limits', 'fraud_indicators', 'business_justification'] } = params;

  if (!expense_id && (!expense_data || !expense_data.amount || !expense_data.category)) {
    return {
      success: false,
      error: 'Missing required parameters: expense_id OR (expense_data with amount and category)'
    };
  }

  try {
    const data = await loadSeedData();
    let actualExpenseData = expense_data;

    // If expense_id provided, load data from seed
    if (expense_id) {
      const expenseRecord = data.expenses[expense_id];
      if (!expenseRecord) {
        return {
          success: false,
          error: `Expense report ${expense_id} not found`
        };
      }

      actualExpenseData = {
        expense_id: expense_id,
        amount: expenseRecord.expense.amount,
        category: expenseRecord.expense.category,
        date: expenseRecord.expense.date,
        description: expenseRecord.expense.description,
        employee_id: expenseRecord.employee.employeeId,
        employee_level: expenseRecord.employee.level,
        business_justification: expenseRecord.businessJustification,
        location: expenseRecord.expense.location,
        merchant: expenseRecord.expense.merchant
      };
    }

    const compliance_results = {
      expense_id: actualExpenseData.expense_id || expense_id || 'N/A',
      overall_status: 'COMPLIANT',
      checks_performed: check_types,
      violations: [],
      warnings: [],
      recommendations: [],
      risk_score: 0,
      details: {}
    };

    // Policy Limits Check
    if (check_types.includes('policy_limits')) {
      const policy_check = await checkPolicyLimits(actualExpenseData, data);
      compliance_results.details.policy_limits = policy_check;

      if (policy_check.violations.length > 0) {
        compliance_results.violations.push(...policy_check.violations);
        compliance_results.overall_status = 'NON_COMPLIANT';
        compliance_results.risk_score += 30;
      }

      if (policy_check.warnings.length > 0) {
        compliance_results.warnings.push(...policy_check.warnings);
        compliance_results.risk_score += 10;
      }
    }

    // Fraud Indicators Check
    if (check_types.includes('fraud_indicators')) {
      const fraud_check = checkFraudIndicators(actualExpenseData);
      compliance_results.details.fraud_indicators = fraud_check;

      if (fraud_check.high_risk_indicators.length > 0) {
        compliance_results.violations.push(...fraud_check.high_risk_indicators.map(indicator => ({
          type: 'FRAUD_INDICATOR',
          severity: 'HIGH',
          description: indicator.description,
          indicator: indicator.type
        })));
        compliance_results.overall_status = 'NON_COMPLIANT';
        compliance_results.risk_score += 40;
      }

      if (fraud_check.medium_risk_indicators.length > 0) {
        compliance_results.warnings.push(...fraud_check.medium_risk_indicators.map(indicator => ({
          type: 'POTENTIAL_FRAUD',
          severity: 'MEDIUM',
          description: indicator.description,
          indicator: indicator.type
        })));
        compliance_results.risk_score += 20;
      }
    }

    // Business Justification Check
    if (check_types.includes('business_justification')) {
      const justification_check = checkBusinessJustification(actualExpenseData);
      compliance_results.details.business_justification = justification_check;

      if (!justification_check.adequate) {
        compliance_results.violations.push({
          type: 'INADEQUATE_JUSTIFICATION',
          severity: 'MEDIUM',
          description: justification_check.reason,
          required_elements: justification_check.missing_elements
        });
        compliance_results.risk_score += 15;
      }
    }

    // Duplicate Detection Check
    if (check_types.includes('duplicate_detection')) {
      const duplicate_check = checkForDuplicates(actualExpenseData, data);
      compliance_results.details.duplicate_detection = duplicate_check;

      if (duplicate_check.potential_duplicates.length > 0) {
        compliance_results.violations.push({
          type: 'POTENTIAL_DUPLICATE',
          severity: 'HIGH',
          description: 'Potential duplicate expense detected',
          duplicates: duplicate_check.potential_duplicates
        });
        compliance_results.risk_score += 35;
      }
    }

    // Timing Validation Check
    if (check_types.includes('timing_validation')) {
      const timing_check = checkTimingValidation(actualExpenseData);
      compliance_results.details.timing_validation = timing_check;

      if (timing_check.violations.length > 0) {
        compliance_results.violations.push(...timing_check.violations);
        compliance_results.risk_score += 20;
      }

      if (timing_check.warnings.length > 0) {
        compliance_results.warnings.push(...timing_check.warnings);
        compliance_results.risk_score += 5;
      }
    }

    // Determine final status based on risk score
    if (compliance_results.risk_score >= 50) {
      compliance_results.overall_status = 'HIGH_RISK';
    } else if (compliance_results.risk_score >= 25) {
      compliance_results.overall_status = 'MEDIUM_RISK';
    } else if (compliance_results.violations.length > 0) {
      compliance_results.overall_status = 'NON_COMPLIANT';
    } else if (compliance_results.warnings.length > 0) {
      compliance_results.overall_status = 'REVIEW_REQUIRED';
    }

    // Generate recommendations
    generateRecommendations(compliance_results);

    return {
      success: true,
      ...compliance_results
    };

  } catch (error) {
    return {
      success: false,
      error: `Failed to check compliance: ${error.message}`
    };
  }
}

async function checkPolicyLimits(expense_data, seedData) {
  const { amount, category, employee_level = 'standard' } = expense_data;

  const policies = seedData.policies;
  const result = {
    violations: [],
    warnings: [],
    limit_checked: null
  };

  if (policies[category] && policies[category][employee_level]) {
    const policy = policies[category][employee_level];

    // Check per meal limit for business meals
    if (policy.perMealLimit && amount > policy.perMealLimit) {
      result.violations.push({
        type: 'EXCEEDS_POLICY_LIMIT',
        severity: 'HIGH',
        description: `Amount $${amount} exceeds ${category} limit of $${policy.perMealLimit} for ${employee_level} level`,
        amount,
        limit: policy.perMealLimit,
        excess: amount - policy.perMealLimit
      });
      result.limit_checked = policy.perMealLimit;
    } else if (policy.perMealLimit && amount > policy.perMealLimit * 0.8) {
      result.warnings.push({
        type: 'APPROACHING_LIMIT',
        description: `Amount $${amount} is approaching ${category} limit of $${policy.perMealLimit}`,
        utilization: ((amount / policy.perMealLimit) * 100).toFixed(1)
      });
      result.limit_checked = policy.perMealLimit;
    }

    // Check if client is required for business meals
    if (policy.requiresClient && category === 'business_meal') {
      const justification = expense_data.business_justification || expense_data.description || '';
      if (!justification.toLowerCase().includes('client')) {
        result.violations.push({
          type: 'NO_CLIENT_PRESENT',
          severity: 'MEDIUM',
          description: 'Business meal requires client presence but no client mentioned in justification'
        });
      }
    }
  }

  return result;
}

function checkFraudIndicators(expense_data) {
  const { amount, category, date, description, employee_id } = expense_data;

  const result = {
    high_risk_indicators: [],
    medium_risk_indicators: [],
    low_risk_indicators: []
  };

  // Check for round numbers (potential fraud indicator)
  if (amount % 10 === 0 && amount >= 50) {
    result.medium_risk_indicators.push({
      type: 'ROUND_AMOUNT',
      description: `Round dollar amount $${amount} may indicate estimated or fabricated expense`
    });
  }

  // Check for unusually high amounts
  const category_averages = {
    business_meal: 45,
    travel_lodging: 120,
    transportation: 35,
    office_supplies: 25,
    client_entertainment: 85
  };

  const average = category_averages[category] || 50;
  if (amount > average * 3) {
    result.high_risk_indicators.push({
      type: 'UNUSUALLY_HIGH_AMOUNT',
      description: `Amount $${amount} is ${(amount/average).toFixed(1)}x higher than typical ${category} expense`
    });
  }

  // Check for weekend expenses
  if (date) {
    const expense_date = new Date(date);
    const day_of_week = expense_date.getDay();
    if (day_of_week === 0 || day_of_week === 6) { // Sunday or Saturday
      result.medium_risk_indicators.push({
        type: 'WEEKEND_EXPENSE',
        description: 'Expense occurred on weekend - requires business justification'
      });
    }
  }

  // Check for vague descriptions
  if (description && description.length < 20) {
    result.medium_risk_indicators.push({
      type: 'VAGUE_DESCRIPTION',
      description: 'Expense description is too brief - may lack sufficient business justification'
    });
  }

  return result;
}

function checkBusinessJustification(expense_data) {
  const { description, business_justification, category } = expense_data;

  const justification_text = business_justification || description || '';

  const result = {
    adequate: true,
    reason: '',
    missing_elements: [],
    score: 0
  };

  // Check for minimum length
  if (justification_text.length < 15) {
    result.adequate = false;
    result.reason = 'Business justification is too brief';
    result.missing_elements.push('Detailed explanation of business purpose');
  }

  // Check for business-related keywords
  const business_keywords = ['client', 'meeting', 'project', 'business', 'work', 'conference', 'training', 'team'];
  const has_business_context = business_keywords.some(keyword =>
    justification_text.toLowerCase().includes(keyword)
  );

  if (!has_business_context) {
    result.adequate = false;
    result.reason = 'Justification lacks clear business context';
    result.missing_elements.push('Clear business purpose or context');
  }

  // Category-specific requirements
  if (category === 'client_entertainment' && !justification_text.toLowerCase().includes('client')) {
    result.adequate = false;
    result.reason = 'Client entertainment requires client identification';
    result.missing_elements.push('Client name or company');
  }

  return result;
}

function checkForDuplicates(expense_data, seedData) {
  const { amount, date, merchant, employee_id } = expense_data;

  const result = {
    potential_duplicates: [],
    confidence_scores: []
  };

  // Check against other expenses in seed data
  Object.entries(seedData.expenses).forEach(([expenseId, expenseRecord]) => {
    if (expenseRecord.employee.employeeId === employee_id &&
        expenseRecord.expense.amount === amount &&
        expenseRecord.expense.date === date &&
        expenseRecord.expense.merchant === merchant) {

      result.potential_duplicates.push({
        expense_id: expenseId,
        amount: expenseRecord.expense.amount,
        date: expenseRecord.expense.date,
        merchant: expenseRecord.expense.merchant,
        confidence: 95,
        reason: 'Identical amount, date, and merchant'
      });
    }
  });

  return result;
}

function checkTimingValidation(expense_data) {
  const { date, category } = expense_data;

  const result = {
    violations: [],
    warnings: []
  };

  if (date) {
    const expense_date = new Date(date);
    const today = new Date();
    const days_ago = Math.floor((today - expense_date) / (1000 * 60 * 60 * 24));

    // Check for very old expenses
    if (days_ago > 90) {
      result.violations.push({
        type: 'EXPENSE_TOO_OLD',
        severity: 'MEDIUM',
        description: `Expense is ${days_ago} days old - exceeds 90-day policy window`,
        days_old: days_ago
      });
    } else if (days_ago > 30) {
      result.warnings.push({
        type: 'OLD_EXPENSE',
        description: `Expense is ${days_ago} days old - approaching policy limit`,
        days_old: days_ago
      });
    }

    // Check for future dates
    if (expense_date > today) {
      result.violations.push({
        type: 'FUTURE_DATE',
        severity: 'HIGH',
        description: 'Expense date is in the future',
        expense_date: date
      });
    }
  }

  return result;
}

function generateRecommendations(compliance_results) {
  const { overall_status, violations, warnings, risk_score } = compliance_results;

  if (overall_status === 'NON_COMPLIANT' || overall_status === 'HIGH_RISK') {
    compliance_results.recommendations.push('REJECT expense report due to policy violations or high fraud risk');
    compliance_results.recommendations.push('Request additional documentation and justification from employee');
  } else if (overall_status === 'MEDIUM_RISK' || overall_status === 'REVIEW_REQUIRED') {
    compliance_results.recommendations.push('FLAG for manual review by finance team');
    compliance_results.recommendations.push('Request clarification on flagged items before approval');
  } else {
    compliance_results.recommendations.push('APPROVE expense report - all compliance checks passed');
  }

  // Specific recommendations based on violation types
  const violation_types = violations.map(v => v.type);

  if (violation_types.includes('EXCEEDS_POLICY_LIMIT')) {
    compliance_results.recommendations.push('Verify if expense qualifies for exception approval');
  }

  if (violation_types.includes('FRAUD_INDICATOR')) {
    compliance_results.recommendations.push('Escalate to fraud investigation team');
  }

  if (violation_types.includes('POTENTIAL_DUPLICATE')) {
    compliance_results.recommendations.push('Check for duplicate submissions in expense system');
  }
}