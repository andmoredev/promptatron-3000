import { useState } from 'react'
import PropTypes from 'prop-types'
import HelpTooltip from './HelpTooltip'

const PromptEditor = ({
  systemPrompt = '',
  userPrompt = '',
  onSystemPromptChange,
  onUserPromptChange,
  systemPromptError,
  userPromptError,
  // Legacy props for backward compatibility
  prompt,
  onPromptChange,
  validationError
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState('system')

  // Determine if we're in legacy single prompt mode
  const isLegacyMode = prompt !== undefined && onPromptChange && !onSystemPromptChange && !onUserPromptChange

  const systemPromptTemplates = [
    {
      name: 'Data Analyst',
      template: 'You are an expert data analyst with deep knowledge of fraud detection patterns. Your role is to analyze data systematically and provide clear, actionable insights based on statistical evidence and domain expertise.'
    },
    {
      name: 'Classification Expert',
      template: 'You are a classification specialist trained to categorize data accurately. You should examine each data point carefully and assign appropriate categories based on established criteria, providing reasoning for your decisions.'
    },
    {
      name: 'Security Analyst',
      template: 'You are a cybersecurity expert specializing in fraud detection and risk assessment. Your role is to identify potential security threats and anomalies in data patterns with high accuracy and detailed explanations.'
    },
    {
      name: 'Business Intelligence',
      template: 'You are a business intelligence analyst focused on extracting meaningful insights from data to support decision-making. Provide clear, business-focused analysis with actionable recommendations.'
    }
  ]

  const userPromptTemplates = [
    {
      name: 'Analyze Data',
      template: 'Please analyze the following data and provide insights about patterns, anomalies, and key findings:\n\n'
    },
    {
      name: 'Classify Records',
      template: 'Please classify the following data records into appropriate categories. Provide your reasoning for each classification:\n\n'
    },
    {
      name: 'Detect Fraud',
      template: 'Please examine the following data for potential fraud indicators. Highlight suspicious patterns and explain your reasoning:\n\n'
    },
    {
      name: 'Summarize Findings',
      template: 'Please provide a concise summary of the following data, highlighting the most important findings and trends:\n\n'
    },
    {
      name: 'Answer Questions',
      template: 'Based on the following data, please answer questions accurately and provide supporting evidence from the data:\n\n'
    }
  ]

  // Legacy templates for backward compatibility
  const legacyPromptTemplates = [
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

  const handleSystemTemplateSelect = (template) => {
    if (onSystemPromptChange && typeof onSystemPromptChange === 'function') {
      onSystemPromptChange(template)
    }
  }

  const handleUserTemplateSelect = (template) => {
    if (onUserPromptChange && typeof onUserPromptChange === 'function') {
      onUserPromptChange(template)
    }
  }

  const handleLegacyTemplateSelect = (template) => {
    if (onPromptChange && typeof onPromptChange === 'function') {
      onPromptChange(template)
    }
  }

  const handleClearSystem = () => {
    if (onSystemPromptChange && typeof onSystemPromptChange === 'function') {
      onSystemPromptChange('')
    }
  }

  const handleClearUser = () => {
    if (onUserPromptChange && typeof onUserPromptChange === 'function') {
      onUserPromptChange('')
    }
  }

  const handleClearLegacy = () => {
    if (onPromptChange && typeof onPromptChange === 'function') {
      onPromptChange('')
    }
  }

  // Legacy single prompt mode
  if (isLegacyMode) {
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
                onClick={handleClearLegacy}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Template Selection */}
        <div className="mb-4">
          <span className="block text-sm font-medium text-gray-700 mb-2">
            Quick Templates
          </span>
          <div className="flex flex-wrap gap-2">
            {legacyPromptTemplates.map((template) => (
              <button
                key={template.name}
                onClick={() => handleLegacyTemplateSelect(template.template)}
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
            value={prompt || ''}
            onChange={(e) => onPromptChange && typeof onPromptChange === 'function' && onPromptChange(e.target.value)}
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
            <span>{(prompt || '').length} characters</span>
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

  // Dual prompt mode
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold text-gray-900">Prompt Configuration</h3>
          <HelpTooltip
            content="Configure both system and user prompts. The system prompt defines the AI's role and behavior, while the user prompt contains your specific request. Dataset content will be automatically appended to the user prompt."
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
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ${
            activeTab === 'system'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          System Prompt
        </button>
        <button
          onClick={() => setActiveTab('user')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ${
            activeTab === 'user'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          User Prompt
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ${
            activeTab === 'preview'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Combined Preview
        </button>
      </div>

      {/* System Prompt Tab */}
      {activeTab === 'system' && (
        <div className="space-y-4">
          {/* System Prompt Templates */}
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="block text-sm font-medium text-gray-700">
                System Prompt Templates
              </span>
              <HelpTooltip
                content="System prompts define the AI's role, expertise, and behavior. Choose a template that matches the type of analysis you want to perform."
                position="right"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {systemPromptTemplates.map((template) => (
                <button
                  key={template.name}
                  onClick={() => handleSystemTemplateSelect(template.template)}
                  className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors duration-200"
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>

          {/* System Prompt Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <label htmlFor="system-prompt-input" className="block text-sm font-medium text-gray-700">
                  System Prompt
                </label>
                <HelpTooltip
                  content="The system prompt defines the AI's role, expertise, and behavior. It sets the context for how the AI should approach and respond to your requests."
                  position="right"
                />
              </div>
              {systemPrompt && (
                <button
                  onClick={handleClearSystem}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              id="system-prompt-input"
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange && typeof onSystemPromptChange === 'function' && onSystemPromptChange(e.target.value)}
              placeholder="Define the AI's role and expertise. For example: 'You are an expert data analyst specializing in fraud detection...'"
              className={`input-field resize-none ${
                isExpanded ? 'h-48' : 'h-32'
              } transition-all duration-200 ${
                systemPromptError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-blue-200 focus:border-blue-500 focus:ring-blue-500'
              }`}
            />
            {systemPromptError && (
              <p className="mt-1 text-sm text-red-600">{systemPromptError}</p>
            )}
            <div className="flex justify-between items-center text-sm text-gray-500">
              <span>{systemPrompt.length} characters</span>
              <span>Defines AI behavior and expertise</span>
            </div>
          </div>
        </div>
      )}

      {/* User Prompt Tab */}
      {activeTab === 'user' && (
        <div className="space-y-4">
          {/* User Prompt Templates */}
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="block text-sm font-medium text-gray-700">
                User Prompt Templates
              </span>
              <HelpTooltip
                content="User prompts contain your specific request or question. Choose a template that matches the type of task you want to perform on your data."
                position="right"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {userPromptTemplates.map((template) => (
                <button
                  key={template.name}
                  onClick={() => handleUserTemplateSelect(template.template)}
                  className="px-3 py-1 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded-md transition-colors duration-200"
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>

          {/* User Prompt Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <label htmlFor="user-prompt-input" className="block text-sm font-medium text-gray-700">
                  User Prompt
                </label>
                <HelpTooltip
                  content="The user prompt contains your specific request or question. The selected dataset content will be automatically appended to this prompt when the test runs."
                  position="right"
                />
              </div>
              {userPrompt && (
                <button
                  onClick={handleClearUser}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              id="user-prompt-input"
              value={userPrompt}
              onChange={(e) => onUserPromptChange && typeof onUserPromptChange === 'function' && onUserPromptChange(e.target.value)}
              placeholder="Enter your specific request or question. For example: 'Please analyze the following data for fraud patterns...'"
              className={`input-field resize-none ${
                isExpanded ? 'h-48' : 'h-32'
              } transition-all duration-200 ${
                userPromptError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-green-200 focus:border-green-500 focus:ring-green-500'
              }`}
            />
            {userPromptError && (
              <p className="mt-1 text-sm text-red-600">{userPromptError}</p>
            )}
            <div className="flex justify-between items-center text-sm text-gray-500">
              <span>{userPrompt.length} characters</span>
              <span>Dataset content will be appended automatically</span>
            </div>
          </div>
        </div>
      )}

      {/* Combined Preview Tab */}
      {activeTab === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <h4 className="text-sm font-medium text-gray-700">Combined Message Preview</h4>
            <HelpTooltip
              content="This shows how your prompts will be formatted and sent to the AI model. The system prompt establishes context, followed by the user prompt with dataset content."
              position="right"
            />
          </div>

          {(systemPrompt || userPrompt) ? (
            <div className="space-y-3">
              {/* System Message Preview */}
              {systemPrompt && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-xs font-semibold text-blue-700 bg-blue-200 px-2 py-1 rounded">
                      SYSTEM
                    </span>
                    <span className="text-sm text-blue-600">Role & Behavior Definition</span>
                  </div>
                  <div className="text-sm text-blue-800 max-h-32 overflow-y-auto">
                    <div className="whitespace-pre-wrap font-mono bg-white p-2 rounded border border-blue-200">
                      {systemPrompt}
                    </div>
                  </div>
                </div>
              )}

              {/* User Message Preview */}
              {userPrompt && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-xs font-semibold text-green-700 bg-green-200 px-2 py-1 rounded">
                      USER
                    </span>
                    <span className="text-sm text-green-600">Request & Dataset</span>
                  </div>
                  <div className="text-sm text-green-800 max-h-32 overflow-y-auto">
                    <div className="whitespace-pre-wrap font-mono bg-white p-2 rounded border border-green-200">
                      {userPrompt}
                      {userPrompt && !userPrompt.endsWith('\n') && '\n'}
                      <span className="text-gray-400 italic">[Dataset content will be inserted here]</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Message Flow Indicator */}
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <span>System defines behavior</span>
                <span>→</span>
                <span>User provides request + data</span>
                <span>→</span>
                <span>AI responds accordingly</span>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
              <p className="text-sm text-gray-500">
                Configure both system and user prompts to see the combined preview
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

PromptEditor.propTypes = {
  // Dual prompt mode props
  systemPrompt: PropTypes.string,
  userPrompt: PropTypes.string,
  onSystemPromptChange: PropTypes.func,
  onUserPromptChange: PropTypes.func,
  systemPromptError: PropTypes.string,
  userPromptError: PropTypes.string,

  // Legacy single prompt mode props (for backward compatibility)
  prompt: PropTypes.string,
  onPromptChange: PropTypes.func,
  validationError: PropTypes.string
}

export default PromptEditor