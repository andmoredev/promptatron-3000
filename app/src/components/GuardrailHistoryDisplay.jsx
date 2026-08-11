import React, { useState } from 'react';
import PropTypes from 'prop-types';

const GuardrailHistoryDisplay = ({
  guardrailResults,
  activeConfigurations,
  isExpanded,
  onToggleExpanded
}) => {
  // Don't render if no guardrail data is available
  if (!guardrailResults && !activeConfigurations) {
    return null;
  }

  // Handle various ways violations can be indicated
  const hasViolations = guardrailResults?.hasViolations ||
                       guardrailResults?.action === 'INTERVENED' ||
                       guardrailResults?.violations?.length > 0 ||
                       guardrailResults?.blocked === true;

  const getConfigurationIcon = (configType) => {
    const icons = {
      contentPolicy: '🚫',
      contentPolicyConfig: '🚫',
      wordPolicy: '📝',
      wordPolicyConfig: '📝',
      sensitiveInformationPolicy: '🔒',
      sensitiveInformationPolicyConfig: '🔒',
      topicPolicy: '📋',
      topicPolicyConfig: '📋',
      contextualGroundingPolicy: '🎯',
      contextualGroundingPolicyConfig: '🎯',
      automatedReasoningPolicy: '🤖',
      automatedReasoningPolicyConfig: '🤖'
    };
    return icons[configType] || '🛡️';
  };

  const getConfigurationLabel = (configType) => {
    const labels = {
      contentPolicy: 'Content Policy',
      contentPolicyConfig: 'Content Policy',
      wordPolicy: 'Word Policy',
      wordPolicyConfig: 'Word Policy',
      sensitiveInformationPolicy: 'Sensitive Information',
      sensitiveInformationPolicyConfig: 'Sensitive Information',
      topicPolicy: 'Topic Policy',
      topicPolicyConfig: 'Topic Policy',
      contextualGroundingPolicy: 'Contextual Grounding',
      contextualGroundingPolicyConfig: 'Contextual Grounding',
      automatedReasoningPolicy: 'Automated Reasoning',
      automatedReasoningPolicyConfig: 'Automated Reasoning'
    };
    return labels[configType] || configType.replace(/Config$/, '').replace(/([A-Z])/g, ' $1').trim();
  };

  const getViolationDescription = (violation) => {
    if (violation.type) {
      const descriptions = {
        CONTENT_POLICY: 'Content Policy: Blocked inappropriate content',
        WORD_POLICY: 'Word Policy: Blocked restricted words',
        SENSITIVE_INFORMATION: 'PII Filter: Detected sensitive information',
        TOPIC_POLICY: 'Topic Policy: Blocked restricted topic',
        CONTEXTUAL_GROUNDING: 'Contextual Grounding: Failed grounding check',
        AUTOMATED_REASONING: 'Automated Reasoning: Policy violation detected',
        // Additional common violation types
        HATE: 'Content Policy: Hate speech detected',
        INSULTS: 'Content Policy: Insults detected',
        MISCONDUCT: 'Content Policy: Misconduct detected',
        PROMPT_ATTACK: 'Content Policy: Prompt injection detected',
        VIOLENCE: 'Content Policy: Violence detected'
      };
      return descriptions[violation.type] || `${violation.type.replace(/_/g, ' ')}: Violation detected`;
    }

    if (violation.reason) {
      return violation.reason;
    }

    if (violation.policyType) {
      return `${violation.policyType}: ${violation.action || 'Blocked'}`;
    }

    return 'Guardrail intervention occurred';
  };

  const getViolationIcon = (violation) => {
    if (violation.type) {
      const icons = {
        CONTENT_POLICY: '🚫',
        WORD_POLICY: '📝',
        SENSITIVE_INFORMATION: '🔒',
        TOPIC_POLICY: '📋',
        CONTEXTUAL_GROUNDING: '🎯',
        AUTOMATED_REASONING: '🤖',
        HATE: '⚠️',
        INSULTS: '💢',
        MISCONDUCT: '🚨',
        PROMPT_ATTACK: '🛡️',
        VIOLENCE: '⛔'
      };
      return icons[violation.type] || '🚫';
    }
    return '🚫';
  };

  const renderActiveConfigurations = () => {
    if (!activeConfigurations || activeConfigurations.length === 0) {
      return (
        <div className="text-sm text-gray-500 italic">
          Active guardrail configurations not recorded for this test
        </div>
      );
    }

    const activeCount = activeConfigurations.filter(config => config.isActive).length;
    const totalCount = activeConfigurations.length;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h6 className="text-sm font-medium text-gray-700">Active Configurations:</h6>
          <span className="text-xs text-gray-500">
            {activeCount} of {totalCount} active
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {activeConfigurations.map((config, index) => (
            <div
              key={`config-${index}-${config.type}`}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                config.isActive
                  ? 'bg-green-50 border border-green-200 text-green-800 hover:bg-green-100'
                  : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="text-base" title={getConfigurationLabel(config.type)}>
                  {getConfigurationIcon(config.type)}
                </span>
                <span className="font-medium">
                  {getConfigurationLabel(config.type)}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {config.name && (
                  <span className="text-xs text-gray-500 max-w-20 truncate" title={config.name}>
                    {config.name}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  config.isActive
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {config.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderViolationDetails = () => {
    if (!hasViolations) {
      return (
        <div className="flex items-center space-x-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-green-800">
            All guardrail checks passed
          </span>
        </div>
      );
    }

    const violations = guardrailResults?.violations || [];

    return (
      <div className="space-y-2">
        <h6 className="text-sm font-medium text-red-700 flex items-center space-x-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span>Guardrail Interventions:</span>
        </h6>

        {violations.length > 0 ? (
          <div className="space-y-2">
            {violations.map((violation, index) => (
              <div
                key={`violation-${index}`}
                className="guardrail-violation-card"
              >
                <div className="flex-shrink-0 mt-0.5">
                  <span className="text-base" title={violation.type || 'Violation'}>
                    {getViolationIcon(violation)}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-red-800">
                    {getViolationDescription(violation)}
                  </div>
                  {violation.details && (
                    <div className="text-xs text-red-600 mt-1">
                      {violation.details}
                    </div>
                  )}
                  {violation.confidence && (
                    <div className="text-xs text-red-500 mt-1">
                      Confidence: {Math.round(violation.confidence * 100)}%
                    </div>
                  )}
                  {violation.policyName && (
                    <div className="text-xs text-red-500 mt-1">
                      Policy: {violation.policyName}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg transition-all duration-200">
            <div className="text-sm text-red-800">
              Guardrail intervention occurred (details not available)
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="guardrail-history-card">
      <div className="guardrail-history-header">
        <div className="flex items-center space-x-2">
          <span className="text-lg">🛡️</span>
          <h5 className="font-medium text-gray-700">Guardrail Information</h5>
          <span className={`guardrail-status-badge ${hasViolations ? 'blocked' : 'passed'}`}>
            {hasViolations ? 'Blocked' : 'Passed'}
          </span>
        </div>
        <button
          onClick={onToggleExpanded}
          className="guardrail-history-toggle"
        >
          <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isExpanded && (
        <div className="guardrail-history-content">
          {/* Summary Section */}
          {(guardrailResults || activeConfigurations) && (
            <div className="guardrail-config-summary">
              <h6 className="text-sm font-medium text-gray-700 mb-2">Summary</h6>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500">Status:</span>
                  <span className={`font-medium ${hasViolations ? 'text-red-600' : 'text-green-600'}`}>
                    {hasViolations ? 'Blocked' : 'Passed'}
                  </span>
                </div>
                {guardrailResults?.violations && (
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-500">Violations:</span>
                    <span className="font-medium text-red-600">
                      {guardrailResults.violations.length}
                    </span>
                  </div>
                )}
                {activeConfigurations && (
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-500">Active Policies:</span>
                    <span className="font-medium text-blue-600">
                      {activeConfigurations.filter(config => config.isActive).length}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Violation Details */}
          {renderViolationDetails()}

          {/* Active Configurations */}
          {renderActiveConfigurations()}

          {/* Additional Guardrail Metadata */}
          {guardrailResults?.guardrailId && (
            <div className="pt-3 border-t border-gray-100">
              <h6 className="text-sm font-medium text-gray-700 mb-2">Guardrail Details</h6>
              <div className="text-xs text-gray-500 space-y-1">
                <div>
                  <span className="font-medium">Guardrail ID:</span> {guardrailResults.guardrailId}
                </div>
                {guardrailResults.version && (
                  <div>
                    <span className="font-medium">Version:</span> {guardrailResults.version}
                  </div>
                )}
                {guardrailResults.action && (
                  <div>
                    <span className="font-medium">Action:</span> {guardrailResults.action}
                  </div>
                )}
                {guardrailResults.usage && (
                  <div>
                    <span className="font-medium">Usage:</span> {guardrailResults.usage.inputTokens || 0} input tokens, {guardrailResults.usage.outputTokens || 0} output tokens
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

GuardrailHistoryDisplay.propTypes = {
  guardrailResults: PropTypes.shape({
    hasViolations: PropTypes.bool,
    action: PropTypes.string,
    violations: PropTypes.array,
    guardrailId: PropTypes.string,
    version: PropTypes.string
  }),
  activeConfigurations: PropTypes.arrayOf(PropTypes.shape({
    type: PropTypes.string.isRequired,
    isActive: PropTypes.bool.isRequired,
    name: PropTypes.string
  })),
  isExpanded: PropTypes.bool.isRequired,
  onToggleExpanded: PropTypes.func.isRequired
};

GuardrailHistoryDisplay.defaultProps = {
  guardrailResults: null,
  activeConfigurations: null
};

export default GuardrailHistoryDisplay;
