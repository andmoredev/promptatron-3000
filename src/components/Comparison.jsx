import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import ToolUsageDisplay from './ToolUsageDisplay';

const Comparison = ({ selectedTests, onRemoveTest, onClearComparison }) => {
  const [viewMode, setViewMode] = useState('side-by-side'); // 'side-by-side', 'stacked'
  const [compareMode, setCompareMode] = useState('responses'); // 'responses', 'metadata', 'tools', 'all'

  const [highlightDifferences, setHighlightDifferences] = useState(true);

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

  // Calculate similarity between two texts
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

  // Calculate tool usage similarity between two tests
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

  // Calculate meta-agent evaluation similarity between two tests
  const calculateMetaAgentSimilarity = (test1, test2) => {
    const metaAgent1 = test1.metaAgentEvaluation;
    const metaAgent2 = test2.metaAgentEvaluation;

    // If neither has meta-agent evaluation, they're identical (100%)
    if (!metaAgent1 && !metaAgent2) {
      return 100;
    }

    // If only one has meta-agent evaluation, they're completely different (0%)
    if (!metaAgent1 || !metaAgent2) {
      return 0;
    }

    let similarity = 0;
    let factors = 0;

    // Compare overall recommendation (40% weight)
    if (metaAgent1.overallRecommendation === metaAgent2.overallRecommendation) {
      similarity += 40;
    }
    factors += 40;

    // Compare confidence levels (20% weight)
    const confidenceDiff = Math.abs((metaAgent1.overallConfidence || 0) - (metaAgent2.overallConfidence || 0));
    const confidenceSimilarity = Math.max(0, 20 - (confidenceDiff / 5)); // 5% confidence diff = 1 point lost
    similarity += confidenceSimilarity;
    factors += 20;

    // Compare individual agent results (40% weight)
    const agents1 = metaAgent1.agentResults || [];
    const agents2 = metaAgent2.agentResults || [];

    if (agents1.length > 0 && agents2.length > 0) {
      let agentSimilarity = 0;
      let agentCount = 0;

      // Compare each agent type
      const agentTypes = new Set([
        ...agents1.map(a => a.agentType),
        ...agents2.map(a => a.agentType)
      ]);

      agentTypes.forEach(agentType => {
        const agent1 = agents1.find(a => a.agentType === agentType);
        const agent2 = agents2.find(a => a.agentType === agentType);

        if (agent1 && agent2) {
          let typeScore = 0;

          // Same recommendation (50% of agent score)
          if (agent1.recommendation === agent2.recommendation) {
            typeScore += 50;
          }

          // Similar confidence (30% of agent score)
          const agentConfidenceDiff = Math.abs((agent1.confidence || 0) - (agent2.confidence || 0));
          typeScore += Math.max(0, 30 - (agentConfidenceDiff / 3));

          // Similar analysis content (20% of agent score)
          if (agent1.analysis && agent2.analysis) {
            const analysisWords1 = agent1.analysis.toLowerCase().split(/\s+/);
            const analysisWords2 = agent2.analysis.toLowerCase().split(/\s+/);
            const commonWords = analysisWords1.filter(word => analysisWords2.includes(word));
            const totalWords = new Set([...analysisWords1, ...analysisWords2]).size;

            if (totalWords > 0) {
              typeScore += (commonWords.length / totalWords) * 20;
            }
          }

          agentSimilarity += typeScore;
          agentCount++;
        }
      });

      if (agentCount > 0) {
        similarity += (agentSimilarity / agentCount) * 0.4; // 40% weight for agent results
      }
    }
    factors += 40;

    return Math.round(similarity);
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
          <button
            onClick={onClearComparison}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Clear All
          </button>
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
            <button
              onClick={() => setCompareMode('meta-agents')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${compareMode === 'meta-agents'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Meta-Agents
            </button>
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

        {/* Meta-Agent Comparison */}
        {selectedTests.length === 2 && (selectedTests[0].metaAgentEvaluation || selectedTests[1].metaAgentEvaluation) && (
          <div className="mb-4 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-indigo-900">Meta-Agent Evaluation Comparison</span>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-indigo-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${(() => {
                      const similarity = calculateMetaAgentSimilarity(selectedTests[0], selectedTests[1]);
                      return similarity >= 80 ? 'bg-green-500' :
                             similarity >= 60 ? 'bg-yellow-500' :
                             similarity >= 40 ? 'bg-orange-500' : 'bg-red-500';
                    })()}`}
                    style={{ width: `${calculateMetaAgentSimilarity(selectedTests[0], selectedTests[1])}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-indigo-900">
                  {calculateMetaAgentSimilarity(selectedTests[0], selectedTests[1])}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              {selectedTests.map((test, index) => (
                <div key={test.id} className="space-y-1">
                  <div className="font-medium text-indigo-800">Test {String.fromCharCode(65 + index)}</div>
                  {test.metaAgentEvaluation ? (
                    <>
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          test.metaAgentEvaluation.overallRecommendation === 'accept'
                            ? 'bg-green-100 text-green-800'
                            : test.metaAgentEvaluation.overallRecommendation === 'reject'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          🤖 {test.metaAgentEvaluation.overallRecommendation.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-indigo-700">
                        Confidence: {test.metaAgentEvaluation.overallConfidence}%
                      </div>
                      {test.metaAgentEvaluation.agentResults && (
                        <div className="text-indigo-600">
                          Agents: {test.metaAgentEvaluation.agentResults.map(a => a.agentType).join(', ')}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        No Meta-Agent Evaluation
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Meta-Agent Status */}
            <div className="mt-2 text-xs text-indigo-700">
              {(() => {
                const [test1, test2] = selectedTests;
                const hasMetaAgent1 = !!test1.metaAgentEvaluation;
                const hasMetaAgent2 = !!test2.metaAgentEvaluation;

                if (!hasMetaAgent1 && !hasMetaAgent2) {
                  return (
                    <div className="flex items-center space-x-1">
                      <span>➖</span>
                      <span>Neither test has meta-agent evaluation</span>
                    </div>
                  );
                } else if (!hasMetaAgent1 || !hasMetaAgent2) {
                  return (
                    <div className="flex items-center space-x-1">
                      <span>❌</span>
                      <span>Only one test has meta-agent evaluation</span>
                    </div>
                  );
                } else {
                  const sameRecommendation = test1.metaAgentEvaluation.overallRecommendation === test2.metaAgentEvaluation.overallRecommendation;
                  const confidenceDiff = Math.abs(
                    (test1.metaAgentEvaluation.overallConfidence || 0) -
                    (test2.metaAgentEvaluation.overallConfidence || 0)
                  );

                  if (sameRecommendation && confidenceDiff <= 10) {
                    return (
                      <div className="flex items-center space-x-1">
                        <span>✅</span>
                        <span>Similar meta-agent evaluations</span>
                      </div>
                    );
                  } else if (sameRecommendation) {
                    return (
                      <div className="flex items-center space-x-1">
                        <span>⚠️</span>
                        <span>Same recommendation, different confidence levels</span>
                      </div>
                    );
                  } else {
                    return (
                      <div className="flex items-center space-x-1">
                        <span>❌</span>
                        <span>Different meta-agent recommendations</span>
                      </div>
                    );
                  }
                }
              })()}
            </div>
          </div>
        )}

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

                  {/* Guardrail Information */}
                  {(test.guardrailsEnabled || test.guardrailResults || test.stopReason === 'guardrail_intervened') && (
                    <div>
                      <span className="font-medium text-gray-700">Guardrails:</span>
                      <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        (test.guardrailResults?.hasViolations || test.guardrailResults?.action === 'INTERVENED' || test.stopReason === 'guardrail_intervened')
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        🛡️ {(test.guardrailResults?.hasViolations || test.guardrailResults?.action === 'INTERVENED' || test.stopReason === 'guardrail_intervened')
                          ? 'Intervened'
                          : 'Passed'}
                      </span>
                      {test.guardrailResults?.violations && test.guardrailResults.violations.length > 0 && (
                        <span className="ml-1 text-xs text-orange-600">
                          ({test.guardrailResults.violations.length} violations)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Stop Reason */}
                  {test.stopReason && test.stopReason !== 'end_turn' && (
                    <div>
                      <span className="font-medium text-gray-700">Stop Reason:</span>
                      <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        test.stopReason === 'guardrail_intervened'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {test.stopReason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </div>
                  )}

                  {/* Meta-Agent Evaluation */}
                  {test.metaAgentEvaluation && (
                    <div>
                      <span className="font-medium text-gray-700">Meta-Agent Evaluation:</span>
                      <div className="ml-2 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            test.metaAgentEvaluation.overallRecommendation === 'accept'
                              ? 'bg-green-100 text-green-800'
                              : test.metaAgentEvaluation.overallRecommendation === 'reject'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            🤖 {test.metaAgentEvaluation.overallRecommendation.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-600">
                            {test.metaAgentEvaluation.overallConfidence}% confidence
                          </span>
                        </div>
                        {test.metaAgentEvaluation.agentResults && test.metaAgentEvaluation.agentResults.length > 0 && (
                          <div className="text-xs text-gray-600">
                            Agents: {test.metaAgentEvaluation.agentResults.map(a => a.agentType.replace('-', ' ')).join(', ')}
                          </div>
                        )}
                      </div>
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

                    {/* Token Usage */}
                    {test.usage && (
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="font-medium text-gray-600">Input:</span>
                          <span className="ml-1 text-gray-500">{test.usage.input_tokens || test.usage.inputTokens || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Output:</span>
                          <span className="ml-1 text-gray-500">{test.usage.output_tokens || test.usage.outputTokens || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Total:</span>
                          <span className="ml-1 text-gray-500">{test.usage.total_tokens || test.usage.totalTokens || 'N/A'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Meta-Agent Evaluation */}
            {(compareMode === 'metadata' || compareMode === 'meta-agents' || compareMode === 'all') && test.metaAgentEvaluation && (
              <div className="mb-4">
                <h5 className="font-medium text-gray-700 mb-2">Meta-Agent Evaluation:</h5>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  {/* Overall Recommendation */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-indigo-800">Overall Recommendation:</span>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        test.metaAgentEvaluation.overallRecommendation === 'accept'
                          ? 'bg-green-100 text-green-800'
                          : test.metaAgentEvaluation.overallRecommendation === 'reject'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {test.metaAgentEvaluation.overallRecommendation.toUpperCase()}
                      </span>
                      <span className="text-xs text-indigo-600">
                        {test.metaAgentEvaluation.overallConfidence}% confidence
                      </span>
                    </div>
                  </div>

                  {/* Individual Agent Results */}
                  {test.metaAgentEvaluation.agentResults && test.metaAgentEvaluation.agentResults.length > 0 && (
                    <div className="space-y-2">
                      <h6 className="text-xs font-medium text-indigo-700">Individual Agent Results:</h6>
                      {test.metaAgentEvaluation.agentResults.map((agentResult, agentIndex) => (
                        <div key={agentIndex} className="bg-white border border-indigo-200 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-indigo-900 capitalize">
                              {agentResult.agentType.replace('-', ' ')}
                            </span>
                            <div className="flex items-center space-x-1">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                agentResult.recommendation === 'accept'
                                  ? 'bg-green-100 text-green-800'
                                  : agentResult.recommendation === 'reject'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {agentResult.recommendation}
                              </span>
                              <span className="text-xs text-indigo-600">
                                {agentResult.confidence}%
                              </span>
                            </div>
                          </div>

                          {agentResult.analysis && (
                            <div className="text-xs text-gray-700 mt-1">
                              <div className="bg-gray-50 p-1 rounded text-xs line-clamp-2">
                                {agentResult.analysis}
                              </div>
                            </div>
                          )}

                          {/* Agent-specific details */}
                          {agentResult.details && (
                            <div className="text-xs text-gray-600 mt-1">
                              {agentResult.details.qualityScore && (
                                <div>Quality Score: {agentResult.details.qualityScore}/100</div>
                              )}
                              {agentResult.details.findings && agentResult.details.findings.length > 0 && (
                                <div>Findings: {agentResult.details.findings.length} items</div>
                              )}
                              {agentResult.details.safetyIssues && agentResult.details.safetyIssues.length > 0 && (
                                <div className="text-red-600">Safety Issues: {agentResult.details.safetyIssues.length} items</div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Evaluation Metadata */}
                  {test.metaAgentEvaluation.metadata && (
                    <div className="text-xs text-indigo-600 border-t border-indigo-200 pt-2 mt-2">
                      {test.metaAgentEvaluation.metadata.scenarioId && (
                        <div>Scenario: {test.metaAgentEvaluation.metadata.scenarioId}</div>
                      )}
                      {test.metaAgentEvaluation.metadata.evaluationDuration && (
                        <div>Duration: {test.metaAgentEvaluation.metadata.evaluationDuration}ms</div>
                      )}
                    </div>
                  )}
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
