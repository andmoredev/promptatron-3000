import React from 'react';
import { render, screen } from '@testing-library/react';
import TestResults from '../TestResults';

// Mock the hooks
jest.mock('../../hooks/useSettings', () => ({
  useDeterminismSettings: () => ({ settings: {} }),
  useCostSettings: () => ({
    settings: { showCostEstimates: true }
  })
}));

jest.mock('../../hooks/useModelOutput', () => ({
  useModelOutput: () => ({
    outputState: {},
    isDisplaying: false,
    hasError: false,
    handleDisplayError: jest.fn(),
    restoreState: jest.fn(),
    getCurrentOutput: jest.fn()
  })
}));

describe('TestResults Token and Cost Display Integration', () => {
  const mockResults = {
    id: 'test-1',
    modelId: 'claude-3-sonnet',
    systemPrompt: 'You are a helpful assistant',
    userPrompt: 'Hello world',
    response: 'Hello! How can I help you today?',
    timestamp: new Date().toISOString(),
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      tokens_source: 'api',
      cost: {
        input_cost: 0.0003,
        output_cost: 0.00075,
        total_cost: 0.00105,
        currency: 'USD',
        is_estimated: false,
        pricing_date: '2025-01-15'
      }
    }
  };

  test('displays enhanced token and cost information', () => {
    render(
      <TestResults
        results={mockResults}
        isLoading={false}
        determinismEnabled={false}
      />
    );

    // Check that TokenCostDisplay is rendered
    expect(screen.getByText('Token Usage')).toBeInTheDocument();
    expect(screen.getByText('Cost Breakdown')).toBeInTheDocument();

    // Check token values
    expect(screen.getByText('100')).toBeInTheDocument(); // Input tokens
    expect(screen.getByText('50')).toBeInTheDocument();  // Output tokens
    expect(screen.getByText('150')).toBeInTheDocument(); // Total tokens

    // Check cost values
    expect(screen.getByText('$0.000300')).toBeInTheDocument(); // Input cost
    expect(screen.getByText('$0.000750')).toBeInTheDocument(); // Output cost
    expect(screen.getByText('$0.001050')).toBeInTheDocument(); // Total cost
  });

  test('displays compact token display in stats section', () => {
    render(
      <TestResults
        results={mockResults}
        isLoading={false}
        determinismEnabled={false}
      />
    );

    // Check that compact token display shows in stats
    const tokenElements = screen.getAllByText('150');
    expect(tokenElements.length).toBeGreaterThan(0);

    // Check for compact cost display
    const costElements = screen.getAllByText('$0.001050');
    expect(costElements.length).toBeGreaterThan(0);
  });

  test('handles estimated tokens correctly', () => {
    const estimatedResults = {
      ...mockResults,
      usage: {
        ...mockResults.usage,
        tokens_source: 'estimated',
        estimation_method: 'tiktoken'
      }
    };

    render(
      <TestResults
        results={estimatedResults}
        isLoading={false}
        determinismEnabled={false}
      />
    );

    // Check for estimation indicators
    expect(screen.getByText('Estimated')).toBeInTheDocument();
  });

  test('handles missing usage data gracefully', () => {
    const noUsageResults = {
      ...mockResults,
      usage: null
    };

    render(
      <TestResults
        results={noUsageResults}
        isLoading={false}
        determinismEnabled={false}
      />
    );

    // Should show fallback estimated tokens
    expect(screen.getByText('Est. Tokens')).toBeInTheDocument();
  });

  test('respects cost display setting', () => {
    // Mock cost display disabled
    jest.doMock('../../hooks/useSettings', () => ({
      useDeterminismSettings: () => ({ settings: {} }),
      useCostSettings: () => ({
        settings: { showCostEstimates: false }
      })
    }));

    const TestResultsWithDisabledCost = require('../TestResults').default;

    render(
      <TestResultsWithDisabledCost
        results={mockResults}
        isLoading={false}
        determinismEnabled={false}
      />
    );

    // Cost information should not be displayed
    expect(screen.queryByText('Cost Breakdown')).not.toBeInTheDocument();
  });
});
