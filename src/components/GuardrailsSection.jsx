import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import HelpTooltip from "./HelpTooltip";
import GuardrailConfigurationToggles from "./GuardrailConfigurationToggles";
import LoadingSpinner from "./LoadingSpinner";
import { guardrailConfigurationManager } from "../services/guardrailConfigurationManager.js";

const GuardrailsSection = ({
  guardrails,
  isEnabled,
  onToggleEnabled,
  isCollapsed,
  onToggleCollapse,
  validationErrors,
  scenarioName = "",
  scenarioGuardrailMap,
}) => {
  // State for individual configuration toggles
  const [configurationStates, setConfigurationStates] = useState(null);
  const [isLoadingConfigurations, setIsLoadingConfigurations] = useState(false);
  const [configurationErrors, setConfigurationErrors] = useState({});
  const [loadingStates, setLoadingStates] = useState({});
  const [guardrailId, setGuardrailId] = useState(null);

  // Extract guardrail ID from the scenario guardrail map (real AWS guardrail)
  useEffect(() => {


    if (scenarioGuardrailMap && scenarioName) {
      const guardrailInfo = scenarioGuardrailMap.get(scenarioName);


      if (guardrailInfo && guardrailInfo.id) {

        setGuardrailId(guardrailInfo.id);
      } else {

        setGuardrailId(null);
      }
    } else {

      setGuardrailId(null);
    }
  }, [scenarioGuardrailMap, scenarioName]);

  // Load configuration states when guardrail ID is available
  useEffect(() => {


    if (guardrailId && isEnabled && !isCollapsed) {

      loadConfigurationStates();
    }
  }, [guardrailId, isEnabled, isCollapsed]);

  const loadConfigurationStates = async () => {
    if (!guardrailId) {

      return;
    }


    setIsLoadingConfigurations(true);
    setConfigurationErrors({});

    try {
      const states = await guardrailConfigurationManager.getConfigurationStates(
        guardrailId
      );

      setConfigurationStates(states);
    } catch (error) {
      console.error("Failed to load configuration states:", error);
      setConfigurationErrors({
        general: `Failed to load configuration states: ${error.message}`,
      });
    } finally {
      setIsLoadingConfigurations(false);
    }
  };

  const handleConfigurationToggle = async (configurationType, isActive) => {
    if (!guardrailId) {
      setConfigurationErrors({
        ...configurationErrors,
        [configurationType]: "Guardrail ID not available",
      });
      return;
    }

    // Clear previous error for this configuration
    setConfigurationErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[configurationType];
      return newErrors;
    });

    // Set loading state for this specific toggle
    setLoadingStates((prev) => ({
      ...prev,
      [configurationType]: true,
    }));

    try {
      const result = await guardrailConfigurationManager.toggleConfiguration(
        guardrailId,
        configurationType,
        isActive
      );

      if (result.success) {
        // Update local state to reflect the change
        setConfigurationStates((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            configurations: {
              ...prev.configurations,
              [configurationType]: {
                ...prev.configurations[configurationType],
                isActive: isActive,
                lastUpdated: result.updatedAt,
              },
            },
            lastSyncTime: new Date().toISOString(),
          };
        });
      }
    } catch (error) {
      console.error(`Failed to toggle ${configurationType}:`, error);
      setConfigurationErrors((prev) => ({
        ...prev,
        [configurationType]: error.message,
      }));
    } finally {
      // Clear loading state for this specific toggle
      setLoadingStates((prev) => {
        const newStates = { ...prev };
        delete newStates[configurationType];
        return newStates;
      });
    }
  };

  // Calculate guardrail summary - handle both formats
  const getGuardrailInfo = () => {
    if (!guardrails) return { count: 0, types: [] };

    // Handle array format (configs array)
    if (guardrails.configs && Array.isArray(guardrails.configs)) {
      const types = new Set();
      guardrails.configs.forEach((config) => {
        if (config.contentPolicyConfig) types.add("Content");
        if (config.wordPolicyConfig) types.add("Word");
        if (config.sensitiveInformationPolicyConfig) types.add("PII");
        if (config.topicPolicyConfig) types.add("Topic");
      });
      return { count: guardrails.configs.length, types: Array.from(types) };
    }

    // Handle direct format (scenario format)
    if (guardrails.enabled) {
      const types = new Set();
      if (guardrails.contentPolicy) types.add("Content");
      if (guardrails.wordPolicy) types.add("Word");
      if (guardrails.sensitiveInformationPolicy) types.add("PII");
      if (guardrails.topicPolicy) types.add("Topic");
      if (guardrails.contextualGroundingPolicy) types.add("Grounding");

      // Count as 1 guardrail configuration if any policies are defined
      const count = types.size > 0 ? 1 : 0;
      return { count, types: Array.from(types) };
    }

    return { count: 0, types: [] };
  };

  const { count: guardrailCount, types: guardrailTypes } = getGuardrailInfo();
  const enabledGuardrails = isEnabled ? guardrailCount : 0;

  return (
    <div className="card">
      <div
        className={`flex items-center justify-between ${
          isCollapsed ? "mb-0" : "mb-4"
        }`}
      >
        <div className="flex items-center space-x-2">
          <button
            onClick={onToggleCollapse}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggleCollapse();
              }
            }}
            className="collapsible-toggle-button group"
            aria-expanded={!isCollapsed}
            aria-controls="guardrails-section-content"
            aria-label={`${
              isCollapsed ? "Expand" : "Collapse"
            } guardrails section`}
          >
            <svg
              className={`collapsible-chevron ${
                isCollapsed ? "collapsed" : "expanded"
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
              <div
                className={`w-2 h-2 rounded-full ${
                  isEnabled ? "bg-green-400" : "bg-gray-300"
                }`}
              />
            </div>
          )}

          {!isCollapsed && guardrailCount > 0 && (
            <div className="flex items-center space-x-3">
              <button
                onClick={onToggleEnabled}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                  isEnabled ? "bg-primary-600" : "bg-gray-200"
                }`}
                role="switch"
                aria-checked={isEnabled}
                aria-labelledby="guardrails-toggle-label-header"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <label
                id="guardrails-toggle-label-header"
                className="text-sm font-medium text-gray-900"
              >
                Enable Guardrails
              </label>
            </div>
          )}
        </div>
      </div>

      <div
        id="guardrails-section-content"
        className={`collapsible-content ${
          isCollapsed ? "collapsed" : "expanded"
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
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
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
            <div className="space-y-4">
              <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No guardrails configured
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Add guardrail configurations to your scenario to enable
                  content filtering and safety controls.
                </p>
              </div>
            </div>
          )}

          {/* Guardrails Configuration Display */}
          {guardrailCount > 0 && (
            <div className="space-y-3">
              {/* Guardrails Summary */}
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-900">
                    {guardrailCount} guardrail{guardrailCount !== 1 ? "s" : ""}{" "}
                    configured
                  </h4>
                  <div className="text-xs text-gray-500">
                    {guardrailTypes.join(", ")} filtering
                  </div>
                </div>

                {/* Summary View */}
                <div className="grid grid-cols-2 gap-2">
                  {guardrails.configs
                    ? // Array format
                      guardrails.configs.map((config, index) => (
                        <div
                          key={index}
                          className="flex items-center space-x-2"
                        >
                          <div className="w-1.5 h-1.5 bg-primary-500 rounded-full"></div>
                          <span className="text-xs text-gray-700 truncate">
                            {config.name || `Guardrail ${index + 1}`}
                          </span>
                        </div>
                      ))
                    : // Scenario format
                      guardrailTypes.map((type, index) => (
                        <div
                          key={index}
                          className="flex items-center space-x-2"
                        >
                          <div className="w-1.5 h-1.5 bg-primary-500 rounded-full"></div>
                          <span className="text-xs text-gray-700 truncate">
                            {type} Policy
                          </span>
                        </div>
                      ))}
                </div>
              </div>

              {/* Individual Configuration Toggles */}
              {isEnabled && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  {!guardrailId ? (
                    <div className="text-center py-6 text-gray-500">
                      <svg
                        className="mx-auto h-8 w-8 text-gray-400 mb-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                        />
                      </svg>
                      <p className="text-sm font-medium">No guardrail found</p>
                      <p className="text-xs text-gray-400 mt-1">
                        A guardrail needs to be created for this scenario first
                      </p>
                    </div>
                  ) : isLoadingConfigurations ? (
                    <div className="flex items-center justify-center py-8">
                      <LoadingSpinner
                        size="md"
                        text="Loading configuration states..."
                      />
                    </div>
                  ) : configurationErrors.general ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <svg
                          className="h-5 w-5 text-red-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="text-sm text-red-800">
                          {configurationErrors.general}
                        </span>
                      </div>
                      <button
                        onClick={loadConfigurationStates}
                        className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Retry
                      </button>
                    </div>
                  ) : configurationStates ? (
                    <GuardrailConfigurationToggles
                      guardrailId={guardrailId}
                      configurations={configurationStates.configurations}
                      onToggle={handleConfigurationToggle}
                      isLoading={isLoadingConfigurations}
                      errors={configurationErrors}
                      loadingStates={loadingStates}
                    />
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      <p className="text-sm">
                        Configuration states not available
                      </p>
                    </div>
                  )}
                </div>
              )}
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
    configs: PropTypes.arrayOf(
      PropTypes.shape({
        name: PropTypes.string,
        description: PropTypes.string,
        guardrailId: PropTypes.string,
        blockedInputMessaging: PropTypes.string,
        blockedOutputsMessaging: PropTypes.string,
        contentPolicyConfig: PropTypes.object,
        wordPolicyConfig: PropTypes.object,
        sensitiveInformationPolicyConfig: PropTypes.object,
        topicPolicyConfig: PropTypes.object,
        contextualGroundingPolicyConfig: PropTypes.object,
        automatedReasoningPolicyConfig: PropTypes.object,
      })
    ),
    // Scenario format properties
    contentPolicy: PropTypes.object,
    wordPolicy: PropTypes.object,
    sensitiveInformationPolicy: PropTypes.object,
    topicPolicy: PropTypes.object,
    contextualGroundingPolicy: PropTypes.object,
    automatedReasoningPolicy: PropTypes.object,
  }),
  isEnabled: PropTypes.bool,
  onToggleEnabled: PropTypes.func.isRequired,
  isCollapsed: PropTypes.bool,
  onToggleCollapse: PropTypes.func.isRequired,
  validationErrors: PropTypes.arrayOf(PropTypes.string),
  scenarioName: PropTypes.string,
  scenarioGuardrailMap: PropTypes.instanceOf(Map),
};

GuardrailsSection.defaultProps = {
  guardrails: null,
  isEnabled: false,
  isCollapsed: false,
  validationErrors: null,
  scenarioName: "",
  scenarioGuardrailMap: null,
};

export default GuardrailsSection;
