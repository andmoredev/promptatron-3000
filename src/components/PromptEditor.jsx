import React, { useState } from 'react'
import PropTypes from 'prop-types'
import HelpTooltip from './HelpTooltip'

const PromptEditor = ({ prompt, onPromptChange, validationError }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const promptTemplates = [
    {
      name: 'Analysis',
      template: 'You are a helpful assistant. Please analyze the following data and provide insights:\n\n'
    },
    {
      name: 'Classification',
      template: 'Please classify the following data into appropriate categories. Provide your reasoning:\n\n'
    },
    {
      name: 'Summarization',
      template: 'Please provide a concise summary of the following data, highlighting key points:\n\n'
    },
    {
      name: 'Question Answering',
      template: 'Based on the following data, please answer questions accurately and provide supporting evidence:\n\n'
    }
  ]

  const handleTemplateSelect = (template) => {
    onPromptChange(template)
  }

  const handleClear = () => {
    onPromptChange('')
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold text-gray-900">Prompt Configuration</h3>
          <HelpTooltip
            content="Write your prompt here. The selected dataset content will be automatically appended to your prompt when the test runs. Use templates for common patterns or write custom prompts."
            position="right"
          />
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
          {prompt && (
            <button
              onClick={handleClear}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Template Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Quick Templates
        </label>
        <div className="flex flex-wrap gap-2">
          {promptTemplates.map((template) => (
            <button
              key={template.name}
              onClick={() => handleTemplateSelect(template.template)}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors duration-200"
            >
              {template.name}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Input */}
      <div className="space-y-2">
        <label htmlFor="prompt-input" className="block text-sm font-medium text-gray-700">
          Your Prompt
        </label>
        <textarea
          id="prompt-input"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Enter your prompt here. The selected dataset will be automatically appended to your prompt when the test runs."
          className={`input-field resize-none ${
            isExpanded ? 'h-64' : 'h-32'
          } transition-all duration-200 ${
            validationError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
          }`}
        />
        {validationError && (
          <p className="mt-1 text-sm text-red-600">{validationError}</p>
        )}
        <div className="flex justify-between items-center text-sm text-gray-500">
          <span>{prompt.length} characters</span>
          <span>Dataset content will be appended automatically</span>
        </div>
      </div>

      {/* Prompt Preview */}
      {prompt && (
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
          <div className="text-sm text-gray-600 max-h-32 overflow-y-auto">
            <div className="whitespace-pre-wrap font-mono bg-white p-2 rounded border">
              {prompt}
              {prompt && !prompt.endsWith('\n') && '\n'}
              <span className="text-gray-400 italic">[Dataset content will be inserted here]</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

PromptEditor.propTypes = {
  prompt: PropTypes.string.isRequired,
  onPromptChange: PropTypes.func.isRequired,
  validationError: PropTypes.string
}

export default PromptEditor