# TokenCostDisplay Component

A reusable React component for disying token usage and cost information in the Bedrock LLM Analyzer application.

## Overview

The TokenCostDisplay component provides a consistent way to display token usage statistics and optional cost estimates across the application. It supports both compact and full display modes, handles estimated vs exact values, and includes comprehensive error handling.

## Features

- **Token Display**: Shows input, output, tool, and total token counts
- **Cost Integration**: Optional cost breakdown with currency formatting
- **Visual Indicators**: Clear indicators for estimated vs exact values
- **Responsive Design**: Works in both compact and full display modes
- **Accessibility**: Includes tooltips and proper ARIA labels
- **Error Handling**: Gracefully handles missing or incomplete data
- **Internationalization**: Supports locale-specific number and currency formatting

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `usage` | `Object` | `null` | Usage data containing token counts and optional cost information |
| `showCost` | `boolean` | `false` | Whether to display cost information |
| `compact` | `boolean` | `false` | Whether to use compact display mode |

### Usage Object Structure

```javascript
{
  // Token counts (required)
  input_tokens: number,
  output_tokens: number,
  total_tokens: number,

  // Optional token fields
  tool_tokens?: number,

  // Token metadata
  tokens_source: 'api' | 'estimated',
  estimation_method?: string,

  // Optional cost information
  cost?: {
    input_cost: number,
    output_cost: number,
    tool_cost?: number,
    total_cost: number,
    currency: string,
    pricing_date: string,
    is_estimated: boolean
  }
}
```

## Usage Examples

### Basic Usage (Tokens Only)

```jsx
import TokenCostDisplay from './components/TokenCostDisplay';

const usage = {
  input_tokens: 100,
  output_tokens: 50,
  total_tokens: 150,
  tokens_source: 'api'
};

<TokenCostDisplay usage={usage} showCost={false} />
```

### With Cost Information

```jsx
const usageWithCost = {
  input_tokens: 100,
  output_tokens: 50,
  total_tokens: 150,
  tokens_source: 'estimated',
  estimation_method: 'tiktoken',
  cost: {
    input_cost: 0.0003,
    output_cost: 0.0015,
    total_cost: 0.0018,
    currency: 'USD',
    pricing_date: '2025-01-15T00:00:00Z',
    is_estimated: true
  }
};

<TokenCostDisplay usage={usageWithCost} showCost={true} />
```

### Compact Mode

```jsx
<TokenCostDisplay
  usage={usage}
  showCost={true}
  compact={true}
/>
```

### With Tool Tokens

```jsx
const usageWithTools = {
  input_tokens: 100,
  output_tokens: 50,
  tool_tokens: 25,
  total_tokens: 175,
  tokens_source: 'api',
  cost: {
    input_cost: 0.0003,
    output_cost: 0.0015,
    tool_cost: 0.0001,
    total_cost: 0.0019,
    currency: 'USD',
    is_estimated: false
  }
};

<TokenCostDisplay usage={usageWithTools} showCost={true} />
```

## Display Modes

### Full Mode (default)

- Displays token and cost information in a grid layout
- Shows detailed breakdown with visual indicators
- Includes help tooltips and estimation notices
- Displays cost disclaimer when cost information is shown

### Compact Mode

- Single-line display suitable for lists or summaries
- Shows only total tokens and total cost
- Includes basic estimation indicators
- Ideal for use in History or Comparison components

## Visual Indicators

### Token Source Indicators

- **Green checkmark**: Exact values from API
- **Orange warning**: Estimated values
- **"Estimated" badge**: Clearly marks estimated data

### Cost Indicators

- **"Estimated" badge**: Marks estimated cost calculations
- **Currency formatting**: Proper currency display with appropriate decimal places
- **Cost disclaimer**: Explains estimation limitations

## Styling

The component uses Tailwind CSS classes and follows the application's design system:

- **Colors**: Uses the established color palette (blue for input, green for output, etc.)
- **Typography**: Consistent font sizes and weights
- **Spacing**: Follows the application's spacing patterns
- **Responsive**: Adapts to different screen sizes

## Accessibility

- **ARIA labels**: Proper labeling for screen readers
- **Tooltips**: Contextual help information
- **Keyboard navigation**: Full keyboard accessibility
- **Color contrast**: Meets WCAG guidelines
- **Screen reader support**: Descriptive text for all visual elements

## Error Handling

The component gracefully handles various error conditions:

- **Null/undefined usage**: Returns null (renders nothing)
- **Missing token values**: Shows "N/A" for unavailable data
- **Incomplete cost data**: Only shows available cost information
- **Invalid numbers**: Handles null/undefined values safely

## Integration

### TestResults Component

Replace existing token display:

```jsx
// Before
{displayResults.usage && (
  // Individual token displays...
)}

// After
{displayResults.usage && (
  <TokenCostDisplay
    usage={displayResults.usage}
    showCost={showCostEstimates}
    compact={false}
  />
)}
```

### History Component

Use compact mode for list items:

```jsx
<TokenCostDisplay
  usage={result.usage}
  showCost={showCostEstimates}
  compact={true}
/>
```

### Comparison Component

Show side-by-side comparisons:

```jsx
<div className="grid grid-cols-2 gap-4">
  <TokenCostDisplay usage={resultA.usage} showCost={true} />
  <TokenCostDisplay usage={resultB.usage} showCost={true} />
</div>
```

## Dependencies

- **React**: ^19.0.0
- **PropTypes**: ^15.8.1
- **HelpTooltip**: Internal component for contextual help

## Browser Support

- Modern browsers with ES2020+ support
- Supports Intl.NumberFormat for currency formatting
- Graceful degradation for older browsers

## Performance

- **Lightweight**: Minimal bundle impact
- **Memoization**: Consider wrapping with React.memo for frequently updated lists
- **Efficient rendering**: Only renders necessary elements based on available data

## Testing

The component includes comprehensive tests covering:

- Basic rendering with different prop combinations
- Edge cases (missing data, null values)
- Visual indicator display
- Cost formatting and display
- Compact vs full mode rendering

Run tests with:
```bash
npm test -- TokenCostDisplay.test.jsx
```

## Contributing

When modifying this component:

1. Maintain backward compatibility
2. Update tests for new features
3. Follow the existing code style
4. Update this documentation
5. Test with various data scenarios

## Related Components

- **HelpTooltip**: Provides contextual help
- **TestResults**: Primary integration point
- **History**: Uses compact mode
- **Comparison**: Uses for side-by-side display
