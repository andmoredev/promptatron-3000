/**
 * Receipt Validation Tool
 * Validates receipt data against submitted expense amounts to detect OCR mismatches
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

export async function validateReceiptData(params) {
  const { expense_id, submitted_amount, receipt_data } = params;

  if (!expense_id) {
    return {
      success: false,
      error: 'Missing required parameter: expense_id'
    };
  }

  try {
    const data = await loadSeedData();
    const expenseData = data.expenses[expense_id];

    if (!expenseData) {
      return {
        success: false,
        error: `Expense report ${expense_id} not found`
      };
    }

    // Use data from seed file if not provided in params
    const actualSubmittedAmount = submitted_amount !== undefined ? submitted_amount : expenseData.expense.amount;
    const actualReceiptData = receipt_data || expenseData.receipt;

    const validation_results = {
      expense_id,
      submitted_amount: actualSubmittedAmount,
      receipt_data: actualReceiptData,
      validation_status: 'PASSED',
      discrepancies: [],
      warnings: [],
      recommendations: []
    };

    // Check if receipt data is available
    if (!actualReceiptData || (!actualReceiptData.total && !actualReceiptData.tax && !actualReceiptData.tip)) {
      validation_results.warnings.push('No receipt data available for validation');
      validation_results.validation_status = 'WARNING';
      validation_results.recommendations.push('Request receipt upload for verification');
      return { success: true, ...validation_results };
    }

    // Calculate expected total from receipt components
    let calculated_total = actualReceiptData.total || 0;
    if (!calculated_total && (actualReceiptData.subtotal || actualReceiptData.tax || actualReceiptData.tip)) {
      calculated_total = (actualReceiptData.subtotal || 0) + (actualReceiptData.tax || 0) + (actualReceiptData.tip || 0);
    }

    // Check for amount discrepancies
    const amount_difference = Math.abs(actualSubmittedAmount - calculated_total);
    const percentage_difference = calculated_total > 0 ? (amount_difference / calculated_total) * 100 : 0;

    if (amount_difference > 0.01) { // Allow for minor rounding differences
      if (percentage_difference > 50) {
        validation_results.validation_status = 'FAILED';
        validation_results.discrepancies.push({
          type: 'MAJOR_AMOUNT_MISMATCH',
          severity: 'HIGH',
          description: `Submitted amount $${actualSubmittedAmount} differs significantly from receipt total $${calculated_total}`,
          difference: amount_difference,
          percentage_difference: percentage_difference.toFixed(1)
        });
      } else if (percentage_difference > 10) {
        validation_results.validation_status = 'WARNING';
        validation_results.discrepancies.push({
          type: 'MODERATE_AMOUNT_MISMATCH',
          severity: 'MEDIUM',
          description: `Submitted amount $${actualSubmittedAmount} differs from receipt total $${calculated_total}`,
          difference: amount_difference,
          percentage_difference: percentage_difference.toFixed(1)
        });
      } else if (amount_difference > 1.00) {
        validation_results.warnings.push({
          type: 'MINOR_AMOUNT_DIFFERENCE',
          severity: 'LOW',
          description: `Small difference between submitted ($${actualSubmittedAmount}) and receipt ($${calculated_total}) amounts`,
          difference: amount_difference
        });
      }
    }

    // Check for suspicious patterns
    if (actualSubmittedAmount > calculated_total && amount_difference > 5) {
      validation_results.discrepancies.push({
        type: 'INFLATED_AMOUNT',
        severity: 'HIGH',
        description: 'Submitted amount is higher than receipt total - possible fraud indicator',
        submitted: actualSubmittedAmount,
        receipt_total: calculated_total,
        inflation: amount_difference
      });
      validation_results.validation_status = 'FAILED';
    }

    // Validate individual components if available
    if (actualReceiptData.tax !== undefined) {
      const expected_tax_rate = 0.08; // 8% typical tax rate
      const expected_tax = (actualReceiptData.total - (actualReceiptData.tax || 0) - (actualReceiptData.tip || 0)) * expected_tax_rate;
      if (Math.abs(actualReceiptData.tax - expected_tax) > expected_tax * 0.5) {
        validation_results.warnings.push({
          type: 'UNUSUAL_TAX_AMOUNT',
          description: `Tax amount $${actualReceiptData.tax} seems unusual for total $${actualReceiptData.total}`,
          expected_range: `$${(expected_tax * 0.5).toFixed(2)} - $${(expected_tax * 1.5).toFixed(2)}`
        });
      }
    }

    // Check tip reasonableness for meal expenses
    if (actualReceiptData.tip !== undefined && actualReceiptData.tip > 0) {
      const tip_percentage = (actualReceiptData.tip / (calculated_total - actualReceiptData.tip)) * 100;
      if (tip_percentage > 25) {
        validation_results.warnings.push({
          type: 'EXCESSIVE_TIP',
          description: `Tip of ${tip_percentage.toFixed(1)}% seems excessive`,
          tip_amount: actualReceiptData.tip,
          tip_percentage: tip_percentage.toFixed(1)
        });
      }
    }

    // Date validation if available
    if (actualReceiptData.date) {
      const receipt_date = new Date(actualReceiptData.date);
      const today = new Date();
      const days_old = Math.floor((today - receipt_date) / (1000 * 60 * 60 * 24));

      if (days_old > 90) {
        validation_results.warnings.push({
          type: 'OLD_RECEIPT',
          description: `Receipt is ${days_old} days old - may be outside policy window`,
          receipt_date: actualReceiptData.date,
          days_old
        });
      }
    }

    // Generate recommendations based on findings
    if (validation_results.discrepancies.length > 0) {
      validation_results.recommendations.push('Request clarification from employee about amount discrepancy');
      validation_results.recommendations.push('Review original receipt image for OCR accuracy');
    }

    if (validation_results.warnings.length > 0) {
      validation_results.recommendations.push('Flag for manual review due to validation warnings');
    }

    if (validation_results.validation_status === 'PASSED') {
      validation_results.recommendations.push('Receipt validation passed - proceed with policy compliance check');
    }

    return {
      success: true,
      ...validation_results
    };

  } catch (error) {
    return {
      success: false,
      error: `Failed to validate receipt data: ${error.message}`
    };
  }
}