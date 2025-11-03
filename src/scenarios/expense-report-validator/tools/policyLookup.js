/**
 * Expense Policy Lookup Tool
 * Provides current expense policy limits and rules for validation
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
      // Fallback to hardcoded data
      seedData = {
        policies: {
          business_meal: {
            standard: { dailyLimit: 75, perMealLimit: 50, requiresClient: true },
            manager: { dailyLimit: 100, perMealLimit: 75, requiresClient: false },
            director: { dailyLimit: 150, perMealLimit: 100, requiresClient: false },
            executive: { dailyLimit: 200, perMealLimit: 150, requiresClient: false }
          }
        }
      };
    }
  }
  return seedData;
}

// Geographic multipliers for high-cost areas
const LOCATION_MULTIPLIERS = {
  'New York': 1.3,
  'San Francisco': 1.4,
  'Los Angeles': 1.2,
  'Chicago': 1.1,
  'Boston': 1.2,
  'Washington DC': 1.2,
  'International': 1.5,
  'Default': 1.0
};

export async function lookupExpensePolicy(params) {
  const { category, employee_level = 'standard', location = 'Default' } = params;

  const data = await loadSeedData();
  const policies = data.policies;

  // Validate category
  if (!policies[category]) {
    return {
      success: false,
      error: `Unknown expense category: ${category}`,
      available_categories: Object.keys(policies)
    };
  }

  // Get base policy
  const basePolicy = policies[category][employee_level];
  if (!basePolicy) {
    return {
      success: false,
      error: `No policy found for category ${category} and level ${employee_level}`,
      available_levels: Object.keys(policies[category])
    };
  }

  // Apply location multiplier
  const locationMultiplier = LOCATION_MULTIPLIERS[location] || LOCATION_MULTIPLIERS['Default'];

  // Calculate adjusted limits
  const adjustedPolicy = { ...basePolicy };
  if (adjustedPolicy.dailyLimit) {
    adjustedPolicy.dailyLimit = Math.round(adjustedPolicy.dailyLimit * locationMultiplier);
  }
  if (adjustedPolicy.perMealLimit) {
    adjustedPolicy.perMealLimit = Math.round(adjustedPolicy.perMealLimit * locationMultiplier);
  }
  if (adjustedPolicy.perEventLimit) {
    adjustedPolicy.perEventLimit = Math.round(adjustedPolicy.perEventLimit * locationMultiplier);
  }

  return {
    success: true,
    category,
    employee_level,
    location,
    location_multiplier: locationMultiplier,
    policy: adjustedPolicy,
    base_policy: basePolicy,
    general_rules: {
      weekend_expenses: 'Generally not allowed unless pre-approved for business travel',
      receipt_required: 'Required for all expenses over $25',
      business_justification: 'Required for all expenses',
      approval_required: adjustedPolicy.requiresApproval || false,
      duplicate_prevention: 'System checks for duplicate expenses within 24 hours'
    },
    compliance_notes: [
      'All expenses must have legitimate business purpose',
      'Personal expenses are strictly prohibited',
      'Receipts must match submitted amounts',
      'Weekend and holiday expenses require special justification'
    ]
  };
}