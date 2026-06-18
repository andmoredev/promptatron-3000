/**
 * Get Expense Data Tool
 * Retrieves expense report data by expense ID from seed data
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

export async function getExpenseData(params) {
  const { expense_id, meta } = params;

  if (!expense_id) {
    return {
      success: false,
      error: 'Missing required parameter: expense_id'
    };
  }

  // Validate expense ID format
  const expenseIdPattern = /^EXP-\d{4}-\d{3}$/;
  if (!expenseIdPattern.test(expense_id)) {
    return {
      success: false,
      error: `Invalid expense ID format: ${expense_id}. Expected format: EXP-YYYY-NNN`
    };
  }

  try {
    const data = await loadSeedData();
    const expenseData = data.expenses[expense_id];

    if (!expenseData) {
      return {
        success: false,
        error: `Expense report ${expense_id} not found`,
        available_expenses: Object.keys(data.expenses)
      };
    }

    return {
      success: true,
      expense_id,
      data: expenseData,
      retrieved_at: new Date().toISOString(),
      meta: {
        request_id: meta?.request_id || `req_${Date.now()}`,
        etag: `"${Date.now()}-${expense_id}"`,
        cache_control: 'max-age=300'
      }
    };

  } catch (error) {
    return {
      success: false,
      error: `Failed to retrieve expense data: ${error.message}`
    };
  }
}