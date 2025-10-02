# Cost Comparison Features

This document describes the enhanced cost comparison functionality added to the Comparison component.

## Overview

The Comparison component now includes comprehensive cost tracking and comparison capabilities when cost estimates are enabled in user settings. This allows users to compare not just response quality but also the financial efficiency of different AI models.

## Features

### 1. Cost Comparison Summary

When comparing two tests with cost data, a dedicated cost comparison section displays:

- **Cost Difference**: Absolute and percentage difference between tests
- **Winner Identification**: Which test is more cost-effective
- **Visual Indicators**: Color-coded comparison with trophy icons
- **Cost Insights**: Intelligent analysis of cost trade-offs

### 2. Enhanced Compare Modes

A new "Costs" compare mode is available when cost estimates are enabled:

- **Costs Mode**: Shows detailed cost breakdowns using TokenCostDisplay
- **All Mode**: Includes cost information alongside existing content
- **Metadata Mode**: Shows compact cost information in test metadata

### 3. Cost-Aware Export

The export functionality now includes cost data when enabled:

```javascript
const exportData = exportComparisonData(selectedTests, includeCostData);
```

Export includes:
- Individual test cost breakdowns
- Comparison metrics with cost analysis
- Cost difference calculations
- Economic efficiency insights

### 4. Visual Cost Indicators

- **Cost badges**: Show whether tests have cost data available
- **Winner indicators**: Trophy icons for more cost-effective tests
- **Estimation markers**: Indicate when costs are estimated vs. exact
- **Difference highlighting**: Clear display of cost variations

## Usage Examples

### Basic Cost Comparison

```jsx
import Comparison from './components/Comparison';
import { useCostSettings } from './hooks/useSettings';

function MyComponent() {
  const { showCostEstimates } = useCostSettings();

  return (
    <Comparison
      selectedTests={testsWithCostData}
      onRemoveTest={handleRemoveTest}
      onClearComparison={handleClearComparison}
    />
  );
}
```

### Export with Cost Data

```javascript
import { exportComparisonData } from './components/Comparison';

const handleExport = () => {
  const exportData = exportComparisonData(selectedTests, true);

  // Access cost comparison metrics
  if (exportData.comparisonMetrics?.costComparison) {
    const { costComparison } = exportData.comparisonMetrics;
    console.log(`Cost difference: ${costComparison.costDifferencePercent.toFixed(1)}%`);
    console.log(`More economical: ${costComparison.moreEconomical}`);
  }
};
```

## Cost Comparison Logic

### Cost Difference Calculation

```javascript
const costDifference = cost2 - cost1;
const costDifferencePercent = cost1 > 0 ? (costDifference / cost1) * 100 : 0;
const winner = cost1 < cost2 ? 'test1' : cost2 < cost1 ? 'test2' : 'tie';
```

### Comparison Insights

The system provides intelligent insights based on cost analysis:

- **Identical costs**: When both tests have the same cost
- **Significant differences**: When one test is substantially more expensive
- **Missing data**: When only one test has cost information
- **No data**: When neither test has cost information

## Integration with Settings

Cost comparison features are automatically enabled/disabled based on user settings:

```javascript
const { showCostEstimates } = useCostSettings();

// Cost features only appear when showCostEstimates is true
{showCostEstimates && (
  <CostComparisonSection />
)}
```

## Data Structure

### Enhanced Usage Data

```javascript
interface EnhancedUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  tokens_source: 'api' | 'estimated';
  cost?: {
    input_cost: number;
    output_cost: number;
    total_cost: number;
    currency: string;
    is_estimated: boolean;
    pricing_date: string;
  };
}
```

### Cost Comparison Result

```javascript
interface CostComparison {
  test1: {
    hasCost: boolean;
    totalCost: number | null;
    currency: string;
  };
  test2: {
    hasCost: boolean;
    totalCost: number | null;
    currency: string;
  };
  costDifference: number | null;
  costDifferencePercent: number | null;
  winner: 'test1' | 'test2' | 'tie' | null;
  bothHaveCosts: boolean;
}
```

## Error Handling

The component gracefully handles various scenarios:

- **Missing cost data**: Shows "No Cost Data" indicators
- **Partial cost data**: Warns when only one test has costs
- **Currency mismatches**: Uses first test's currency for calculations
- **Invalid cost values**: Treats null/undefined as unavailable

## Performance Considerations

- Cost calculations are only performed when cost display is enabled
- Export functions are optimized to avoid unnecessary data processing
- Cost comparison logic is memoized to prevent recalculation on re-renders

## Accessibility

- All cost indicators include appropriate ARIA labels
- Color coding is supplemented with text and icons
- Screen readers receive meaningful cost comparison descriptions
- Keyboard navigation works for all cost-related controls

## Testing

The component includes comprehensive tests for cost functionality:

- Cost comparison calculations
- Export data structure validation
- UI rendering with/without cost data
- Settings integration testing
- Error handling scenarios

See `Comparison.cost.test.jsx` for detailed test cases.
