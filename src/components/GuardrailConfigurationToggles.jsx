import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import LoadingSpinner from './LoadingSpinner';
import HelpTooltip from './HelpTooltip';

const GuardrailConfigurationToggles = ({
  guardrailId,
  configurations,
  configurationDetails,
  onToggle,
  isLoading,
  errors,
  loadingStates
}) => {
  const [localStates, setLocalStates] = useState({});
  const [retryAttempts, setRetryAttempts] = useState({});

  // Configuration type display names and descriptions
  const configurationInfo = {
    TOPIC_POLICY: {
      name: 'Topic Policy',
      description: 'Filters content based on predefined topics and themes',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      )
    },
    CONTENT_POLICY: {
      name: 'Content Policy',
      description: 'Blocks harmful content including hate speech, violence, and inappropriate material',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    WORD_POLICY: {
      name: 'Word Policy',
      description: 'Filters specific words and phrases from custom and managed word lists',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
        </svg>
      )
    },
    SENSITIVE_INFORMATION: {
      name: 'Sensitive Information',
      description: 'Detects and filters personally identifiable information (PII) and sensitive data',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )
    },
    CONTEXTUAL_GROUNDING: {
      name: 'Contextual Grounding',
      description: 'Ensures responses are grounded in provided context and factual information',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    AUTOMATED_REASONING: {
      name: 'Automated Reasoning',
      description: 'Applies automated reasoning policies for complex content evaluation',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )
    }
  };

  // Initialize local states from configurations
  useEffect(() => {
    if (configurations) {
      const newLocalStates = {};
      for (const [type, config] of Object.entries(configurations)) {
        newLocalStates[type] = config.isActive;
      }
      setLocalStates(newLocalStates);
      // Reset retry attempts when configurations change
      setRetryAttempts({});
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
      // Clear retry attempts on success
      setRetryAttempts(prev => {
        const newAttempts = { ...prev };
        delete newAttempts[configurationType];
        return newAttempts;
      });
    } catch (error) {
      console.error(`Failed to toggle ${configurationType}:`, error);
      // Revert on error
      setLocalStates(prev => ({
        ...prev,
        [configurationType]: currentState
      }));
      // Track retry attempts
      setRetryAttempts(prev => ({
        ...prev,
        [configurationType]: (prev[configurationType] || 0) + 1
      }));
    }
  };

  const handleRetry = async (configurationType) => {
    // Clear the error first
    if (errors?.[configurationType]) {
      // This would typically be handled by the parent component
      console.log(`Retrying ${configurationType} toggle`);
    }

    // Attempt the toggle again
    await handleToggle(configurationType);
  };

  const getToggleAriaLabel = (configurationType, isActive) => {
    const info = configurationInfo[configurationType];
    return `${isActive ? 'Disable' : 'Enable'} ${info?.name || configurationType}`;
  };





  if (!configurations) {

    return (
      <div className="text-center py-4 text-gray-500">
        <p className="text-sm">No guardrail configurations available</p>
      </div>
    );
  }

  return (
    <section className="space-y-3" aria-label="Guardrail configuration toggles">

      <div className="grid grid-cols-1 gap-3">
        {Object.entries(configurations).map(([configurationType, config]) => {
          const info = configurationInfo[configurationType];
          const isToggleLoading = loadingStates?.[configurationType];
          const hasError = errors?.[configurationType];
          const isActive = localStates[configurationType] ?? config.isActive;
          const hasConfiguration = config.hasConfiguration;
          const retryCount = retryAttempts[configurationType] || 0;

          if (!info || !hasConfiguration) {
            return null;
          }

          // Determine border and background colors
          let borderColor = 'border-gray-200';
          let backgroundColor = 'bg-white';

          if (hasError) {
            borderColor = 'border-red-300';
            backgroundColor = 'bg-red-50';
          } else if (isActive) {
            borderColor = 'border-primary-300';
            backgroundColor = 'bg-primary-50';
          }

          return (
            <div
              key={configurationType}
              className={`border rounded-lg p-3 transition-all duration-200 ${borderColor} ${backgroundColor}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <div className={`flex-shrink-0 ${isActive ? 'text-primary-600' : 'text-gray-400'}`}>
                      {info.icon}
                    </div>
                    <h5
                      id={`toggle-label-${configurationType}`}
                      className="text-sm font-medium text-gray-900 truncate"
                    >
                      {info.name}
                    </h5>
                    <HelpTooltip
                      content={info.description}
                      position="right"
                    />
                  </div>
                  <p
                    id={`toggle-description-${configurationType}`}
                    className="text-xs text-gray-500 mt-1"
                  >
                    {info.description}
                  </p>
                  {configurationDetails?.[configurationType] && (
                    <p className="text-xs text-gray-500 mt-1">
                      {configurationDetails[configurationType]}
                    </p>
                  )}
                  {/* Simplified: omit last updated text */}
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
                    aria-label={getToggleAriaLabel(configurationType, isActive)}
                    aria-describedby={`toggle-description-${configurationType}`}
                  >
                    <span className="sr-only">
                      {getToggleAriaLabel(configurationType, isActive)}
                    </span>
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isActive ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {hasError && (
                <div className="mt-3 p-3 bg-red-100 border border-red-200 rounded-md">
                  <div className="flex items-start space-x-2">
                    <svg className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-800">Toggle failed</p>
                      <p className="text-xs text-red-700 mt-1">{hasError}</p>
                      {retryCount > 0 && (
                        <p className="text-xs text-red-600 mt-1">
                          Retry attempts: {retryCount}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRetry(configurationType)}
                      disabled={isToggleLoading}
                      className="text-xs text-red-600 hover:text-red-700 font-medium focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded px-2 py-1 disabled:opacity-50"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {/* Simplified: omit active/status indicator below each item */}
            </div>
          );
        })}
      </div>

      {Object.keys(configurations).length === 0 && (
        <div className="text-center py-6 text-gray-500">
          <svg className="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm font-medium">No configurations available to toggle</p>
          <p className="text-xs text-gray-400 mt-1">
            Guardrail configurations will appear here when available
          </p>
        </div>
      )}
    </section>
  );
};

GuardrailConfigurationToggles.propTypes = {
  guardrailId: PropTypes.string,
  configurations: PropTypes.objectOf(PropTypes.shape({
    isActive: PropTypes.bool.isRequired,
    lastUpdated: PropTypes.string,
    hasConfiguration: PropTypes.bool.isRequired
  })),
  configurationDetails: PropTypes.objectOf(PropTypes.string),
  onToggle: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
  errors: PropTypes.objectOf(PropTypes.string),
  loadingStates: PropTypes.objectOf(PropTypes.bool)
};

GuardrailConfigurationToggles.defaultProps = {
  guardrailId: null,
  configurations: {},
  configurationDetails: {},
  isLoading: false,
  errors: {},
  loadingStates: {}
};

export default GuardrailConfigurationToggles;
