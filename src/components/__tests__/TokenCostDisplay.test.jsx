import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TokenCostDisplay from '../TokenCostDisplay';

describe('TokenCostDisplay', () => {
  const mockUsageWithoutCost = {
    input_tokens: 100,
    output_tokens: 50,
    total_tokens: 150,
    tokens_source: 'api'
  };

  const mockUsageWithCost = {
    input_tokens: 100,
    output_tokens: 50,
    tool_tokens: 25,
    total_tokens: 175,
    tokens_source: 'estimated',
    estimation_method: 'tiktoken',
    cost: {
      input_cost: 0.0003,
      output_cost: 0.0015,
      tool_cost: 0.0001,
      total_cost: 0.0019,
      currency: 'USD',
      pricing_date: '2025-01-15T00:00:00Z',
      is_estimated: true
    }
  };

  it('renders nothing when no usage data is provided', () => {
    const { container } = render(<TokenCostDisplay usage={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('displays token information in full mode', () => {
    render(<TokenCostDisplay usage={mockUsageWithoutCost} showCost={false} />);

    expect(screen.getByText('Token Usage')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument(); // Input tokens
    expect(screen.getByText('50')).toBeInTheDocument();  // Output tokens
    expect(screen.getByText('150')).toBeInTheDocument(); // Total tokens
    expect(screen.getByText('Input Tokens')).toBeInTheDocument();
    expect(screen.getByText('Output Tokens')).toBeInTheDocument();
    expect(screen.getByText('Total Tokens')).toBeInTheDocument();
  });

  it('displays token information in compact mode', () => {
    render(<TokenCostDisplay usage={mockUsageWithoutCost} showCost={false} compact={true} />);

    expect(screen.getByText('Tokens:')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument(); // Total tokens
    expect(screen.queryByText('Token Usage')).not.toBeInTheDocument(); // Full mode header should not be present
  });

  it('shows estimation indicators for estimated tokens', () => {
    render(<TokenCostDisplay usage={mockUsageWithCost} showCost={false} />);

    expect(screen.getByText('Estimated')).toBeInTheDocument();
    expect(screen.getByText('Estimation method: tiktoken')).toBeInTheDocument();
  });

  it('displays cost information when showCost is true', () => {
    render(<TokenCostDisplay usage={mockUsageWithCost} showCost={true} />);

    expect(screen.getByText('Cost Breakdown')).toBeInTheDocument();
    expect(screen.getByText('$0.0003')).toBeInTheDocument(); // Input cost
    expect(screen.getByText('$0.0015')).toBeInTheDocument(); // Output cost
    expect(screen.getByText('$0.0001')).toBeInTheDocument(); // Tool cost
    expect(screen.getByText('$0.0019')).toBeInTheDocument(); // Total cost
    expect(screen.getByText('Cost Estimation Notice')).toBeInTheDocument();
  });

  it('does not display cost information when showCost is false', () => {
    render(<TokenCostDisplay usage={mockUsageWithCost} showCost={false} />);

    expect(screen.queryByText('Cost Breakdown')).not.toBeInTheDocument();
    expect(screen.queryByText('Cost Estimation Notice')).not.toBeInTheDocument();
  });

  it('displays tool tokens when present', () => {
    render(<TokenCostDisplay usage={mockUsageWithCost} showCost={false} />);

    expect(screen.getByText('25')).toBeInTheDocument(); // Tool tokens
    expect(screen.getByText('Tool Tokens')).toBeInTheDocument();
  });

  it('handles missing token values gracefully', () => {
    const incompleteUsage = {
      input_tokens: null,
      output_tokens: 50,
      total_tokens: 50,
      tokens_source: 'api'
    };

    render(<TokenCostDisplay usage={incompleteUsage} showCost={false} />);

    expect(screen.getByText('50')).toBeInTheDocument(); // Output tokens
    expect(screen.getByText('Total Tokens')).toBeInTheDocument();
    expect(screen.queryByText('Input Tokens')).not.toBeInTheDocument(); // Should not show input tokens section
  });

  it('displays cost in compact mode when enabled', () => {
    render(<TokenCostDisplay usage={mockUsageWithCost} showCost={true} compact={true} />);

    expect(screen.getByText('Tokens:')).toBeInTheDocument();
    expect(screen.getByText('Cost:')).toBeInTheDocument();
    expect(screen.getByText('175')).toBeInTheDocument(); // Total tokens
    expect(screen.getByText('$0.0019')).toBeInTheDocument(); // Total cost
  });
});
