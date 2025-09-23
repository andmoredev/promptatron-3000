import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import DeterminismEvaluator from './DeterminismEvaluator';
import StreamingOutput from './StreamingOutput';
import ToolUsageDisplay from './ToolUsageDisplay';
import ToolConfigurationStatus from './ToolConfigurationStatus';
import { uiErrorRecovery } from '../utils/uiErrorRecovery';
import { useModelOutput } from '../hooks/useModelOutput';

import PropTypes from 'prop-types';

// Reusable copy button component with feedback
const CopyButton = ({ content, label = "Copy", className = "", icon = true }) => {
  const [copyStatus, setCopyStatus] = useState(null); // 'success', 'error', or null

  const handleCopy = async () => {
    if (!content) return;

    try {
      await navigator.clipboard.writeText(content);
      setCopyStatus('success');
      setTimeout(() => setCopyStatus(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      setCopyStatus('error');

      // Try fallback copy method
      try {
        const textArea = document.createElement('textarea');
        textArea.value = content;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopyStatus('success');
        setTimeout(() => setCopyStatus(null), 2000);
      } catch (fallbackError) {
        console.error('Fallback copy also failed:', fallbackError);
        setTimeout(() => setCopyStatus(null), 3000);
      }
    }
  };

  const getButtonText = () => {
    if (copyStatus === 'success') return 'Copied!';
    if (copyStatus === 'error') return 'Copy Failed';
    return label;
  };

  const getButtonIcon = () => {
    if (copyStatus === 'success') {
      return (
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    }

    if (copyStatus === 'error') {
      return (
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    }

    return (
      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    );
  };

  const baseClassName = className || "inline-flex items-center px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors";
  const statusClassName = copyStatus === 'success'
    ? "bg-green-100 text-green-700 hover:bg-green-200"
    : copyStatus === 'error'
      ? "bg-red-100 text-red-700 hover:bg-red-200"
      : "";

  return (
    <button
      onClick={handleCopy}
      disabled={!content}
      className={`${baseClassName} ${statusClassName}`}
      title={`${label} to clipboard`}
    >
      {icon && getButtonIcon()}
      {getButtonText()}
    </button>
  );
};

CopyButton.propTypes = {
  content: PropTypes.string,
  label: PropTypes.string,
  className: PropTypes.string,
  icon: PropTypes.bool
};

const TestResults = ({
  results,
  isLoading,
  determinismEnabled,
  onEvaluationComplete,
  isStreaming = false,
  streamingContent = '',
  streamingProgress = null,
  streamingError = null,
  streamingToolUsage = { detected: false, activeTools: [], completedTools: [] }
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState('formatted'); // 'formatted', 'raw', 'markdown'
  const [displayError, setDisplayError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Use model output manager for state persistence and error recovery
  const {
    outputState,
    isDisplaying,
    hasError,
    handleDisplayError,
    restoreState,
    getCurrentOutput
  } = useModelOutput();



  // Monitor for text wrapping issues when results change
  useEffect(() => {
    if (results) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        uiErrorRecovery.monitorTextOverflow('.system-prompt-display', 'system-prompt');
        uiErrorRecovery.monitorTextOverflow('.test-results-prompt', 'user-prompt');
      }, 100);
    }
  }, [results]);

  // Handle display errors with recovery - DISABLED to prevent false positives
  // This was causing issues when streaming completed, triggering error recovery incorrectly
  // useEffect(() => {
  //   // Only trigger error recovery if we have a complete test result but missing response
  //   if (results && results.id && results.modelId && results.timestamp &&
  //       (!results.response || results.response.trim() === '') &&
  //       !isLoading && !isStreaming) {
  //     // Error detection logic disabled
  //   }
  // }, [results, isLoading, isStreaming, handleDisplayError])

  // Attempt to restore state when navigating back to test results
  useEffect(() => {
    if (!results && !isLoading && !isStreaming) {
      // Try to restore the last displayed output
      const restored = restoreState();
      if (restored && restored.output) {
        console.log('TestResults: Restored previous output state');
      }
    }
  }, [results, isLoading, isStreaming, restoreState]);


  // Handle copy functionality for streaming output
  const handleStreamingCopy = (content) => {
    console.log('Streaming content copied:', content.length, 'characters');
  };

  // Handle retry for display errors
  const handleRetry = () => {
    setDisplayError(null);
    setRetryCount(prev => prev + 1);

    // Attempt to restore state or clear error
    const restored = restoreState();
    if (!restored) {
      // If restoration fails, try to recover from the current results
      if (results) {
        const error = new Error('Retry attempt for model output display');
        handleDisplayError(error, {
          component: 'TestResults',
          testId: results.id,
          retryAttempt: retryCount + 1
        });
      }
    }
  };

  // Get the output to display (prioritize restored state over props)
  const getDisplayOutput = () => {
    // During streaming, always use streaming content
    if (isStreaming || streamingContent) {
      return streamingContent;
    }

    // If we have results, use them
    if (results && results.response) {
      return results.response;
    }

    // Try to get output from state manager
    const currentOutput = getCurrentOutput();
    if (currentOutput) {
      return currentOutput;
    }

    return null;
  };

  // Get the results to display (merge with restored state if needed)
  const getDisplayResults = () => {
    if (results) {
      return results;
    }

    // If no results but we have restored state, create a minimal results object
    if (outputState && outputState.output) {
      return {
        id: outputState.testId,
        response: outputState.output,
        systemPrompt: outputState.systemPrompt,
        userPrompt: outputState.userPrompt,
        modelId: outputState.modelId,
        usage: outputState.usage,
        isStreamed: outputState.isStreamed,
        streamingMetrics: outputState.streamingMetrics,
        timestamp: outputState.timestamp
      };
    }

    return null;
  };

  const displayOutput = getDisplayOutput();
  const displayResults = getDisplayResults();

  // Show streaming interface during active streaming or when there's streaming content
  if (isStreaming || (streamingContent && !results)) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Results</h3>

        {/* Show streaming error if present */}
        {streamingError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{streamingError}</p>
              </div>
            </div>
          </div>
        )}

        <StreamingOutput
          content={streamingContent}
          isStreaming={isStreaming}
          isComplete={!isStreaming && streamingContent}
          onCopy={handleStreamingCopy}
          streamingProgress={streamingProgress}
          streamingToolUsage={streamingToolUsage}
          performanceMetrics={{
            renderCount: 0, // This will be tracked internally by StreamingOutput
            averageLatency: streamingProgress?.firstTokenLatency || 0,
            memoryUsage: streamingContent ? new Blob([streamingContent]).size : 0
          }}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Results</h3>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-600">Running test...</p>
            <p className="text-sm text-gray-500 mt-1">This may take a few moments</p>
          </div>
        </div>
      </div>
    );
  }

  // Show display error with retry option
  if (displayError) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Results</h3>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800">Model Output Display Error</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{displayError}</p>
                {retryCount > 0 && (
                  <p className="mt-1 text-xs">Retry attempts: {retryCount}</p>
                )}
              </div>
              <div className="mt-4">
                <div className="flex space-x-3">
                  <button
                    onClick={handleRetry}
                    className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  >
                    Retry Display
                  </button>
                  <button
                    onClick={() => setDisplayError(null)}
                    className="bg-white px-3 py-2 rounded-md text-sm font-medium text-red-800 border border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Show any available output despite the error */}
        {displayOutput && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="text-sm font-medium text-yellow-800 mb-2">Recovered Output:</h4>
            <div className="text-sm text-yellow-700 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
              {displayOutput.substring(0, 500)}
              {displayOutput.length > 500 && '...'}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!displayResults) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Results</h3>
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-600">No test results yet</p>
          <p className="text-sm text-gray-500 mt-1">Configure your test and click "Run Test" to see results</p>
        </div>
      </div>
    );
  }

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  // Detect if response contains structured data
  const detectContentType = (text) => {
    const trimmed = text.trim();

    // Check for JSON
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch (e) {
        // Not valid JSON
      }
    }

    // Check for XML/HTML
    if (trimmed.startsWith('<') && trimmed.includes('>')) {
      return 'xml';
    }

    // Check for code blocks or markdown
    if (trimmed.includes('```') || trimmed.includes('##') || trimmed.includes('**')) {
      return 'markdown';
    }

    // Check for SQL
    if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(trimmed)) {
      return 'sql';
    }

    // Check for Python
    if (/\b(def |import |from |class |if __name__|print\()/i.test(trimmed)) {
      return 'python';
    }

    // Check for JavaScript
    if (/\b(function|const|let|var|=>|console\.log)/i.test(trimmed)) {
      return 'javascript';
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
          className="rounded-md"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      );
    },
    pre({ children }) {
      return <div className="overflow-x-auto">{children}</div>;
    },
    table({ children }) {
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 border border-gray-300 rounded-lg">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }) {
      return <thead className="bg-gray-50">{children}</thead>;
    },
    th({ children }) {
      return (
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
          {children}
        </th>
      );
    },
    td({ children }) {
      return (
        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 border-b border-gray-100">
          {children}
        </td>
      );
    },
    blockquote({ children }) {
      return (
        <blockquote className="border-l-4 border-blue-500 pl-4 py-2 bg-blue-50 my-4 italic">
          {children}
        </blockquote>
      );
    },
    h1({ children }) {
      return <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-4">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="text-xl font-semibold text-gray-800 mt-5 mb-3">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">{children}</h3>;
    },
    ul({ children }) {
      return <ul className="list-disc list-inside space-y-1 my-3">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="list-decimal list-inside space-y-1 my-3">{children}</ol>;
    },
    li({ children }) {
      return <li className="text-gray-700">{children}</li>;
    },
    p({ children }) {
      return <p className="text-gray-700 leading-relaxed my-2">{children}</p>;
    },
    strong({ children }) {
      return <strong className="font-semibold text-gray-900">{children}</strong>;
    },
    em({ children }) {
      return <em className="italic text-gray-700">{children}</em>;
    }
  };

  return (
    <div className="card test-results">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold text-gray-900">Test Results</h3>
        </div>
        <div className="flex items-center space-x-3">
          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('formatted')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'formatted'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Formatted
            </button>
            <button
              onClick={() => setViewMode('markdown')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'markdown'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Markdown
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'raw'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Raw
            </button>
          </div>



          {/* Expand/Collapse */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>



      {/* Prompt Display */}
      <div className="mb-4">
        <h4 className="font-medium text-gray-700 mb-2">Prompts Used:</h4>

        {/* System Prompt */}
        {displayResults.systemPrompt && (
          <div className="mb-3">
            <h5 className="text-sm font-medium text-gray-600 mb-1">System Prompt:</h5>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 gradient-safe">
              <div className="text-sm text-purple-800 font-mono system-prompt-display text-safe">
                {displayResults.systemPrompt}
              </div>
            </div>
          </div>
        )}

        {/* User Prompt */}
        {displayResults.userPrompt && (
          <div className="mb-3">
            <h5 className="text-sm font-medium text-gray-600 mb-1">User Prompt:</h5>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 gradient-safe">
              <div className="text-sm text-blue-800 font-mono test-results-prompt text-safe">
                {displayResults.userPrompt}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Response Display */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-gray-700">Model Response:</h4>
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <span className="px-2 py-1 bg-gray-100 rounded-full">
              {detectContentType(displayOutput || displayResults.response)}
            </span>
            {viewMode === 'formatted' && detectContentType(displayOutput || displayResults.response) !== 'text' && (
              <span className="text-green-600">✓ Auto-formatted</span>
            )}
            {outputState.testId && outputState.testId !== displayResults.id && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                Restored
              </span>
            )}
          </div>
        </div>

        <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${isExpanded ? 'max-h-none' : 'max-h-96'
          }`}>
          <div className={`${isExpanded ? '' : 'overflow-y-auto max-h-96'}`}>
            {viewMode === 'raw' && (
              <div className="p-4">
                <pre className="whitespace-pre-wrap break-words text-sm text-gray-800 font-mono leading-relaxed">
                  {displayOutput || displayResults.response}
                </pre>
              </div>
            )}

            {viewMode === 'markdown' && (
              <div className="p-4 prose prose-sm max-w-none test-results-prompt">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={markdownComponents}
                >
                  {displayOutput || displayResults.response}
                </ReactMarkdown>
              </div>
            )}

            {viewMode === 'formatted' && (
              <div className="p-4 test-results-prompt">
                {(() => {
                  const responseText = displayOutput || displayResults.response;
                  const contentType = detectContentType(responseText);

                  switch (contentType) {
                    case 'json':
                      return (
                        <SyntaxHighlighter
                          language="json"
                          style={oneLight}
                          className="rounded-md"
                          customStyle={{
                            margin: 0,
                            fontSize: '14px',
                            lineHeight: '1.5'
                          }}
                        >
                          {formatJSON(responseText)}
                        </SyntaxHighlighter>
                      );

                    case 'xml':
                      return (
                        <SyntaxHighlighter
                          language="xml"
                          style={oneLight}
                          className="rounded-md"
                          wrapLongLines={true}
                          customStyle={{
                            margin: 0,
                            fontSize: '14px',
                            lineHeight: '1.5',
                            overflowX: "hidden"
                          }}
                          codeTagProps={{
                            style: {
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              overflowWrap: "anywhere"
                            }
                          }}
                        >
                          {responseText}
                        </SyntaxHighlighter>
                      );

                    case 'python':
                      return (
                        <SyntaxHighlighter
                          language="python"
                          style={oneLight}
                          className="rounded-md"
                          customStyle={{
                            margin: 0,
                            fontSize: '14px',
                            lineHeight: '1.5'
                          }}
                        >
                          {responseText}
                        </SyntaxHighlighter>
                      );

                    case 'javascript':
                      return (
                        <SyntaxHighlighter
                          language="javascript"
                          style={oneLight}
                          className="rounded-md"
                          customStyle={{
                            margin: 0,
                            fontSize: '14px',
                            lineHeight: '1.5'
                          }}
                        >
                          {responseText}
                        </SyntaxHighlighter>
                      );

                    case 'sql':
                      return (
                        <SyntaxHighlighter
                          language="sql"
                          style={oneLight}
                          className="rounded-md"
                          customStyle={{
                            margin: 0,
                            fontSize: '14px',
                            lineHeight: '1.5'
                          }}
                        >
                          {responseText}
                        </SyntaxHighlighter>
                      );

                    case 'markdown':
                      return (
                        <div className="prose prose-sm max-w-none test-results-prompt">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeRaw]}
                            components={markdownComponents}
                          >
                            {responseText}
                          </ReactMarkdown>
                        </div>
                      );

                    default:
                      return (
                        <div className="space-y-4 test-results-prompt">
                          {responseText.split('\n\n').map((paragraph, index) => (
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
                })()}
              </div>
            )}
          </div>

          {/* Scroll indicator for collapsed view */}
          {!isExpanded && (
            <div className="scroll-indicator-gradient" />
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex space-x-2">
            <CopyButton
              content={displayOutput || displayResults.response}
              label="Copy Output"
              className="btn-secondary"
            />

            {detectContentType(displayOutput || displayResults.response) === 'json' && (
              <CopyButton
                content={(() => {
                  try {
                    return formatJSON(displayOutput || displayResults.response);
                  } catch (e) {
                    return displayOutput || displayResults.response;
                  }
                })()}
                label="Copy JSON"
                className="inline-flex items-center px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              />
            )}
          </div>

          <div className="text-xs text-gray-500">
            {!isExpanded && (displayOutput || displayResults.response).length > 1000 && (
              <span>Showing preview • Click expand to see full response</span>
            )}
          </div>
        </div>
      </div>

      {/* Tool Usage Section */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <h4 className="font-medium text-gray-700 mb-3">Tool Usage:</h4>
        <ToolUsageDisplay toolUsage={displayResults.toolUsage} />
      </div>

      {/* Response Stats */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {(displayOutput || displayResults.response).length.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">Characters</div>
          </div>

          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {(displayOutput || displayResults.response).split(/\s+/).filter(word => word.length > 0).length.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">Words</div>
          </div>

          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {(displayOutput || displayResults.response).split('\n').length.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">Lines</div>
          </div>

          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {Math.ceil((displayOutput || displayResults.response).length / 4).toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">Est. Tokens</div>
          </div>

          {displayResults.usage && (
            <>
              {displayResults.usage.input_tokens && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-blue-600">
                    {displayResults.usage.input_tokens.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Input Tokens</div>
                </div>
              )}
              {displayResults.usage.output_tokens && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-green-600">
                    {displayResults.usage.output_tokens.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Output Tokens</div>
                </div>
              )}
              {displayResults.usage.total_tokens && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-purple-600">
                    {displayResults.usage.total_tokens.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Total Tokens</div>
                </div>
              )}
            </>
          )}

          {/* Show streaming metrics if available */}
          {displayResults.streamingMetrics && (
            <>
              {displayResults.streamingMetrics.streamDuration && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-primary-600">
                    {displayResults.streamingMetrics.streamDuration.toFixed(1)}s
                  </div>
                  <div className="text-xs text-gray-500">Stream Duration</div>
                </div>
              )}
              {displayResults.streamingMetrics.averageTokensPerSecond && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-primary-600">
                    {displayResults.streamingMetrics.averageTokensPerSecond.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">Tokens/Second</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Determinism Evaluation */}
        {determinismEnabled && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <DeterminismEvaluator
              testResult={displayResults}
              enabled={determinismEnabled}
              onEvaluationComplete={onEvaluationComplete}
            />
          </div>
        )}
      </div>


    </div>
  );
};

TestResults.propTypes = {
  results: PropTypes.shape({
    id: PropTypes.string,
    modelId: PropTypes.string,
    systemPrompt: PropTypes.string,
    userPrompt: PropTypes.string,
    datasetType: PropTypes.string,
    datasetOption: PropTypes.string,
    response: PropTypes.string,
    usage: PropTypes.object,
    isStreamed: PropTypes.bool,
    streamingMetrics: PropTypes.object,
    timestamp: PropTypes.string,
    toolUsage: PropTypes.shape({
      hasToolUsage: PropTypes.bool,
      toolCalls: PropTypes.arrayOf(PropTypes.shape({
        toolName: PropTypes.string,
        toolUseId: PropTypes.string,
        input: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
        attempted: PropTypes.bool,
        timestamp: PropTypes.string
      })),
      toolCallCount: PropTypes.number,
      availableTools: PropTypes.arrayOf(PropTypes.string)
    }),
    toolConfigurationStatus: PropTypes.shape({
      hasToolConfig: PropTypes.bool,
      fallbackMode: PropTypes.bool,
      message: PropTypes.string,
      errors: PropTypes.arrayOf(PropTypes.string),
      warnings: PropTypes.arrayOf(PropTypes.string),
      gracefulDegradation: PropTypes.bool,
      validationResult: PropTypes.object,
      toolsAvailable: PropTypes.arrayOf(PropTypes.string)
    })
  }),
  isLoading: PropTypes.bool,
  determinismEnabled: PropTypes.bool,
  onEvaluationComplete: PropTypes.func,
  isStreaming: PropTypes.bool,
  streamingContent: PropTypes.string,
  streamingProgress: PropTypes.shape({
    tokensReceived: PropTypes.number,
    estimatedTotal: PropTypes.number,
    startTime: PropTypes.number,
    tokensPerSecond: PropTypes.number,
    duration: PropTypes.number
  }),
  streamingError: PropTypes.string,
  streamingToolUsage: PropTypes.shape({
    detected: PropTypes.bool,
    activeTools: PropTypes.arrayOf(PropTypes.shape({
      name: PropTypes.string,
      toolUseId: PropTypes.string,
      status: PropTypes.string,
      currentInput: PropTypes.object,
      timestamp: PropTypes.string
    })),
    completedTools: PropTypes.arrayOf(PropTypes.shape({
      name: PropTypes.string,
      toolUseId: PropTypes.string,
      input: PropTypes.object,
      status: PropTypes.string,
      timestamp: PropTypes.string
    }))
  })
};

TestResults.defaultProps = {
  results: null,
  isLoading: false,
  determinismEnabled: false,
  onEvaluationComplete: null,
  isStreaming: false,
  streamingContent: '',
  streamingProgress: null,
  streamingError: null
};

export default TestResults;
