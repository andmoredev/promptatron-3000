import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import ToolUsageDisplay from './ToolUsageDisplay';
import TokenCostDisplay from './TokenCostDisplay';
import { useCostSettings } from '../hooks/useSettings';

// Export comparison data including cost information
const exportComparisonData = (selectedTests, includeCostData = false) => {
  const exportData = {
    timestamp: new Date().toISOString(),
    comparisonType: 'test-comparison',
    testCount: selectedTests.length,
    tests: selectedTests.map((test, index) => ({
      testId: test.id,
      testLabel: `Test ${String.fromCharCode(65 + index)}`,
      modelId: test.modelId,
      timestamp: test.timestamp,
      datasetType: test.datasetType,
      datasetOption: test.datasetOption,
      systemPrompt: test.systemPrompt,
      userPrompt: test.userPrompt,
      response: test.response,
      responseLength: test.response.length,
      determinismGrade: test.determinismGrade,
      isStreamed: test.isStreamed,
      streamingMetrics: test.streamingMetrics,
      usage: {
        input_tokens: test.usage?.input_tokens || test.usage?.inputTokens,
        output_tokens: test.usage?.output_tokens || test.usage?.outputTokens,
        total_tokens: test.usage?.total_tokens || test.usage?.totalTokens,
        tokens_source: test.usage?.tokens_source,
        ...(includeCostData && test.usage?.cost && {
          cost: {
            input_cost: test.usage.cost.input_cost,
            output_cost: test.usage.cost.output_cost,
            tool_cost: test.usage.cost.tool_cost,
            total_cost: test.usage.cost.total_cost,
            currency: test.usage.cost.currency,
            is_estimated: test.usage.cost.is_estimated,
            pricing_date: test.usage.cost.pricing_date
          }
        })
      },
      toolUsage: test.toolUsage
    }))
  };

  // Add comparison metrics if we have exactly 2 tests
  if (selectedTests.length === 2) {
    const [test1, test2] = selectedTests;

    // Response similarity
    const similarity = calculateSimilarity(test1.response, test2.response);
    exportData.comparisonMetrics = {
      responseSimilarity: similarity,
      responseSimilarityGrade: similarity >= 80 ? 'High' : similarity >= 60 ? 'Medium' : 'Low'
    };

    // Tool usage comparison
    const toolComparison = calculateToolUsageSimilarity(test1, test2);
    exportData.comparisonMetrics.toolUsageSimilarity = toolComparison;

    // Cost comparison (if enabled and available)
    if (includeCostData && test1.usage?.cost && test2.usage?.cost) {
      const cost1 = test1.usage.cost.total_cost;
      const cost2 = test2.usage.cost.total_cost;
      const costDifference = cost2 - cost1;
      const costDifferencePercent = cost1 > 0 ? (costDifference / cost1) * 100 : 0;

      exportData.comparisonMetrics.costComparison = {
        test1Cost: cost1,
        test2Cost: cost2,
        costDifference: costDifference,
        costDifferencePercent: costDifferencePercent,
        moreEconomical: cost1 < cost2 ? 'Test A' : cost2 < cost1 ? 'Test B' : 'Equal',
        currency: test1.usage.cost.currency
      };
    }
  }

  return exportData;
};

// Helper function to calculate similarity (moved outside component for export function)
const calculateSimilarity = (text1, text2) => {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);
  const allWords = new Set([...words1, ...words2]);

  let commonWords = 0;
  allWords.forEach(word => {
    if (words1.includes(word) && words2.includes(word)) {
      commonWords++;
    }
  });

  return Math.round((commonWords / allWords.size) * 100);
};

// Helper function to calculate tool usage similarity (moved outside component for export function)
const calculateToolUsageSimilarity = (test1, test2) => {
  const toolUsage1 = test1.toolUsage;
  const toolUsage2 = test2.toolUsage;

  // If neither has tool usage, they're identical (100%)
  if (!toolUsage1?.hasToolUsage && !toolUsage2?.hasToolUsage) {
    return 100;
  }

  // If only one has tool usage, they're completely different (0%)
  if (toolUsage1?.hasToolUsage !== toolUsage2?.hasToolUsage) {
    return 0;
  }

  // Both have tool usage - compare details
  const calls1 = toolUsage1?.toolCalls || [];
  const calls2 = toolUsage2?.toolCalls || [];

  // If different number of tool calls, partial similarity
  if (calls1.length !== calls2.length) {
    return Math.max(0, 50 - Math.abs(calls1.length - calls2.length) * 10);
  }

  // Compare each tool call
  let totalSimilarity = 0;
  for (let i = 0; i < calls1.length; i++) {
    const call1 = calls1[i];
    const call2 = calls2[i];

    let callSimilarity = 0;

    // Tool name match (40% weight)
    if (call1.toolName === call2.toolName) {
      callSimilarity += 40;

      // Parameter similarity (60% weight)
      const params1 = JSON.stringify(call1.input || {});
      const params2 = JSON.stringify(call2.input || {});

      if (params1 === params2) {
        callSimilarity += 60;
      } else {
        // Partial parameter similarity based on key overlap
        const keys1 = Object.keys(call1.input || {});
        const keys2 = Object.keys(call2.input || {});
        const allKeys = new Set([...keys1, ...keys2]);
        const commonKeys = keys1.filter(key => keys2.includes(key));

        if (allKeys.size > 0) {
          callSimilarity += Math.round((commonKeys.length / allKeys.size) * 30);
        }
      }
    }

    totalSimilarity += callSimilarity;
  }

  return Math.round(totalSimilarity / calls1.length);
};

const Comparison = ({ selectedTests, onRemoveTest, onClearComparison }) => {
  const [viewMode, setViewMode] = useState('side-by-side'); // 'side-by-side', 'stacked'
  const [compareMode, setCompareMode] = useState('responses'); // 'responses', 'metadata', 'tools', 'all'

  const [highlightDifferences, setHighlightDifferences] = useState(true);

  // Get cost settings
  const { showCostEstimates } = useCostSettings();

  // Helper function for determinism grade colors
  const getDeterminismGradeColor = (grade) => {
    switch (grade) {
      case 'A': return 'text-primary-700';
      case 'B': return 'text-secondary-800';
      case 'C': return 'text-yellow-600';
      case 'D': return 'text-orange-600';
      case 'F': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  // Detect content type for formatting
  const detectContentType = (text) => {
    const trimmed = text.trim();

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch (e) {
        // Not valid JSON
      }
    }

    if (trimmed.startsWith('<') && trimmed.includes('>')) {
      return 'xml';
    }

    if (trimmed.includes('```') || trimmed.includes('##') || trimmed.includes('**')) {
      return 'markdown';
    }

    return 'text';
  };

  // Format JSON with proper indentation
  const formatJSON = (text) => {
    try {
      const parsed = JSON.parse(text.trim());
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return text;
    }
  };



  // Get tool usage comparison summary
  const getToolUsageComparison = () => {
    if (selectedTests.length !== 2) return null;

    const [test1, test2] = selectedTests;
    const toolUsage1 = test1.toolUsage;
    const toolUsage2 = test2.toolUsage;

    const hasTools1 = toolUsage1?.hasToolUsage || false;
    const hasTools2 = toolUsage2?.hasToolUsage || false;
    const calls1 = toolUsage1?.toolCalls || [];
    const calls2 = toolUsage2?.toolCalls || [];

    return {
      test1: {
        hasTools: hasTools1,
        toolCount: calls1.length,
        tools: calls1.map(call => call.toolName)
      },
      test2: {
        hasTools: hasTools2,
        toolCount: calls2.length,
        tools: calls2.map(call => call.toolName)
      },
      similarity: calculateToolUsageSimilarity(test1, test2),
      identical: hasTools1 === hasTools2 &&
                calls1.length === calls2.length &&
                calls1.every((call1, i) => {
                  const call2 = calls2[i];
                  return call1.toolName === call2.toolName &&
                         JSON.stringify(call1.input) === JSON.stringify(call2.input);
                })
    };
  };

  // Get cost comparison summary
  const getCostComparison = () => {
    if (selectedTests.length !== 2) return null;

    const [test1, test2] = selectedTests;
    const cost1 = test1.usage?.cost;
    const cost2 = test2.usage?.cost;

    // If neither test has cost data, return null
    if (!cost1 && !cost2) return null;

    const hasCost1 = cost1 && cost1.total_cost !== null && cost1.total_cost !== undefined;
    const hasCost2 = cost2 && cost2.total_cost !== null && cost2.total_cost !== undefined;

    // Calculate cost difference and percentage
    let costDifference = null;
    let costDifferencePercent = null;
    let winner = null;

    if (hasCost1 && hasCost2) {
      costDifference = cost2.total_cost - cost1.total_cost;
      costDifferencePercent = cost1.total_cost > 0 ? (costDifference / cost1.total_cost) * 100 : 0;
      winner = cost1.total_cost < cost2.total_cost ? 'test1' : cost2.total_cost < cost1.total_cost ? 'test2' : 'tie';
    }

    return {
      test1: {
        hasCost: hasCost1,
        cost: cost1,
        totalCost: hasCost1 ? cost1.total_cost : null,
        currency: cost1?.currency || 'USD'
      },
      test2: {
        hasCost: hasCost2,
        cost: cost2,
        totalCost: hasCost2 ? cost2.total_cost : null,
        currency: cost2?.currency || 'USD'
      },
      costDifference,
      costDifferencePercent,
      winner,
      bothHaveCosts: hasCost1 && hasCost2
    };
  };

  // Format cost for display
  const formatCost = (cost, currency = 'USD') => {
    if (cost === null || cost === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 4,
      maximumFractionDigits: 6
    }).format(cost);
  };

  // Compare tool parameters and highlight differences
  const compareToolParameters = (param1, param2, key) => {
    if (typeof param1 !== typeof param2) {
      return { isDifferent: true, type: 'type-mismatch' };
    }

    if (Array.isArray(param1) && Array.isArray(param2)) {
      const different = param1.length !== param2.length ||
                       !param1.every((item, i) => item === param2[i]);
      return { isDifferent: different, type: 'array' };
    }

    if (typeof param1 === 'object' && param1 !== null && param2 !== null) {
      const keys1 = Object.keys(param1);
      const keys2 = Object.keys(param2);
      const different = keys1.length !== keys2.length ||
                       !keys1.every(k => param2.hasOwnProperty(k) && param1[k] === param2[k]);
      return { isDifferent: different, type: 'object' };
    }

    return { isDifferent: param1 !== param2, type: 'primitive' };
  };

  // Custom components for ReactMarkdown
  const markdownComponents = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : 'text';

      return !inline ? (
        <SyntaxHighlighter
          style={oneLight}
          language={language}
          PreTag="div"
          className="rounded-md text-sm"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      );
    }
  };

  // Render formatted content
  const renderContent = (text, contentType) => {
    switch (contentType) {
      case 'json':
        return (
          <SyntaxHighlighter
            language="json"
            style={oneLight}
            className="rounded-md text-sm"
            customStyle={{ margin: 0, fontSize: '12px', lineHeight: '1.4' }}
          >
            {formatJSON(text)}
          </SyntaxHighlighter>
        );

      case 'xml':
        return (
          <SyntaxHighlighter
            language="xml"
            style={oneLight}
            className="rounded-md text-sm"
            customStyle={{ margin: 0, fontSize: '12px', lineHeight: '1.4' }}
          >
            {text}
          </SyntaxHighlighter>
        );

      case 'markdown':
        return (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={markdownComponents}
            >
              {text}
            </ReactMarkdown>
          </div>
        );

      default:
        return (
          <div className="space-y-2 text-sm">
            {text.split('\n\n').map((paragraph, index) => (
              <p key={index} className="text-gray-800 leading-relaxed">
                {paragraph.split('\n').map((line, lineIndex) => (
                  <span key={lineIndex}>
                    {line}
                    {lineIndex < paragraph.split('\n').length - 1 && <br />}
                  </span>
                ))}
              </p>
            ))}
          </div>
        );
    }
  };

  if (!selectedTests || selectedTests.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Comparison</h3>
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 00-2 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-gray-600">No tests selected for comparison</p>
          <p className="text-sm text-gray-500 mt-1">Select tests from the history to compare them side by side</p>
        </div>
      </div>
    );
  }

  if (selectedTests.length === 1) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Comparison</h3>
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 text-blue-400 mb-4">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <p className="text-gray-600">Select one more test to start comparison</p>
          <p className="text-sm text-gray-500 mt-1">Currently selected: {selectedTests[0].modelId}</p>
          <button
            onClick={onClearComparison}
            className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Clear Selection
          </button>
        </div>
      </div>
    );
  }

  const similarity = selectedTests.length === 2
    ? calculateSimilarity(selectedTests[0].response, selectedTests[1].response)
    : null;

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Test Comparison ({selectedTests.length} tests)
          </h3>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                const exportData = exportComparisonData(selectedTests, showCostEstimates);
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `comparison-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              title="Export comparison data"
            >
              Export
            </button>
            <button
              onClick={onClearComparison}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {/* View Mode */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('side-by-side')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'side-by-side'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Side by Side
            </button>
            <button
              onClick={() => setViewMode('stacked')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'stacked'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Stacked
            </button>
          </div>

          {/* Compare Mode */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setCompareMode('responses')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${compareMode === 'responses'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Responses
            </button>
            <button
              onClick={() => setCompareMode('metadata')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${compareMode === 'metadata'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Metadata
            </button>
            <button
              onClick={() => setCompareMode('tools')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${compareMode === 'tools'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Tools
            </button>
            {showCostEstimates && (
              <button
                onClick={() => setCompareMode('costs')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${compareMode === 'costs'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Costs
              </button>
            )}
            <button
              onClick={() => setCompareMode('all')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${compareMode === 'all'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              All
            </button>
          </div>

          {/* Options */}
          <div className="flex items-center space-x-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={highlightDifferences}
                onChange={(e) => setHighlightDifferences(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Highlight differences</span>
            </label>


          </div>
        </div>

        {/* Similarity Score */}
        {similarity !== null && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Response Similarity</span>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${similarity >= 80 ? 'bg-green-500' :
                      similarity >= 60 ? 'bg-yellow-500' :
                        similarity >= 40 ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                    style={{ width: `${similarity}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-900">{similarity}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Tool Usage Comparison */}
        {(() => {
          const toolComparison = getToolUsageComparison();
          if (!toolComparison) return null;

          return (
            <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-purple-900">Tool Usage Comparison</span>
                <div className="flex items-center space-x-2">
                  <div className="w-32 bg-purple-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${toolComparison.similarity >= 80 ? 'bg-green-500' :
                        toolComparison.similarity >= 60 ? 'bg-yellow-500' :
                          toolComparison.similarity >= 40 ? 'bg-orange-500' : 'bg-red-500'
                        }`}
                      style={{ width: `${toolComparison.similarity}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-purple-900">{toolComparison.similarity}%</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <div className="font-medium text-purple-800">Test A</div>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      toolComparison.test1.hasTools
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {toolComparison.test1.hasTools ? '🔧 Used Tools' : 'No Tools'}
                    </span>
                  </div>
                  {toolComparison.test1.hasTools && (
                    <div className="text-purple-700">
                      {toolComparison.test1.toolCount} call{toolComparison.test1.toolCount !== 1 ? 's' : ''}: {toolComparison.test1.tools.join(', ')}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="font-medium text-purple-800">Test B</div>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      toolComparison.test2.hasTools
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {toolComparison.test2.hasTools ? '🔧 Used Tools' : 'No Tools'}
                    </span>
                  </div>
                  {toolComparison.test2.hasTools && (
                    <div className="text-purple-700">
                      {toolComparison.test2.toolCount} call{toolComparison.test2.toolCount !== 1 ? 's' : ''}: {toolComparison.test2.tools.join(', ')}
                    </div>
                  )}
                </div>
              </div>

              {/* Tool Usage Status */}
              <div className="mt-2 text-xs text-purple-700">
                {toolComparison.identical ? (
                  <div className="flex items-center space-x-1">
                    <span>✅</span>
                    <span>Identical tool usage</span>
                  </div>
                ) : toolComparison.test1.hasTools && toolComparison.test2.hasTools ? (
                  <div className="flex items-center space-x-1">
                    <span>⚠️</span>
                    <span>Different tool usage patterns</span>
                  </div>
                ) : toolComparison.test1.hasTools || toolComparison.test2.hasTools ? (
                  <div className="flex items-center space-x-1">
                    <span>❌</span>
                    <span>One test used tools, the other didn't</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1">
                    <span>➖</span>
                    <span>Neither test used tools</span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Cost Comparison */}
        {showCostEstimates && (() => {
          const costComparison = getCostComparison();
          if (!costComparison) return null;

          return (
            <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-green-900">Cost Comparison</span>
                {costComparison.bothHaveCosts && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-green-700">
                      Difference: {costComparison.costDifference >= 0 ? '+' : ''}{formatCost(costComparison.costDifference, costComparison.test1.currency)}
                      {costComparison.costDifferencePercent !== null && (
                        <span className="ml-1">
                          ({costComparison.costDifferencePercent >= 0 ? '+' : ''}{costComparison.costDifferencePercent.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <div className="font-medium text-green-800">Test A</div>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      costComparison.test1.hasCost
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {costComparison.test1.hasCost ? '💰 Has Cost Data' : 'No Cost Data'}
                    </span>
                    {costComparison.winner === 'test1' && (
                      <span className="text-green-600 font-bold" title="Lower cost">🏆</span>
                    )}
                  </div>
                  {costComparison.test1.hasCost && (
                    <div className="text-green-700">
                      Total: {formatCost(costComparison.test1.totalCost, costComparison.test1.currency)}
                      {costComparison.test1.cost?.is_estimated && (
                        <span className="ml-1 text-orange-600" title="Estimated cost">~</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="font-medium text-green-800">Test B</div>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      costComparison.test2.hasCost
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {costComparison.test2.hasCost ? '💰 Has Cost Data' : 'No Cost Data'}
                    </span>
                    {costComparison.winner === 'test2' && (
                      <span className="text-green-600 font-bold" title="Lower cost">🏆</span>
                    )}
                  </div>
                  {costComparison.test2.hasCost && (
                    <div className="text-green-700">
                      Total: {formatCost(costComparison.test2.totalCost, costComparison.test2.currency)}
                      {costComparison.test2.cost?.is_estimated && (
                        <span className="ml-1 text-orange-600" title="Estimated cost">~</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Cost Comparison Insights */}
              <div className="mt-2 text-xs text-green-700">
                {costComparison.bothHaveCosts ? (
                  <div className="flex items-center space-x-1">
                    {costComparison.winner === 'tie' ? (
                      <>
                        <span>⚖️</span>
                        <span>Both tests have identical costs</span>
                      </>
                    ) : (
                      <>
                        <span>💡</span>
                        <span>
                          Test {costComparison.winner === 'test1' ? 'A' : 'B'} is {Math.abs(costComparison.costDifferencePercent).toFixed(1)}% more cost-effective
                        </span>
                      </>
                    )}
                  </div>
                ) : costComparison.test1.hasCost || costComparison.test2.hasCost ? (
                  <div className="flex items-center space-x-1">
                    <span>⚠️</span>
                    <span>Only one test has cost data available</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1">
                    <span>➖</span>
                    <span>No cost data available for comparison</span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Streaming Performance Comparison */}
        {selectedTests.length === 2 && selectedTests.every(test => test.isStreamed && test.streamingMetrics) && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Streaming Performance Comparison</h4>
            <div className="grid grid-cols-2 gap-4 text-xs">
              {selectedTests.map((test, index) => (
                <div key={test.id} className="space-y-1">
                  <div className="font-medium text-blue-800">
                    Test {String.fromCharCode(65 + index)} ({test.modelId?.split('.')[0]})
                  </div>
                  {test.streamingMetrics.streamDuration && (
                    <div className="flex justify-between">
                      <span>Duration:</span>
                      <span>{(test.streamingMetrics.streamDuration / 1000).toFixed(1)}s</span>
                    </div>
                  )}
                  {test.streamingMetrics.averageTokensPerSecond && (
                    <div className="flex justify-between">
                      <span>Speed:</span>
                      <span>{test.streamingMetrics.averageTokensPerSecond.toFixed(1)} tok/s</span>
                    </div>
                  )}
                  {test.streamingMetrics.firstTokenLatency && (
                    <div className="flex justify-between">
                      <span>First Token:</span>
                      <span>{test.streamingMetrics.firstTokenLatency}ms</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Performance Winner */}
            {(() => {
              const [testA, testB] = selectedTests;
              const speedA = testA.streamingMetrics?.averageTokensPerSecond || 0;
              const speedB = testB.streamingMetrics?.averageTokensPerSecond || 0;
              const latencyA = testA.streamingMetrics?.firstTokenLatency || Infinity;
              const latencyB = testB.streamingMetrics?.firstTokenLatency || Infinity;

              if (speedA > speedB * 1.1) {
                return (
                  <div className="mt-2 text-xs text-blue-700">
                    🏆 Test A is {((speedA / speedB - 1) * 100).toFixed(0)}% faster
                  </div>
                );
              } else if (speedB > speedA * 1.1) {
                return (
                  <div className="mt-2 text-xs text-blue-700">
                    🏆 Test B is {((speedB / speedA - 1) * 100).toFixed(0)}% faster
                  </div>
                );
              } else if (Math.abs(latencyA - latencyB) > 100) {
                const winner = latencyA < latencyB ? 'A' : 'B';
                const diff = Math.abs(latencyA - latencyB);
                return (
                  <div className="mt-2 text-xs text-blue-700">
                    🏆 Test {winner} has {diff}ms lower first token latency
                  </div>
                );
              }
              return (
                <div className="mt-2 text-xs text-blue-700">
                  📊 Similar streaming performance
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Comparison Content */}
      <div className={`${viewMode === 'side-by-side' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'space-y-6'}`}>
        {selectedTests.map((test, index) => (
          <div key={test.id} className="card">
            {/* Test Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium text-white ${index === 0 ? 'bg-blue-500' :
                  index === 1 ? 'bg-green-500' :
                    index === 2 ? 'bg-purple-500' : 'bg-gray-500'
                  }`}>
                  {String.fromCharCode(65 + index)}
                </span>
                <h4 className="font-medium text-gray-900">
                  {test.modelId?.split('.')[0] || 'Unknown Model'}
                </h4>
              </div>
              <button
                onClick={() => onRemoveTest(test.id)}
                className="text-gray-400 hover:text-red-500"
                title="Remove from comparison"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Metadata */}
            {(compareMode === 'metadata' || compareMode === 'all') && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Model:</span>
                    <span className="ml-2 text-gray-600">{test.modelId}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Dataset:</span>
                    <span className="ml-2 text-gray-600">{test.datasetType}/{test.datasetOption}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Timestamp:</span>
                    <span className="ml-2 text-gray-600">{new Date(test.timestamp).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Response Length:</span>
                    <span className="ml-2 text-gray-600">{test.response.length} chars</span>
                  </div>
                  {test.determinismGrade && (
                    <div>
                      <span className="font-medium text-gray-700">Determinism Grade:</span>
                      <span className={`ml-2 font-bold ${getDeterminismGradeColor(test.determinismGrade.grade)}`}>
                        {test.determinismGrade.grade}
                      </span>
                      {test.determinismGrade.fallbackAnalysis && (
                        <span className="ml-1 text-xs text-yellow-600" title="Statistical analysis">*</span>
                      )}
                    </div>
                  )}

                  {/* Streaming Information */}
                  <div className="pt-2 border-t border-gray-300">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-700">Response Mode:</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        test.isStreamed
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {test.isStreamed ? '⚡ Streamed' : 'Standard'}
                      </span>
                    </div>

                    {/* Streaming Performance Metrics */}
                    {test.isStreamed && test.streamingMetrics && (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        {test.streamingMetrics.streamDuration && (
                          <div>
                            <span className="font-medium text-gray-600">Duration:</span>
                            <span className="ml-1 text-gray-500">{(test.streamingMetrics.streamDuration / 1000).toFixed(1)}s</span>
                          </div>
                        )}
                        {test.streamingMetrics.averageTokensPerSecond && (
                          <div>
                            <span className="font-medium text-gray-600">Speed:</span>
                            <span className="ml-1 text-gray-500">{test.streamingMetrics.averageTokensPerSecond.toFixed(1)} tok/s</span>
                          </div>
                        )}
                        {test.streamingMetrics.firstTokenLatency && (
                          <div>
                            <span className="font-medium text-gray-600">First Token:</span>
                            <span className="ml-1 text-gray-500">{test.streamingMetrics.firstTokenLatency}ms</span>
                          </div>
                        )}
                        {test.streamingMetrics.totalTokens && (
                          <div>
                            <span className="font-medium text-gray-600">Tokens:</span>
                            <span className="ml-1 text-gray-500">{test.streamingMetrics.totalTokens}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Token and Cost Usage */}
                    {test.usage && (
                      <div className="mt-2">
                        <TokenCostDisplay
                          usage={test.usage}
                          showCost={showCostEstimates}
                          compact={true}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tool Usage */}
            {(compareMode === 'metadata' || compareMode === 'tools' || compareMode === 'all') && (
              <div className="mb-4">
                <h5 className="font-medium text-gray-700 mb-2">Tool Usage:</h5>
                {test.toolUsage?.hasToolUsage ? (
                  <div className="space-y-2">
                    {test.toolUsage.toolCalls.map((toolCall, callIndex) => {
                      // Find corresponding tool call in other test for comparison
                      const otherTest = selectedTests.find(t => t.id !== test.id);
                      const otherToolCall = otherTest?.toolUsage?.toolCalls?.[callIndex];
                      const showComparison = selectedTests.length === 2 && highlightDifferences && otherToolCall;

                      return (
                        <div key={callIndex} className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                🔧 {toolCall.toolName}
                              </span>
                              {showComparison && toolCall.toolName !== otherToolCall.toolName && (
                                <span className="text-xs text-red-600 font-medium">
                                  ≠ {otherToolCall.toolName}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-green-600 font-medium">Attempted</span>
                          </div>

                          {/* Tool Parameters */}
                          <div className="space-y-1">
                            <h6 className="text-xs font-medium text-green-700">Parameters:</h6>
                            <div className="bg-white border border-green-200 rounded p-2">
                              {Object.entries(toolCall.input || {}).map(([key, value]) => {
                                const otherValue = otherToolCall?.input?.[key];
                                const comparison = showComparison && otherValue !== undefined
                                  ? compareToolParameters(value, otherValue, key)
                                  : null;

                                return (
                                  <div key={key} className="flex items-start space-x-2 text-xs">
                                    <span className="font-medium text-green-700 min-w-0 flex-shrink-0">
                                      {key}:
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <div className={`${
                                        comparison?.isDifferent ? 'bg-red-50 border border-red-200 rounded px-1' : ''
                                      }`}>
                                        {Array.isArray(value) ? (
                                          <span className="text-green-800">
                                            [{value.map(item => `"${item}"`).join(', ')}]
                                          </span>
                                        ) : typeof value === 'object' ? (
                                          <span className="text-green-800">
                                            {JSON.stringify(value)}
                                          </span>
                                        ) : (
                                          <span className="text-green-800">"{value}"</span>
                                        )}
                                      </div>
                                      {comparison?.isDifferent && (
                                        <div className="mt-1 text-xs text-red-600">
                                          Other test: {Array.isArray(otherValue) ? (
                                            `[${otherValue.map(item => `"${item}"`).join(', ')}]`
                                          ) : typeof otherValue === 'object' ? (
                                            JSON.stringify(otherValue)
                                          ) : (
                                            `"${otherValue}"`
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Tool Use ID */}
                          {toolCall.toolUseId && (
                            <div className="mt-2 text-xs text-green-600">
                              ID: {toolCall.toolUseId}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Available Tools */}
                    {test.toolUsage.availableTools && test.toolUsage.availableTools.length > 0 && (
                      <div className="mt-2 text-xs text-gray-600">
                        Available tools: {test.toolUsage.availableTools.join(', ')}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        No Tools Used
                      </span>
                      {selectedTests.length === 2 && highlightDifferences && (
                        (() => {
                          const otherTest = selectedTests.find(t => t.id !== test.id);
                          const otherHasTools = otherTest?.toolUsage?.hasToolUsage;
                          return otherHasTools ? (
                            <span className="text-xs text-red-600 font-medium">
                              ≠ Other test used tools
                            </span>
                          ) : (
                            <span className="text-xs text-green-600 font-medium">
                              ✓ Both tests used no tools
                            </span>
                          );
                        })()
                      )}
                    </div>
                    {test.toolUsage?.availableTools && test.toolUsage.availableTools.length > 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        Available tools: {test.toolUsage.availableTools.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Prompts */}
            {(compareMode === 'all') && (
              <div className="mb-4">
                <h5 className="font-medium text-gray-700 mb-2">Prompts:</h5>

                {/* System Prompt */}
                {test.systemPrompt && (
                  <div className="mb-2">
                    <h6 className="text-xs font-medium text-gray-600 mb-1">System:</h6>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-2">
                      <pre className="text-xs text-purple-800 whitespace-pre-wrap">
                        {test.systemPrompt}
                      </pre>
                    </div>
                  </div>
                )}

                {/* User Prompt */}
                {test.userPrompt && (
                  <div className="mb-2">
                    <h6 className="text-xs font-medium text-gray-600 mb-1">User:</h6>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                      <pre className="text-xs text-blue-800 whitespace-pre-wrap">
                        {test.userPrompt}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cost Information */}
            {showCostEstimates && (compareMode === 'costs' || compareMode === 'all') && (
              <div className="mb-4">
                <h5 className="font-medium text-gray-700 mb-2">Cost Information:</h5>
                {test.usage ? (
                  <TokenCostDisplay
                    usage={test.usage}
                    showCost={true}
                    compact={false}
                  />
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        No Usage Data
                      </span>
                      {selectedTests.length === 2 && highlightDifferences && (
                        (() => {
                          const otherTest = selectedTests.find(t => t.id !== test.id);
                          const otherHasCost = otherTest?.usage?.cost;
                          return otherHasCost ? (
                            <span className="text-xs text-red-600 font-medium">
                              ≠ Other test has cost data
                            </span>
                          ) : (
                            <span className="text-xs text-green-600 font-medium">
                              ✓ Both tests have no cost data
                            </span>
                          );
                        })()
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Response */}
            {(compareMode === 'responses' || compareMode === 'all') && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-gray-700">Response:</h5>
                  <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded-full">
                    {detectContentType(test.response)}
                  </span>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="p-4 max-h-96 overflow-y-auto">
                    {renderContent(test.response, detectContentType(test.response))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Comparison;
export { exportComparisonData, calculateSimilarity, calculateToolUsageSimilarity };
