import React, { useState } from 'react';
import TokenCostDisplay from './TokenCostDisplay';

/**
 * Demo component to showcase TokenCostDisplay functionality
 * This file demonstrates different usage scenarios for the TokenCostDisplay component
 */
function TokenCostDisplayDemo() {
  const [showCost, setShowCost] = useState(true);
  const [compact, setCompact] = useState(false);

  // Example usage data with API-provided tokens (exact)
  const exactUsage = {
    input_tokens: 1250,
    output_tokens: 750,
    tool_tokens: 125,
    total_tokens: 2125,
    tokens_source: '


  // Example usage data with estimated tokens and cost information
  const estimatedUsageWithCost = {
    input_tokens: 980,
    output_tokens: 420,
    tool_tokens: 85,
    total_tokens: 1485,
    tokens_source: 'estimated',
    estimation_method: 'tiktoken (cl100k_base)',
    cost: {
      input_cost: 0.00294,
      output_cost: 0.0063,
      tool_cost: 0.000255,
      total_cost: 0.009195,
      currency: 'USD',
      pricing_date: '2025-01-15T00:00:00Z',
      is_estimated: true
    }
  };

  // Example with minimal data (no tool tokens)
  const minimalUsage = {
    input_tokens: 150,
    output_tokens: 75,
    total_tokens: 225,
    tokens_source: 'api'
  };

  // Example with missing input tokens (edge case)
  const incompleteUsage = {
    input_tokens: null,
    output_tokens: 320,
    total_tokens: 320,
    tokens_source: 'estimated',
    estimation_method: 'fallback estimation'
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">TokenCostDisplay Component Demo</h1>
        <p className="text-gray-600">
          This demo showcases the TokenCostDisplay component in various configurations
        </p>
      </div>

      {/* Controls */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h2 className="text-lg font-semibold mb-3">Demo Controls</h2>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={showCost}
              onChange={(e) => setShowCost(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span>Show Cost Information</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={compact}
              onChange={(e) => setCompact(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span>Compact Mode</span>
          </label>
        </div>
      </div>

      {/* Example 1: Exact tokens with cost */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Example 1: API-Provided Tokens with Cost</h2>
        <p className="text-gray-600 mb-4">
          This example shows exact token counts from the API with cost calculation enabled.
        </p>
        <TokenCostDisplay
          usage={{
            ...exactUsage,
            ...(showCost && {
              cost: {
                input_cost: 0.00375,
                output_cost: 0.01125,
                tool_cost: 0.000375,
                total_cost: 0.0154,
                currency: 'USD',
                pricing_date: '2025-01-15T00:00:00Z',
                is_estimated: false
              }
            })
          }}
          showCost={showCost}
          compact={compact}
        />
      </div>

      {/* Example 2: Estimated tokens with cost */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Example 2: Estimated Tokens with Cost</h2>
        <p className="text-gray-600 mb-4">
          This example shows estimated token counts with cost estimates and visual indicators.
        </p>
        <TokenCostDisplay
          usage={showCost ? estimatedUsageWithCost : {
            ...estimatedUsageWithCost,
            cost: undefined
          }}
          showCost={showCost}
          compact={compact}
        />
      </div>

      {/* Example 3: Minimal usage (no tools) */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Example 3: Basic Usage (No Tool Tokens)</h2>
        <p className="text-gray-600 mb-4">
          This example shows a simple request without tool usage.
        </p>
        <TokenCostDisplay
          usage={{
            ...minimalUsage,
            ...(showCost && {
              cost: {
                input_cost: 0.00045,
                output_cost: 0.001125,
                total_cost: 0.001575,
                currency: 'USD',
                pricing_date: '2025-01-15T00:00:00Z',
                is_estimated: true
              }
            })
          }}
          showCost={showCost}
          compact={compact}
        />
      </div>

      {/* Example 4: Edge case - incomplete data */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Example 4: Edge Case - Missing Input Tokens</h2>
        <p className="text-gray-600 mb-4">
          This example shows how the component handles missing token data gracefully.
        </p>
        <TokenCostDisplay
          usage={incompleteUsage}
          showCost={showCost}
          compact={compact}
        />
      </div>

      {/* Example 5: No usage data */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Example 5: No Usage Data</h2>
        <p className="text-gray-600 mb-4">
          This example shows what happens when no usage data is provided (component should not render).
        </p>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-500">
          <TokenCostDisplay usage={null} showCost={showCost} compact={compact} />
          <p className="text-sm">Component renders nothing when usage is null</p>
        </div>
      </div>

      {/* Usage Examples */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Usage Examples</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Basic Usage (Tokens Only)</h3>
            <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
{`<TokenCostDisplay
  usage={{
    input_tokens: 100,
    output_tokens: 50,
    total_tokens: 150,
    tokens_source: 'api'
  }}
  showCost={false}
/>`}
            </pre>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">With Cost Information</h3>
            <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
{`<TokenCostDisplay
  usage={{
    input_tokens: 100,
    output_tokens: 50,
    total_tokens: 150,
    tokens_source: 'estimated',
    cost: {
      input_cost: 0.0003,
      output_cost: 0.0015,
      total_cost: 0.0018,
      currency: 'USD',
      is_estimated: true
    }
  }}
  showCost={true}
/>`}
            </pre>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">Compact Mode</h3>
            <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
{`<TokenCostDisplay
  usage={usageData}
  showCost={true}
  compact={true}
/>`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TokenCostDisplayDemo;
