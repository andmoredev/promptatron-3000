/**
 * Tool-specific error handling utilities for the Bedrock LLM Analyzer
 * Provides specialized error handling for tool configuration and usage scenarios
 */

import { analyzeError, handleError, ErrorTypes } from './errorHandling.js'

/**
 * Tool-specif error types
 */
export const ToolErrorTypes = {
  TOOL_CONFIG_NOT_FOUND: 'tool_config_not_found',
  TOOL_CONFIG_INVALID: 'tool_config_invalid',
  TOOL_VALIDATION_FAILED: 'tool_validation_failed',
  TOOL_EXTRACTION_FAILED: 'tool_extraction_failed',
  TOOL_SERVICE_UNAVAILABLE: 'tool_service_unavailable',
  TOOL_PARAMETER_INVALID: 'tool_parameter_invalid',
  TOOL_UNAVAILABLE: 'tool_unavailable'
}

/**
 * Analyze tool-related errors and provide user-friendly messages
 * @param {Error|string} error - The error to analyze
 * @param {Object} context - Additional context about the tool error
 * @returns {Object} Structured tool error information
 */
export function analyzeToolError(error, context = {}) {
  const baseErrorInfo = analyzeError(error, context)

  // Determine if this is a tool-specific error
  const toolErrorType = categorizeToolError(baseErrorInfo.originalMessage, context)

  if (toolErrorType) {
    return {
      ...baseErrorInfo,
      toolErrorType,
      userMessage: generateToolErrorMessage(toolErrorType, context),
      suggestedActions: generateToolErrorActions(toolErrorType, context),
      gracefulDegradation: shouldUseGracefulDegradation(toolErrorType)
    }
  }

  return baseErrorInfo
}

/**
 * Categorize error as tool-specific type
 * @param {string} message - Error message
 * @param {Object} context - Error context
 * @returns {string|null} Tool error type or null if not tool-specific
 */
function categorizeToolError(message, context) {
  const lowerMessage = message.toLowerCase()

  if (context.operation === 'getToolsForDatasetType' && lowerMessage.includes('not found')) {
    return ToolErrorTypes.TOOL_CONFIG_NOT_FOUND
  }

  if (context.operation === 'validateToolDefinition' || lowerMessage.includes('validation')) {
    return ToolErrorTypes.TOOL_VALIDATION_FAILED
  }

  if (context.operation === 'extractToolUsageAttempts' || lowerMessage.includes('extraction')) {
    return ToolErrorTypes.TOOL_EXTRACTION_FAILED
  }

  if (lowerMessage.includes('tool configuration') && lowerMessage.includes('invalid')) {
    return ToolErrorTypes.TOOL_CONFIG_INVALID
  }

  if (lowerMessage.includes('tool service') || lowerMessage.includes('service unavailable')) {
    return ToolErrorTypes.TOOL_SERVICE_UNAVAILABLE
  }

  if (lowerMessage.includes('parameter') && lowerMessage.includes('invalid')) {
    return ToolErrorTypes.TOOL_PARAMETER_INVALID
  }

  if (lowerMessage.includes('tool') && lowerMessage.includes('unavailable')) {
    return ToolErrorTypes.TOOL_UNAVAILABLE
  }

  return null
}

/**
 * Generate user-friendly error messages for tool errors
 * @param {string} toolErrorType - The tool error type
 * @param {Object} context - Error context
 * @returns {string} User-friendly error message
 */
function generateToolErrorMessage(toolErrorType, context) {
  switch (toolErrorType) {
    case ToolErrorTypes.TOOL_CONFIG_NOT_FOUND:
      return `No tools are configured for the "${context.datasetType || 'selected'}" dataset type. The analysis will proceed without tool capabilities.`

    case ToolErrorTypes.TOOL_CONFIG_INVALID:
      return 'The tool configuration contains errors. Some tools may not work correctly, but the analysis will continue.'

    case ToolErrorTypes.TOOL_VALIDATION_FAILED:
      return 'Tool configuration validation failed. The system will attempt to use available tools where possible.'

    case ToolErrorTypes.TOOL_EXTRACTION_FAILED:
      return 'Failed to detect tool usage from the model response. The analysis results are still valid.'

    case ToolErrorTypes.TOOL_SERVICE_UNAVAILABLE:
      return 'The tool configuration service is temporarily unavailable. Analysis will proceed without tool capabilities.'

    case ToolErrorTypes.TOOL_PARAMETER_INVALID:
      return `The model provided invalid parameters for tool "${context.toolName || 'unknown'}". This attempt has been recorded for analysis.`

    case ToolErrorTypes.TOOL_UNAVAILABLE:
      return `The model attempted to use "${context.toolName || 'unknown'}" which was not available. This indicates the model's decision-making process.`

    default:
      return 'A tool-related issue occurred, but the analysis will continue normally.'
  }
}

/**
 * Generate suggested actions for tool errors
 * @param {string} toolErrorType - The tool error type
 * @param {Object} context - Error context
 * @returns {Array} Array of suggested actions
 */
function generateToolErrorActions(toolErrorType, context) {
  const actions = []

  switch (toolErrorType) {
    case ToolErrorTypes.TOOL_CONFIG_NOT_FOUND:
      actions.push('This is normal behavior for dataset types without specific tools')
      actions.push('The analysis will complete successfully without tool capabilities')
      actions.push('Check if tools should be configured for this dataset type')
      break

    case ToolErrorTypes.TOOL_CONFIG_INVALID:
      actions.push('Check the tool configuration for syntax errors')
      actions.push('Verify all required fields are present in the configuration')
      actions.push('Contact support if the issue persists')
      actions.push('The system will use graceful degradation to continue')
      break

    case ToolErrorTypes.TOOL_VALIDATION_FAILED:
      actions.push('Review the tool configuration structure')
      actions.push('Ensure all tools have valid schemas')
      actions.push('The system will attempt to use valid tools only')
      break

    case ToolErrorTypes.TOOL_EXTRACTION_FAILED:
      actions.push('This may indicate an unusual model response format')
      actions.push('The main analysis results are not affected')
      actions.push('Try running the test again')
      actions.push('Report this if it happens consistently')
      break

    case ToolErrorTypes.TOOL_SERVICE_UNAVAILABLE:
      actions.push('Refresh the page and try again')
      actions.push('Check your internet connection')
      actions.push('The analysis will complete without tool detection')
      actions.push('Contact support if this persists')
      break

    case ToolErrorTypes.TOOL_PARAMETER_INVALID:
      actions.push('This shows the model attempted to use tools incorrectly')
      actions.push('The attempt has been recorded for analysis purposes')
      actions.push('This is valuable data about model behavior')
      actions.push('No action needed - this is expected behavior')
      break

    case ToolErrorTypes.TOOL_UNAVAILABLE:
      actions.push('This shows the model tried to use non-existent tools')
      actions.push('This indicates the model\'s reasoning process')
      actions.push('The attempt has been recorded for analysis')
      actions.push('Consider if this tool should be made available')
      break

    default:
      actions.push('Try refreshing the page')
      actions.push('The analysis will continue normally')
      actions.push('Contact support if issues persist')
      break
  }

  return actions
}

/**
 * Determine if graceful degradation should be used for this error type
 * @param {string} toolErrorType - The tool error type
 * @returns {boolean} True if graceful degradation should be used
 */
function shouldUseGracefulDegradation(toolErrorType) {
  const gracefulTypes = [
    ToolErrorTypes.TOOL_CONFIG_NOT_FOUND,
    ToolErrorTypes.TOOL_CONFIG_INVALID,
    ToolErrorTypes.TOOL_EXTRACTION_FAILED,
    ToolErrorTypes.TOOL_SERVICE_UNAVAILABLE
  ]

  return gracefulTypes.includes(toolErrorType)
}

/**
 * Handle tool configuration errors with appropriate user feedback
 * @param {Error|string} error - The error to handle
 * @param {Object} context - Error context
 * @param {Function} onError - Callback for UI error handling
 * @returns {Object} Tool error information
 */
export function handleToolError(error, context = {}, onError = null) {
  const toolErrorInfo = analyzeToolError(error, context)

  // Log the error with tool-specific context
  console.group(`🔧 Tool Error [${toolErrorInfo.severity.toUpperCase()}] - ${toolErrorInfo.toolErrorType || toolErrorInfo.type}`)
  console.error('Tool Message:', toolErrorInfo.userMessage)
  console.error('Original:', toolErrorInfo.originalMessage)
  console.error('Context:', context)

  if (toolErrorInfo.gracefulDegradation) {
    // Using graceful degradation - analysis will continue
  }
  console.groupEnd()

  // Store error report for debugging
  try {
    const errorReport = {
      id: toolErrorInfo.id,
      type: toolErrorInfo.toolErrorType || toolErrorInfo.type,
      severity: toolErrorInfo.severity,
      message: toolErrorInfo.originalMessage,
      userMessage: toolErrorInfo.userMessage,
      context: context,
      timestamp: toolErrorInfo.timestamp,
      gracefulDegradation: toolErrorInfo.gracefulDegradation
    }

    const existingReports = JSON.parse(localStorage.getItem('tool-error-reports') || '[]')
    existingReports.unshift(errorReport)
    localStorage.setItem('tool-error-reports', JSON.stringify(existingReports.slice(0, 10)))
  } catch (storageError) {
    console.warn('Failed to store tool error report:', storageError)
  }

  // Call error handler if provided
  if (onError && typeof onError === 'function') {
    onError(toolErrorInfo)
  }

  return toolErrorInfo
}

/**
 * Validate tool configuration and provide detailed feedback
 * @param {Object} toolConfig - Tool configuration to validate
 * @param {string} datasetType - Dataset type for context
 * @returns {Object} Validation result with user-friendly messages
 */
export function validateToolConfigurationWithFeedback(toolConfig, datasetType) {
  const result = {
    isValid: false,
    errors: [],
    warnings: [],
    userMessages: [],
    canProceed: false
  }

  try {
    if (!toolConfig) {
      result.errors.push('Tool configuration is missing')
      result.userMessages.push(`No tool configuration found for "${datasetType}". Analysis will proceed without tools.`)
      result.canProceed = true // Can proceed without tools
      return result
    }

    if (!toolConfig.tools || !Array.isArray(toolConfig.tools)) {
      result.errors.push('Tool configuration missing tools array')
      result.userMessages.push('Tool configuration is malformed. Analysis will proceed without tools.')
      result.canProceed = true
      return result
    }

    if (toolConfig.tools.length === 0) {
      result.warnings.push('No tools defined in configuration')
      result.userMessages.push(`No tools are configured for "${datasetType}". This is normal for some dataset types.`)
      result.isValid = true
      result.canProceed = true
      return result
    }

    // Validate each tool
    let validToolCount = 0
    for (const [index, tool] of toolConfig.tools.entries()) {
      try {
        if (!tool.toolSpec || !tool.toolSpec.name) {
          result.errors.push(`Tool ${index + 1} missing name`)
          continue
        }

        if (!tool.toolSpec.inputSchema) {
          result.warnings.push(`Tool "${tool.toolSpec.name}" missing input schema`)
        }

        validToolCount++
      } catch (toolError) {
        result.errors.push(`Tool ${index + 1} validation failed: ${toolError.message}`)
      }
    }

    if (validToolCount === 0) {
      result.userMessages.push('No valid tools found in configuration. Analysis will proceed without tools.')
      result.canProceed = true
    } else if (validToolCount < toolConfig.tools.length) {
      result.warnings.push(`${toolConfig.tools.length - validToolCount} tool(s) have issues`)
      result.userMessages.push(`${validToolCount} of ${toolConfig.tools.length} tools are available. Some tools may not work correctly.`)
      result.isValid = true
      result.canProceed = true
    } else {
      result.userMessages.push(`All ${validToolCount} tools are configured correctly.`)
      result.isValid = true
      result.canProceed = true
    }

  } catch (error) {
    const toolError = analyzeToolError(error, {
      operation: 'validateToolConfiguration',
      datasetType: datasetType
    })

    result.errors.push(toolError.originalMessage)
    result.userMessages.push(toolError.userMessage)
    result.canProceed = toolError.gracefulDegradation
  }

  return result
}

/**
 * Create user-friendly summary of tool usage extraction results
 * @param {Object} toolUsage - Tool usage data from extraction
 * @returns {Object} Summary with user-friendly messages
 */
export function summarizeToolUsageResults(toolUsage) {
  const summary = {
    status: 'success',
    message: '',
    details: [],
    hasIssues: false,
    canProceed: true
  }

  if (!toolUsage) {
    summary.status = 'no_data'
    summary.message = 'No tool usage data available'
    summary.details.push('Tool usage detection was not performed')
    return summary
  }

  // Check for extraction success
  if (toolUsage.extractionSuccess === false) {
    summary.status = 'extraction_failed'
    summary.message = 'Tool usage detection failed'
    summary.hasIssues = true
    summary.details.push('Failed to detect tool usage from model response')
  } else if (toolUsage.gracefulDegradation) {
    summary.status = 'partial_success'
    summary.message = 'Tool usage partially detected'
    summary.hasIssues = true
    summary.details.push('Some tool usage data may be incomplete')
  }

  // Summarize tool calls
  if (toolUsage.hasToolUsage && toolUsage.toolCalls && toolUsage.toolCalls.length > 0) {
    const successfulCalls = toolUsage.toolCalls.filter(call => call.extractionSuccess !== false).length
    const failedCalls = toolUsage.toolCalls.length - successfulCalls

    if (failedCalls === 0) {
      summary.details.push(`Successfully detected ${successfulCalls} tool call${successfulCalls !== 1 ? 's' : ''}`)
    } else {
      summary.details.push(`Detected ${successfulCalls} tool call${successfulCalls !== 1 ? 's' : ''}, ${failedCalls} failed`)
      summary.hasIssues = true
    }

    // Check for parameter validation issues
    const invalidParams = toolUsage.toolCalls.filter(call =>
      call.parameterValidation && !call.parameterValidation.isValid
    ).length

    if (invalidParams > 0) {
      summary.details.push(`${invalidParams} tool call${invalidParams !== 1 ? 's' : ''} had parameter validation issues`)
      summary.hasIssues = true
    }

    // Check for unavailable tools
    const unavailableTools = toolUsage.toolCalls.filter(call =>
      call.wasToolAvailable === false
    ).length

    if (unavailableTools > 0) {
      summary.details.push(`Model attempted to use ${unavailableTools} unavailable tool${unavailableTools !== 1 ? 's' : ''}`)
    }
  } else {
    summary.details.push('No tool usage detected - model chose not to use tools')
  }

  // Check for extraction errors
  if (toolUsage.extractionErrors && toolUsage.extractionErrors.length > 0) {
    const errorCount = toolUsage.extractionErrors.length
    summary.details.push(`${errorCount} extraction error${errorCount !== 1 ? 's' : ''} occurred`)
    summary.hasIssues = true
  }

  // Check for warnings
  if (toolUsage.extractionWarnings && toolUsage.extractionWarnings.length > 0) {
    const warningCount = toolUsage.extractionWarnings.length
    summary.details.push(`${warningCount} warning${warningCount !== 1 ? 's' : ''} noted`)
  }

  // Set final message if not already set
  if (!summary.message) {
    if (toolUsage.hasToolUsage) {
      summary.message = `Tool usage detected successfully`
    } else {
      summary.message = 'No tool usage detected'
    }
  }

  return summary
}
