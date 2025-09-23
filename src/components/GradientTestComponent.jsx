import React, { useState } from 'react';
import { gradientErrorRecovery } from '../utils/gradientErrorRecovery';

/**
 * Test component to verify gradient fixes are working
 * This component can be temporarily added to test gradient positioning and containment
 */
const GradientTestComponent = () => {
  const [showLongContent, setShowLongContent] = useState(false);
  const [recoveryStats, setRecoveryStats] = useState(null);

  const longSystemPrompt = `You are a highly experienced data analyst with expertise in financial markets, statistical analysis, and business intelligence. Your role is to analyze complex datasets and provide actionable insights that drive strategic decision-making.

Key responsibilities:
1. Examine data patterns and trends with meticulous attention to detail
2. Identify anomalies, outliers, and potential data quality issues
3. Provide clear, concise summaries of findings with supporting evidence
4. Recommend specific actions based on your analysis
5. Explain your methodology and reasoning for transparency

When analyzing data, always consider:
- Statistical significance and confidence levels
- Potential biases or limitations in the dataset
- Business context and practical implications
- Multiple perspectives and alternative explanations
- Risk factors and uncertainty quantification

Your responses should be professional, data-driven, and accessible to both technical and non-technical stakeholders. Use visualizations concepts when helpful, and always provide specific, actionable recommendations.`;

  const handleTestGradients = () => {
    // Trigger gradient issue detection
    const issues = gradientErrorRecovery.detectGradientIssues();
    console.log('Detected gradient issues:', issues);

    // Get recovery stats
    const stats = gradientErrorRecovery.getRecoveryStats();
    setRecoveryStats(stats);
  };

  const handleApplyFixes = () => {
    gradientErrorRecovery.applyPreventiveFixes();
    console.log('Applied preventive gradient fixes');
  };

  return (
    <div className="space-y-6 p-4">
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Gradient Fix Testing</h3>

        <div className="space-y-4">
          <div className="flex space-x-4">
            <button
              onClick={() => setShowLongContent(!showLongContent)}
              className="btn-primary"
            >
              {showLongContent ? 'Hide' : 'Show'} Long Content Test
            </button>
            <button
              onClick={handleTestGradients}
              className="btn-secondary"
            >
              Test Gradient Detection
            </button>
            <button
              onClick={handleApplyFixes}
              className="btn-secondary"
            >
              Apply Fixes
            </button>
          </div>

          {recoveryStats && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Recovery Statistics</h4>
              <div className="text-sm text-blue-800 space-y-1">
                <p>Total Recovery Attempts: {recoveryStats.total}</p>
                <p>Successful: {recoveryStats.successful}</p>
                <p>Failed: {recoveryStats.failed}</p>
                <p>Errors: {recoveryStats.errors}</p>
                <p>Success Rate: {recoveryStats.successRate}%</p>
                <p>Applied Fixes: {recoveryStats.appliedFixes.join(', ') || 'None'}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Test gradient containers */}
      <div className="bg-gradient-to-r from-primary-50 to-secondary-100 border border-primary-200 rounded-lg p-4 determinism-gradient-container">
        <h4 className="font-medium text-gray-700 mb-2">Test Gradient Container</h4>
        <p className="text-sm text-gray-600">
          This container uses the same gradient as the DeterminismEvaluator component.
        </p>
      </div>

      {/* Test scroll indicator */}
      <div className="card">
        <h4 className="font-medium text-gray-700 mb-2">Scroll Indicator Test</h4>
        <div className="relative max-h-32 overflow-y-auto bg-gray-50 border border-gray-200 rounded">
          <div className="p-4">
            <p className="text-sm text-gray-800 mb-2">This content should have a scroll indicator at the bottom when it overflows.</p>
            <p className="text-sm text-gray-600">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
              Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
              Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
              Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
              Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.
            </p>
          </div>
          <div className="scroll-indicator-gradient" />
        </div>
      </div>

      {/* Test long system prompt display */}
      {showLongContent && (
        <div className="card">
          <h4 className="font-medium text-gray-700 mb-2">Long System Prompt Test</h4>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <pre className="text-sm text-purple-800 whitespace-pre-wrap font-mono system-prompt-display">
              {longSystemPrompt}
            </pre>
          </div>
        </div>
      )}

      {/* Test main app gradient */}
      <div className="min-h-32 bg-gradient-to-br from-tertiary-50 to-secondary-100 bg-gradient-container rounded-lg p-4">
        <h4 className="font-medium text-gray-700 mb-2">Main App Gradient Test</h4>
        <p className="text-sm text-gray-600">
          This uses the same gradient as the main app background.
        </p>
      </div>
    </div>
  );
};

export default GradientTestComponent;
