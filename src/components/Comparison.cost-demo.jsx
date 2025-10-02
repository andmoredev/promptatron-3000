import React from 'react';
import Comparison, { exportComparisonData } from './Comparison';

/**
 * Demo component showing cost comparison functionality
 */
function ComparisonCostDemo() {
  // Sample test data with cost information
  const sampleTests = [
    {
      id: 'demo-test-1',
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      timestamp2024-01-15T10:30:00Z',
      datasetType: 'customer-support',
      datasetOption: 'complaints.json',
      systemPrompt: 'You are a helpful customer service assistant.',
      userPrompt: 'Please analyze this customer complaint and provide a response.',
      response: 'I understand your frustration with the delayed delivery. Let me help you track your order and provide a solution. Based on the tracking information, your package was delayed due to weather conditions. I can offer you a full refund or expedited replacement shipping at no cost.',
      determinismGrade: { grade: 'A', fallbackAnalysis: false },
      isStreamed: false,
      usage: {
        input_tokens: 145,
        output_tokens: 89,
        total_tokens: 234,
        tokens_source: 'api',
        cost: {
          input_cost: 0.000435,  // $0.003 per 1K tokens
          output_cost: 0.001335, // $0.015 per 1K tokens
          total_cost: 0.00177,
          currency: 'USD',
          is_estimated: false,
          pricing_date: '2024-01-15T00:00:00Z'
        }
      },
      toolUsage: { hasToolUsage: false }
    },
    {
      id: 'demo-test-2',
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      timestamp: '2024-01-15T10:35:00Z',
      datasetType: 'customer-support',
      datasetOption: 'complaints.json',
      systemPrompt: 'You are a helpful customer service assistant.',
      userPrompt: 'Please analyze this customer complaint and provide a response.',
      response: 'I apologize for the delivery delay. Weather conditions caused the delay. I can process a refund or send a replacement with expedited shipping at no charge. Please let me know your preference.',
      determinismGrade: { grade: 'B', fallbackAnalysis: false },
      isStreamed: false,
      usage: {
        input_tokens: 145,
        output_tokens: 67,
        total_tokens: 212,
        tokens_source: 'api',
        cost: {
          input_cost: 0.0000363, // $0.00025 per 1K tokens
          output_cost: 0.0000838, // $0.00125 per 1K tokens
          total_cost: 0.0001201,
          currency: 'USD',
          is_estimated: false,
          pricing_date: '2024-01-15T00:00:00Z'
        }
      },
      toolUsage: { hasToolUsage: false }
    }
  ];

  const handleRemoveTest = (testId) => {
    console.log('Remove test:', testId);
  };

  const handleClearComparison = () => {
    console.log('Clear comparison');
  };

  const handleExportDemo = () => {
    const exportData = exportComparisonData(sampleTests, true);
    console.log('Export data with costs:', exportData);

    // Show cost comparison metrics
    if (exportData.comparisonMetrics?.costComparison) {
      const { costComparison } = exportData.comparisonMetrics;
      console.log('Cost Analysis:');
      console.log(`- Test A Cost: $${costComparison.test1Cost.toFixed(6)}`);
      console.log(`- Test B Cost: $${costComparison.test2Cost.toFixed(6)}`);
      console.log(`- Difference: $${costComparison.costDifference.toFixed(6)} (${costComparison.costDifferencePercent.toFixed(1)}%)`);
      console.log(`- More Economical: ${costComparison.moreEconomical}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-tertiary-50 to-secondary-100">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Cost Comparison Demo
          </h1>
          <p className="text-gray-600 mb-4">
            This demo shows the enhanced comparison functionality with cost tracking.
            The comparison includes cost differences, efficiency analysis, and detailed breakdowns.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-blue-900 mb-2">Demo Features:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Cost comparison between Claude 3.5 Sonnet and Claude 3.5 Haiku</li>
              <li>• Cost difference calculations and percentage analysis</li>
              <li>• Winner identification based on cost efficiency</li>
              <li>• Export functionality with cost data included</li>
              <li>• Detailed cost breakdowns in dedicated view mode</li>
            </ul>
          </div>

          <div className="flex space-x-4 mb-6">
            <button
              onClick={handleExportDemo}
              className="btn-primary"
            >
              Demo Export with Costs
            </button>
          </div>
        </div>

        <Comparison
          selectedTests={sampleTests}
          onRemoveTest={handleRemoveTest}
          onClearComparison={handleClearComparison}
        />

        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-2">Cost Analysis Summary:</h3>
          <div className="text-sm text-gray-700 space-y-1">
            <p>• <strong>Claude 3.5 Sonnet:</strong> Higher quality response (Grade A) but costs $0.001770</p>
            <p>• <strong>Claude 3.5 Haiku:</strong> Shorter response (Grade B) but only costs $0.000120</p>
            <p>• <strong>Cost Difference:</strong> Haiku is 93.2% more cost-effective</p>
            <p>• <strong>Trade-off:</strong> Sonnet provides more detailed response for 14.7x the cost</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComparisonCostDemo;
