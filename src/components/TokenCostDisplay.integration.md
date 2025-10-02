# TokenCostDisplay Integration Guide

This document shows how to integrate the TokenCostDisplay component into existing components like TestResults.

## Current Implementation in TestResults.jsx

The current token display in TestResults.jsx (around lines 880-910) looks like this:

```jsx
{displayResults.usage && (
  <>
    {displayResults.usage.input_tokens && (
      <div className="text-center">
        <div className="text-lg font-semibold text-blue-600">
          {displayResults.usage.input_tokens.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500">Input Tokens</div>
      </div>
    )}
    {displayResults.usage.output_tokens && (
      <div className="text-center">
        <div className="text-lg font-semibold text-green-600">
          {displayResults.usage.output_tokens.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500">Output Tokens</div>
      </div>
    )}
    {displayResults.usage.total_tokens && (
      <div className="text-center">
        <div className="text-lg font-semibold text-purple-600">
          {displayResults.usage.total_tokens.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500">Total Tokens</div>
      </div>
    )}
  </>
)}
```

## Replacement with TokenCostDisplay

### Step 1: Import the Component

Add the import at the top of TestResults.jsx:

```jsx
import TokenCostDisplay from './TokenCostDisplay';
```

### Step 2: Replace the Token Display Section

Replace the existing token display code with:

```jsx
{displayResults.usage && (
  <div className="col-span-full">
    <TokenCostDisplay
      usage={displayResults.usage}
      showCost={showCostEstimates} // This would come from settings
      compact={false}
    />
  </div>
)}
```

### Step 3: Add Cost Settings Support

You'll need to get the cost display setting from the settings service. Add this to the component:

```jsx
import { useCostSettings } from '../hooks/useSettings'; // When implemented

// In the component:
const { settings: costSettings } = useCostSettings();
const showCostEstimates = costSettings?.showCostEstimates || false;
```

## Integration in Other Components

### History Component

In the History component, you can use the compact mode:

```jsx
<TokenCostDisplay
  usage={result.usage}
  showCost={showCostEstimates}
  compact={true}
/>
```

### Comparison Component

In the Comparison component, you can show both results side by side:

```jsx
<div className="grid grid-cols-2 gap-4">
  <div>
    <h4 className="font-medium mb-2">Result A</h4>
    <TokenCostDisplay
      usage={resultA.usage}
      showCost={showCostEstimates}
      compact={false}
    />
  </div>
  <div>
    <h4 className="font-medium mb-2">Result B</h4>
    <TokenCostDisplay
      usage={resultB.usage}
      showCost={showCostEstimates}
      compact={false}
    />
  </div>
</div>
```

## Expected Usage Data Structure

The component expects usage data in this format:

```javascript
const usage = {
  // Required token fields
  input_tokens: 100,
  output_tokens: 50,
  total_tokens: 150,

  // Optional token fields
  tool_tokens: 25, // Only if tools were used

  // Token metadata
  tokens_source: 'api', // 'api' or 'estimated'
  estimation_method: 'tiktoken', // Only if estimated

  // Optional cost information (only when cost display is enabled)
  cost: {
    input_cost: 0.0003,
    output_cost: 0.0015,
    tool_cost: 0.0001, // Only if tools were used
    total_cost: 0.0019,
    currency: 'USD',
    pricing_date: '2025-01-15T00:00:00Z',
    is_estimated: true
  }
};
```

## Benefits of the New Component

1. **Consistent Display**: All token and cost information is displayed consistently across the application
2. **Visual Indicators**: Clear indicators for estimated vs exact values
3. **Cost Integration**: Seamless integration of cost information when enabled
4. **Responsive Design**: Works well in both compact and full display modes
5. **Accessibility**: Includes proper tooltips and help information
6. **Error Handling**: Gracefully handles missing or incomplete data

## Migration Checklist

- [ ] Import TokenCostDisplay component
- [ ] Replace existing token display code
- [ ] Add cost settings integration
- [ ] Test with different usage data scenarios
- [ ] Verify responsive design works correctly
- [ ] Test accessibility features
- [ ] Update any related tests
