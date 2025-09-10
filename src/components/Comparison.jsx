import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

const Comparison = ({ selectedTests, onRemoveTest, onClearComparison }) => {
  const [viewMode, setViewMode] = useState('side-by-side') // 'side-by-side', 'stacked'
  const [compareMode, setCompareMode] = useState('responses') // 'responses', 'metadata', 'all'
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [highlightDifferences, setHighlightDifferences] = useState(true)

  // Detect content type for formatting
  const detectContentType = (text) => {
    const trimmed = text.trim()

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed)
        return 'json'
      } catch (e) {
        // Not valid JSON
      }
    }

    if (trimmed.startsWith('<') && trimmed.includes('>')) {
      return 'xml'
    }

    if (trimmed.includes('```') || trimmed.includes('##') || trimmed.includes('**')) {
      return 'markdown'
    }

    return 'text'
  }

  // Format JSON with proper indentation
  const formatJSON = (text) => {
    try {
      const parsed = JSON.parse(text.trim())
      return JSON.stringify(parsed, null, 2)
    } catch (e) {
      return text
    }
  }

  // Calculate similarity between two texts
  const calculateSimilarity = (text1, text2) => {
    const words1 = text1.toLowerCase().split(/\s+/)
    const words2 = text2.toLowerCase().split(/\s+/)
    const allWords = new Set([...words1, ...words2])

    let commonWords = 0
    allWords.forEach(word => {
      if (words1.includes(word) && words2.includes(word)) {
        commonWords++
      }
    })

    return Math.round((commonWords / allWords.size) * 100)
  }

  // Custom components for ReactMarkdown
  const markdownComponents = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '')
      const language = match ? match[1] : 'text'

      return !inline ? (
        <SyntaxHighlighter
          style={isDarkMode ? oneDark : oneLight}
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
      )
    }
  }

  // Render formatted content
  const renderContent = (text, contentType) => {
    switch (contentType) {
      case 'json':
        return (
          <SyntaxHighlighter
            language="json"
            style={isDarkMode ? oneDark : oneLight}
            className="rounded-md text-sm"
            customStyle={{ margin: 0, fontSize: '12px', lineHeight: '1.4' }}
          >
            {formatJSON(text)}
          </SyntaxHighlighter>
        )

      case 'xml':
        return (
          <SyntaxHighlighter
            language="xml"
            style={isDarkMode ? oneDark : oneLight}
            className="rounded-md text-sm"
            customStyle={{ margin: 0, fontSize: '12px', lineHeight: '1.4' }}
          >
            {text}
          </SyntaxHighlighter>
        )

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
        )

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
        )
    }
  }

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
    )
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
    )
  }

  const similarity = selectedTests.length === 2
    ? calculateSimilarity(selectedTests[0].response, selectedTests[1].response)
    : null

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
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'side-by-side'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Side by Side
            </button>
            <button
              onClick={() => setViewMode('stacked')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'stacked'
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
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                compareMode === 'responses'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Responses
            </button>
            <button
              onClick={() => setCompareMode('metadata')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                compareMode === 'metadata'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Metadata
            </button>
            <button
              onClick={() => setCompareMode('all')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                compareMode === 'all'
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

            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-1 text-gray-500 hover:text-gray-700 rounded"
              title={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>
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
                    className={`h-2 rounded-full ${
                      similarity >= 80 ? 'bg-green-500' :
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
      </div>

      {/* Comparison Content */}
      <div className={`${viewMode === 'side-by-side' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'space-y-6'}`}>
        {selectedTests.map((test, index) => (
          <div key={test.id} className="card">
            {/* Test Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium text-white ${
                  index === 0 ? 'bg-blue-500' :
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
                </div>
              </div>
            )}

            {/* Prompt */}
            {(compareMode === 'all') && (
              <div className="mb-4">
                <h5 className="font-medium text-gray-700 mb-2">Prompt:</h5>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <pre className="text-sm text-blue-800 whitespace-pre-wrap">
                    {test.prompt}
                  </pre>
                </div>
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
  )
}

export default Comparison