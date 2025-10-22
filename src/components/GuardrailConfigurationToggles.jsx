import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import LoadingSpinner from './LoadingSpinner';
import HelpTooltip from './HelpTooltip';

const GuardrailConfigurationToggles = ({
  guardrailId,
  configurations,
  onToggle,
  isLoading,
  errors,
  loadingStates
}) => {
  const [localStates, setLocalStates] = useState({});

  // Configuration type display names and descriptions
  const configurationInfo = {
    TOPIC_POLICY: {
      name: 'Topic Policy',
      description: 'Filters content based on predefined topics and themes'
    },
    CONTENT_POLICY: {
      name: 'Content Policy',
      description: 'Blocks harmful content including hate speech, violence, and inappropriate material'
    },
    WORD_POLICY: {
      name: 'Word Policy',
      description: 'Filters specific words and phrases from custom and managed word lists'
    },
    SENSITIVE_INFORMATION: {
      name: 'Sensitive Information',
      description: 'Detects and filters personally identifiable information (PII) and sensitive data'
    },
    CONTEXTUAL_GROUNDING: {
      name: 'Contextual Grounding',
      description: 'Ensures responses are grounded in provided context and factual information'
    },
    AUTOMATED_REASONING: {
      name: 'Automated Reasoning',
      description: 'Applies automated reasoning policies for complex content evaluation'
    }
  };

  // Initialize local states from configurations
  useEffect(() => {
    if (configurations) {
      const newLocalStates = {};
      Object.entries(configurations).forEach(([type, config]) => {
        newLocalStates[type] = config.isActive;
      });
      setLocalStates(newLocalStates);
    }
  }, [configurations]);

  const handleToggle = async (configurationType) => {
    if (!onToggle || isLoading || loadingStates?.[configurationType]) {
      return;
    }

    const currentState = localStates[configurationType];
    const newState = !currentState;

    // Optimistic update
    setLocalStates(prev => ({
      ...prev,
      [configurationType]: newState
    }));

    try {
      await onToggle(configurationType, newState);
    } catch (error) {
      // Revert on error
      setLocalStates(prev => ({
        ...prev,
        [configurationType]: currentState
      }));
    }
  };

  console.log('[GuardrailConfigurationToggles] Received configurations:', configurations);

  if (!configurations) {
    console.log('[GuardrailConfigurationToggles] No configurations provided');
    return (
      <div className="text-center py-4 text-gray-500">
        <p className="text-sm">No guardrail configurations available</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium text-gray-900">Configuration Controls</h4>
        <HelpTooltip
          content="Toggle individual guardrail configurations on or off. Changes are applied immediately to your guardrail."
          position="left"
        />
      </div>

      <div className="grid grid-cols-1 gap-3">
        {Object.entries(configurations).map(([configurationType, config]) => {
          const info = configurationInfo[configurationType];
          const isToggleLoading = loadingStates?.[configurationType];
          const hasError = errors?.[configurationType];
          const isActive = localStates[configurationType] ?? config.isActive;
          const hasConfiguration = config.hasConfiguration;

          console.log(`[GuardrailConfigurationToggles] Processing ${configurationType}:`, {
            info: !!info,
            hasConfiguration,
            config,
            willRender: !!(info && hasConfiguration)
          });

          if (!info || !hasConfiguration) {
            console.log(`[GuardrailConfigurationToggles] Skipping ${configurationType} - info: ${!!info}, hasConfiguration: ${hasConfiguration}`);
            return null;
          }

          return (
            <div
              key={configurationType}
              className={`border rounded-lg p-3 transition-colors duration-200 ${
                hasError
                  ? 'border-red-300 bg-red-50'
                  : isActive
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <h5 className="text-sm font-medium text-gray-900 truncate">
                      {info.name}
                    </h5>
                    <HelpTooltip
                      content={info.description}
                      position="right"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {info.description}
                  </p>
                  {config.lastUpdated && (
                    <p className="text-xs text-gray-400 mt-1">
                      Last updated: {new Date(config.lastUpdated).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  {isToggleLoading && (
                    <LoadingSpinner size="sm" color="primary" inline />
                  )}

                  <button
                    onClick={() => handleToggle(configurationType)}
                    disabled={isLoading || isToggleLoading}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      isActive ? 'bg-primary-600' : 'bg-gray-200'
                    }`}
                    role="switch"
                    aria-checked={isActive}
                    aria-labelledby={`toggle-label-${configurationType}`}
                    aria-describedby={`toggle-description-${configurationType}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isActive ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {hasError && (
                <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded text-xs text-red-700">
                  <div className="flex items-start space-x-2">
                    <svg className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1">
                      <p className="font-medium">Toggle failed</p>
                      <p className="mt-1">{hasError}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(configurations).length === 0 && (
        <div className="text-center py-6 text-gray-500">
          <svg className="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm">No configurations available to toggle</p>
        </div>
      )}
    </div>
  );
};

GuardrailConfigurationToggles.propTypes = {
  guardrailId: PropTypes.string,
  configurations: PropTypes.objectOf(PropTypes.shape({
    isActive: PropTypes.bool.isRequired,
    lastUpdated: PropTypes.string,
    hasConfiguration: PropTypes.bool.isRequired
  })),
  onToggle: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
  errors: PropTypes.objectOf(PropTypes.string),
  loadingStates: PropTypes.objectOf(PropTypes.bool)
};

GuardrailConfigurationToggles.defaultProps = {
  guardrailId: null,
  configurations: {},
  isLoading: false,
  errors: {},
  loadingStates: {}
};

export default GuardrailConfigurationToggles;