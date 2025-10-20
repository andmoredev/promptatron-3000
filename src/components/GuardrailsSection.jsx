import { useState } from 'react';
import PropTypes from 'prop-types';
import HelpTooltip from './HelpTooltip';

const GuardrailsSection = ({
  guardrails,
  isEnabled,
  onToggleEnabled,
  onTestGuardrails,
  isCollapsed,
  onToggleCollapse,
  validationErrors,
  isTestingGuardrails = false
}) => {
  const [showDetails, setShowDetails] = useState(false);

  // Calculate guardrail summary
  const guardrailCount = guardrails?.configs?.length || 0;
  const enabledGuardrails = isEnabled ? guardrailCount : 0;

  // Get guardrail types for summary
  const getGuardrailTypes = () => {
    if (!guardrails?.configs) return [];

    const types = new Set();
    guardrails.configs.forEach(config => {
      if (config.contentPolicyConfig) types.add('Content');
      if (config.wordPolicyConfig) types.add('Word');
      if (config.sensitiveInformationPolicyConfig) types.add('PII');
      if (config.topicPolicyConfig) types.add('Topic');
    });

    return Array.from(types);
  };

  const guardrailTypes = getGuardrailTypes();

  const handleTestGuardrails = () => {
    if (onTestGuardrails && guardrailCount > 0 && isEnabled) {
      onTestGuardrails();
    }
  };

  const canTestGuardrails = guardrailCount > 0 && isEnabled && !isTestingGuardrails;

  return (
    <div className="card">
      <div className={`flex items-center justify-between ${isCollapsed ? 'mb-0' : 'mb-4'}`}>
        <div className="flex items-center space-x-2">
          <button
            onClick={onToggleCollapse}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleCollapse();
              }
            }}
            className="collapsible-toggle-button group"
            aria-expanded={!isCollapsed}
            aria-controls="guardrails-section-content"
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} guardrails section`}
          >
            <svg
              className={`collapsible-chevron ${
                isCollapsed ? 'collapsed' : 'expanded'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <span id="guardrails-section-header">Guardrails</span>
          </button>
          {!isCollapsed && (
            <HelpTooltip
              content="Configure content filtering and safety controls for your AI model interactions. Guardrails can detect harmful content, PII, and enforce topic restrictions."
              position="right"
            />
          )}
        </div>

        <div className="flex items-center space-x-3 min-w-0">
          {isCollapsed && guardrailCount > 0 && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">
                {enabledGuardrails}/{guardrailCount} active
              </span>
              <div className={`w-2 h-2 rounded-full ${
                isEnabled ? 'bg-green-400' : 'bg-gray-300'
              }`} />
            </div>
          )}

          {!isCollapsed && guardrailCount > 0 && (
            <button
              onClick={handleTestGuardrails}
              disabled={!canTestGuardrails}
              className={`text-sm font-medium px-3 py-1 rounded-md transition-colors duration-200 ${
                canTestGuardrails
                  ? 'text-primary-600 hover:text-primary-700 hover:bg-primary-50'
                  : 'text-gray-400 cursor-not-allowed'
              }`}
              title={
                !isEnabled
                  ? 'Enable guardrails to test them'
                  : guardrailCount === 0
                  ? 'No guardrails configured'
                  : isTestingGuardrails
                  ? 'Testing in progress...'
                  : 'Test guardrails without running the model'
              }
            >
              {isTestingGuardrails ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-600"></div>
                  <span>Testing...</span>
                </div>
              ) : (
                'Test Guardrails Only'
              )}
            </button>
          )}
        </div>
      </div>

      <div
        id="guardrails-section-content"
        className={`collapsible-content ${
          isCollapsed ? 'collapsed' : 'expanded'
        }`}
        role="region"
        aria-labelledby="guardrails-section-header"
        aria-hidden={isCollapsed}
      >
        <div className="space-y-4">
          {/* Validation Errors */}
          {validationErrors && validationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Guardrail Configuration Issues
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <ul className="list-disc list-inside space-y-1">
                      {validationErrors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* No Guardrails State */}
          {guardrailCount === 0 && (
            <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No guardrails configured</h3>
              <p className="mt-1 text-sm text-gray-500">
                Add guardrail configurations to your scenario to enable content filtering and safety controls.
              </p>
            </div>
          )}

          {/* Guardrails Configuration Display */}
          {guardrailCount > 0 && (
            <div className="space-y-4">
              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={onToggleEnabled}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                      isEnabled ? 'bg-primary-600' : 'bg-gray-200'
                    }`}
                    role="switch"
                    aria-checked={isEnabled}
                    aria-labelledby="guardrails-toggle-label"
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <div>
                    <label id="guardrails-toggle-label" className="text-sm font-medium text-gray-900">
                      Enable Guardrails
                    </label>
                    <p className="text-xs text-gray-500">
                      {isEnabled ? 'Guardrails will be applied during model execution' : 'Guardrails are disabled'}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {guardrailCount} guardrail{guardrailCount !== 1 ? 's' : ''}
                  </div>
                  <div className="text-xs text-gray-500">
                    {guardrailTypes.join(', ')} filtering
                  </div>
                </div>
              </div>

              {/* Guardrails Summary */}
              <div className="bg-white border border-gray-200 rounded-lg">
                <div className="px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-900">
                      Configured Guardrails
                    </h4>
                    <button
                      onClick={() => setShowDetails(!showDetails)}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {showDetails ? 'Hide Details' : 'Show Details'}
                    </button>
                  </div>
                </div>

                <div className="px-4 py-3">
                  {!showDetails ? (
                    // Summary View
                    <div className="grid grid-cols-2 gap-4">
                      {guardrails.configs.map((config, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-primary-500 rounded-full"></div>
                          <span className="text-sm text-gray-700 truncate">
                            {config.name || `Guardrail ${index + 1}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    // Detailed View
                    <div className="space-y-4">
                      {guardrails.configs.map((config, index) => (
                        <div key={index} className="border border-gray-100 rounded-lg p-3">
                          <div className="flex items-start justify-between mb-2">
                            <h5 className="text-sm font-medium text-gray-900">
                              {config.name || `Guardrail ${index + 1}`}
                            </h5>
                            <div className="flex space-x-1">
                              {config.contentPolicyConfig && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                  Content
                                </span>
                              )}
                              {config.wordPolicyConfig && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                  Word
                                </span>
                              )}
                              {config.sensitiveInformationPolicyConfig && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  PII
                                </span>
                              )}
                              {config.topicPolicyConfig && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  Topic
                                </span>
                              )}
                            </div>
                          </div>

                          {config.description && (
                            <p className="text-xs text-gray-600 mb-2">
                              {config.description}
                            </p>
                          )}

                          <div className="text-xs text-gray-500">
                            {config.contentPolicyConfig && (
                              <div>Content filters: {config.contentPolicyConfig.filtersConfig?.length || 0}</div>
                            )}
                            {config.wordPolicyConfig && (
                              <div>Word filters: {(config.wordPolicyConfig.wordsConfig?.length || 0) + (config.wordPolicyConfig.managedWordListsConfig?.length || 0)}</div>
                            )}
                            {config.sensitiveInformationPolicyConfig && (
                              <div>PII entities: {config.sensitiveInformationPolicyConfig.piiEntitiesConfig?.length || 0}</div>
                            )}
                            {config.topicPolicyConfig && (
                              <div>Topics: {config.topicPolicyConfig.topicsConfig?.length || 0}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Status Indicator */}
              <div className={`flex items-center space-x-2 text-sm ${
                isEnabled ? 'text-green-700' : 'text-gray-500'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  isEnabled ? 'bg-green-400' : 'bg-gray-300'
                }`} />
                <span>
                  {isEnabled
                    ? `${enabledGuardrails} guardrail${enabledGuardrails !== 1 ? 's' : ''} active`
                    : 'Guardrails disabled'
                  }
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

GuardrailsSection.propTypes = {
  guardrails: PropTypes.shape({
    enabled: PropTypes.bool,
    configs: PropTypes.arrayOf(PropTypes.shape({
      name: PropTypes.string,
      description: PropTypes.string,
      blockedInputMessaging: PropTypes.string,
      blockedOutputsMessaging: PropTypes.string,
      contentPolicyConfig: PropTypes.object,
      wordPolicyConfig: PropTypes.object,
      sensitiveInformationPolicyConfig: PropTypes.object,
      topicPolicyConfig: PropTypes.object
    }))
  }),
  isEnabled: PropTypes.bool,
  onToggleEnabled: PropTypes.func.isRequired,
  onTestGuardrails: PropTypes.func,
  isCollapsed: PropTypes.bool,
  onToggleCollapse: PropTypes.func.isRequired,
  validationErrors: PropTypes.arrayOf(PropTypes.string),
  isTestingGuardrails: PropTypes.bool
};

GuardrailsSection.defaultProps = {
  guardrails: null,
  isEnabled: false,
  onTestGuardrails: null,
  isCollapsed: false,
  validationErrors: null,
  isTestingGuardrails: false
};

export default GuardrailsSection;
