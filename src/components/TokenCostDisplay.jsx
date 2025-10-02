import React from 'react';
import PropTypes from 'prop-types';
import HelpTooltip from './HelpTooltip';

/**
 * TokenCostDisplay component displays token usage and cost information
 * @param {Object} props - Component props
 * @param {Object} props.usage - Usage data with token counts and optional cost in
* @param {boolean} props.showCost - Whether to display cost information
 * @param {boolean} props.compact - Whether to use compact display mode
 */
function TokenCostDisplay({ usage, showCost = false, compact = false }) {
  if (!usage) {
    return null;
  }

  // Helper function to format numbers with locale-specific formatting
  const formatNumber = (num) => {
    if (num === null || num === undefined) return 'N/A';
    return num.toLocaleString();
  };

  // Helper function to format cost values
  const formatCost = (cost, currency = 'USD') => {
    if (cost === null || cost === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 4,
      maximumFractionDigits: 6
    }).format(cost);
  };

  // Helper function to get estimation indicator
  const getEstimationIndicator = (isEstimated) => {
    if (isEstimated) {
      return (
        <span className="inline-flex items-center ml-1" title="Estimated value">
          <svg className="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center ml-1" title="Exact value from API">
        <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
    );
  };

  // Determine if values are estimated
  const isEstimated = usage.tokens_source === 'estimated';
  const hasCostData = showCost && usage.cost;

  if (compact) {
    // Compact mode - single line display
    return (
      <div className="flex items-center space-x-4 text-sm">
        {/* Token summary */}
        <div className="flex items-center space-x-1">
          <span className="text-gray-600">Tokens:</span>
          <span className="font-medium text-gray-900">
            {formatNumber(usage.total_tokens)}
          </span>
          {getEstimationIndicator(isEstimated)}
        </div>

        {/* Cost summary (if enabled) */}
        {hasCostData && (
          <div className="flex items-center space-x-1">
            <span className="text-gray-600">Cost:</span>
            <span className="font-medium text-gray-900">
              {formatCost(usage.cost.total_cost, usage.cost.currency)}
            </span>
            {usage.cost.is_estimated && (
              <span className="text-xs text-orange-600" title="Estimated cost">~</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full display mode
  return (
    <div className="space-y-4">
      {/* Token Information Section */}
      <div>
        <div className="flex items-center space-x-2 mb-3">
          <h4 className="font-medium text-gray-700">Token Usage</h4>
          <HelpTooltip
            content={`Token counts show how many tokens were used for this request. ${
              isEstimated
                ? 'These values are estimated using token counting algorithms since the API did not provide exact counts.'
                : 'These values are exact counts provided by the API.'
            }`}
            position="right"
          />
          {isEstimated && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              Estimated
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Input Tokens */}
          {usage.input_tokens !== null && usage.input_tokens !== undefined && (
            <div className="text-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-center">
                <div className="text-lg font-semibold text-blue-600">
                  {formatNumber(usage.input_tokens)}
                </div>
                {getEstimationIndicator(isEstimated)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Input Tokens</div>
            </div>
          )}

          {/* Output Tokens */}
          {usage.output_tokens !== null && usage.output_tokens !== undefined && (
            <div className="text-center p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-center">
                <div className="text-lg font-semibold text-green-600">
                  {formatNumber(usage.output_tokens)}
                </div>
                {getEstimationIndicator(isEstimated)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Output Tokens</div>
            </div>
          )}

          {/* Tool Tokens (if applicable) */}
          {usage.tool_tokens !== null && usage.tool_tokens !== undefined && usage.tool_tokens > 0 && (
            <div className="text-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center justify-center">
                <div className="text-lg font-semibold text-yellow-600">
                  {formatNumber(usage.tool_tokens)}
                </div>
                {getEstimationIndicator(isEstimated)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Tool Tokens</div>
            </div>
          )}

          {/* Total Tokens */}
          {usage.total_tokens !== null && usage.total_tokens !== undefined && (
            <div className="text-center p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center justify-center">
                <div className="text-lg font-semibold text-purple-600">
                  {formatNumber(usage.total_tokens)}
                </div>
                {getEstimationIndicator(isEstimated)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Total Tokens</div>
            </div>
          )}
        </div>

        {/* Estimation method info */}
        {isEstimated && usage.estimation_method && (
          <div className="mt-2 text-xs text-gray-500">
            Estimation method: {usage.estimation_method}
          </div>
        )}
      </div>

      {/* Cost Information Section (if enabled) */}
      {hasCostData && (
        <div>
          <div className="flex items-center space-x-2 mb-3">
            <h4 className="font-medium text-gray-700">Cost Breakdown</h4>
            <HelpTooltip
              content="Cost estimates are based on current AWS Bedrock pricing. Actual costs may vary depending on your AWS account configuration and regional pricing differences."
              position="right"
            />
            {usage.cost.is_estimated && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                Estimated
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Input Cost */}
            {usage.cost.input_cost !== null && usage.cost.input_cost !== undefined && (
              <div className="text-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-lg font-semibold text-blue-600">
                  {formatCost(usage.cost.input_cost, usage.cost.currency)}
                </div>
                <div className="text-xs text-gray-500 mt-1">Input Cost</div>
              </div>
            )}

            {/* Output Cost */}
            {usage.cost.output_cost !== null && usage.cost.output_cost !== undefined && (
              <div className="text-center p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-lg font-semibold text-green-600">
                  {formatCost(usage.cost.output_cost, usage.cost.currency)}
                </div>
                <div className="text-xs text-gray-500 mt-1">Output Cost</div>
              </div>
            )}

            {/* Tool Cost (if applicable) */}
            {usage.cost.tool_cost !== null && usage.cost.tool_cost !== undefined && usage.cost.tool_cost > 0 && (
              <div className="text-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="text-lg font-semibold text-yellow-600">
                  {formatCost(usage.cost.tool_cost, usage.cost.currency)}
                </div>
                <div className="text-xs text-gray-500 mt-1">Tool Cost</div>
              </div>
            )}

            {/* Total Cost */}
            {usage.cost.total_cost !== null && usage.cost.total_cost !== undefined && (
              <div className="text-center p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="text-lg font-semibold text-purple-600">
                  {formatCost(usage.cost.total_cost, usage.cost.currency)}
                </div>
                <div className="text-xs text-gray-500 mt-1">Total Cost</div>
              </div>
            )}
          </div>

          {/* Cost disclaimer */}
          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-start space-x-2">
              <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-xs text-gray-600">
                <p className="font-medium mb-1">Cost Estimation Notice</p>
                <p>
                  These cost estimates are based on current AWS Bedrock pricing and may not reflect your actual charges.
                  Actual costs depend on your AWS account configuration, regional pricing, and any applicable discounts or credits.
                  {usage.cost.pricing_date && (
                    <span className="block mt-1">
                      Pricing data from: {new Date(usage.cost.pricing_date).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

TokenCostDisplay.propTypes = {
  usage: PropTypes.shape({
    input_tokens: PropTypes.number,
    output_tokens: PropTypes.number,
    tool_tokens: PropTypes.number,
    total_tokens: PropTypes.number,
    tokens_source: PropTypes.oneOf(['api', 'estimated']),
    estimation_method: PropTypes.string,
    cost: PropTypes.shape({
      input_cost: PropTypes.number,
      output_cost: PropTypes.number,
      tool_cost: PropTypes.number,
      total_cost: PropTypes.number,
      currency: PropTypes.string,
      pricing_date: PropTypes.string,
      is_estimated: PropTypes.bool
    })
  }),
  showCost: PropTypes.bool,
  compact: PropTypes.bool
};

export default TokenCostDisplay;
