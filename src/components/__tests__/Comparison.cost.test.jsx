import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import Comparison, { exportComparisonData } from '../Comparison';

// Mock the hooks
vi.mock('../hooks/useSettings', () => ({
  useCostSettings: () => ({
    showCostEstimates: true
  })
}));

// Mock TokenCostDisplay component
vi.mock('../TokenCostDisplay', () => {
  return function MockTokenCostDisplay({ usage, showCost, compact }) {
    return (
      <div data-testid="token-cost-display">
        <span>Usage: {usage?.total_tokens || 'N/A'}</span>
        <span>ShowCost: {showCost ? 'true' : 'false'}</span>
        <span>Compact: {compact ? 'true' : 'false'}</span>
        {showCost && usage?.cost && (
          <span>Cost: ${usage.cost.total_cost}</span>
        )}
      </div>
    );
  };
});

describe('Comparison Cost Features', () => {
  const mockTests = [
    {
      id: 'test1',
      modelId: 'claude-3-sonnet',
      timestamp: '2024-01-01T00:00:00Z',
      response: 'Test response 1',
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
          is_estimated: false
        }
      },
      toolUsage: { hasToolUsage: false }
    },
    {
      id: 'test2',
      modelId: 'claude-3-haiku',
      timestamp: '2024-01-01T01:00:00Z',
      response: 'Test response 2',
      usage: {
        input_tokens: 120,
        output_tokens: 60,
        total_tokens: 180,
        tokens_source: 'api',
        cost: {
          input_cost: 0.00036,
          output_cost: 0.0009,
          total_cost: 0.00126,
          currency: 'USD',
          is_estimated: false
        }
      },
      toolUsage: { hasToolUsage: false }
    }
  ];

  const mockProps = {
    selectedTests: mockTests,
    onRemoveTest: vi.fn(),
    onClearComparison: vi.fn()
  };

  test('displays cost comparison when cost estimates are enabled', () => {
    render(<Comparison {...mockProps} />);

    expect(screen.getByText('Cost Comparison')).toBeInTheDocument();
    expect(screen.getByText(/Difference:/)).toBeInTheDocument();
  });

  test('shows cost mode button when cost estimates are enabled', () => {
    render(<Comparison {...mockProps} />);

    expect(screen.getByText('Costs')).toBeInTheDocument();
  });

  test('displays TokenCostDisplay components in metadata mode', () => {
    render(<Comparison {...mockProps} />);

    // Switch to metadata mode
    fireEvent.click(screen.getByText('Metadata'));

    const tokenCostDisplays = screen.getAllByTestId('token-cost-display');
    expect(tokenCostDisplays).toHaveLength(2);

    // Check that cost is shown
    expect(tokenCostDisplays[0]).toHaveTextContent('ShowCost: true');
    expect(tokenCostDisplays[0]).toHaveTextContent('Compact: true');
  });

  test('displays detailed cost information in costs mode', () => {
    render(<Comparison {...mockProps} />);

    // Switch to costs mode
    fireEvent.click(screen.getByText('Costs'));

    const tokenCostDisplays = screen.getAllByTestId('token-cost-display');
    expect(tokenCostDisplays).toHaveLength(2);

    // Check that detailed cost view is shown (not compact)
    expect(tokenCostDisplays[0]).toHaveTextContent('Compact: false');
  });

  test('export includes cost data when cost estimates are enabled', () => {
    const exportData = exportComparisonData(mockTests, true);

    expect(exportData.tests[0].usage.cost).toBeDefined();
    expect(exportData.tests[0].usage.cost.total_cost).toBe(0.00105);
    expect(exportData.tests[1].usage.cost.total_cost).toBe(0.00126);

    // Check comparison metrics include cost comparison
    expect(exportData.comparisonMetrics.costComparison).toBeDefined();
    expect(exportData.comparisonMetrics.costComparison.costDifference).toBe(0.00021);
    expect(exportData.comparisonMetrics.costComparison.moreEconomical).toBe('Test A');
  });

  test('export excludes cost data when cost estimates are disabled', () => {
    const exportData = exportComparisonData(mockTests, false);

    expect(exportData.tests[0].usage.cost).toBeUndefined();
    expect(exportData.tests[1].usage.cost).toBeUndefined();
    expect(exportData.comparisonMetrics.costComparison).toBeUndefined();
  });

  test('handles tests without cost data gracefully', () => {
    const testsWithoutCost = [
      {
        ...mockTests[0],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
          tokens_source: 'estimated'
          // No cost data
        }
      },
      {
        ...mockTests[1],
        usage: {
          input_tokens: 120,
          output_tokens: 60,
          total_tokens: 180,
          tokens_source: 'estimated'
          // No cost data
        }
      }
    ];

    render(<Comparison {...{ ...mockProps, selectedTests: testsWithoutCost }} />);

    // Cost comparison section should not appear when no cost data is available
    expect(screen.queryByText('Cost Comparison')).not.toBeInTheDocument();
  });
});
