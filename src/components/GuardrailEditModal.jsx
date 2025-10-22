import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import LoadingSpinner from './LoadingSpinner.jsx';
import HelpTooltip from './HelpTooltip.jsx';
import { guardrailConfigurationManager } from '../services/guardrailConfigurationManager.js';
import { uiStateRecovery } from '../utils/uiStateRecovery.js';

/**
 * GuardrailEditModal component provides a comprehensive interface for editing guardrail settings
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {string} props.guardrailId - The guardrail ID to edit
 * @param {Function} props.onClose - Callback when modal is closed
 * @param {Function} props.onSave - Callback when guardrail is saved successfully
 */
function GuardrailEditModal({ isOpen, guardrailId, onClose, onSave }) {
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    relevanceThreshold: 0.5,
    confidenceThreshold: 0.5,
    blockedInputMessage: '',
    blockedOutputMessage: '',
    activeConfigurations: {
      TOPIC_POLICY: false,
      CONTENT_POLICY: false,
      WORD_POLICY: false,
      SENSITIVE_INFORMATION: false,
      CONTEXTUAL_GROUNDING: false,
      AUTOMATED_REASONING: false
    }
  });

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);



  // Load guardrail data when modal opens
  useEffect(() => {
    if (isOpen && guardrailId) {
      loadGuardrailData();
    }
  }, [isOpen, guardrailId]);

  // Handle escape key and focus management
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    // Accessibility: trap focus within modal
    const handleTabKey = (e) => {
      if (e.key === 'Tab') {
        const focusableElements = document.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleTabKey);

    // Set initial focus to first input
    const firstInput = document.querySelector('[data-modal-first-input]');
    if (firstInput) {
      firstInput.focus();
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTabKey);
    };
  }, [isOpen]);

  // Track form changes
  useEffect(() => {
    setHasUnsavedChanges(true);
  }, [formData]);

  const loadGuardrailData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Use GetGuardrailCommand through GuardrailConfigurationManager for preloading modal data
      const guardrailConfig = await guardrailConfigurationManager.guardrailService.getGuardrail(guardrailId);

      // Get configuration states using existing GuardrailConfigurationManager integration
      const configStates = await guardrailConfigurationManager.getConfigurationStates(guardrailId);

      // Extract threshold values from contextual grounding policy
      let relevanceThreshold = 0.5;
      let confidenceThreshold = 0.5;

      // Check both possible locations for contextual grounding configuration
      const contextualGrounding = guardrailConfig.contextualGroundingPolicy || guardrailConfig.contextualGroundingPolicyConfig;
      if (contextualGrounding?.filters?.length > 0) {
        relevanceThreshold = contextualGrounding.filters[0].threshold || 0.5;
      } else if (contextualGrounding?.filtersConfig?.length > 0) {
        relevanceThreshold = contextualGrounding.filtersConfig[0].threshold || 0.5;
      }

      // Populate form with current guardrail data
      setFormData({
        name: guardrailConfig.name || '',
        description: guardrailConfig.description || '',
        relevanceThreshold: relevanceThreshold,
        confidenceThreshold: confidenceThreshold,
        blockedInputMessage: guardrailConfig.blockedInputMessaging || '',
        blockedOutputMessage: guardrailConfig.blockedOutputsMessaging || '',
        activeConfigurations: {
          TOPIC_POLICY: configStates.configurations?.TOPIC_POLICY?.isActive || false,
          CONTENT_POLICY: configStates.configurations?.CONTENT_POLICY?.isActive || false,
          WORD_POLICY: configStates.configurations?.WORD_POLICY?.isActive || false,
          SENSITIVE_INFORMATION: configStates.configurations?.SENSITIVE_INFORMATION?.isActive || false,
          CONTEXTUAL_GROUNDING: configStates.configurations?.CONTEXTUAL_GROUNDING?.isActive || false,
          AUTOMATED_REASONING: configStates.configurations?.AUTOMATED_REASONING?.isActive || false
        }
      });

      setHasUnsavedChanges(false);
      console.log('Guardrail data loaded successfully for modal:', guardrailId);
    } catch (err) {
      console.error('Failed to load guardrail data:', err);
      const errorMessage = `Failed to load guardrail data: ${err.message}`;
      setError(errorMessage);

      // Show error notification
      uiStateRecovery.showUserNotification({
        type: 'error',
        message: errorMessage,
        duration: 5000,
        actions: [{
          label: 'Retry',
          action: () => loadGuardrailData()
        }]
      });
    } finally {
      setIsLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};

    // Required field checking
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    }

    // Threshold validation
    if (formData.relevanceThreshold < 0 || formData.relevanceThreshold > 1) {
      errors.relevanceThreshold = 'Relevance threshold must be between 0 and 1';
    }

    if (formData.confidenceThreshold < 0 || formData.confidenceThreshold > 1) {
      errors.confidenceThreshold = 'Confidence threshold must be between 0 and 1';
    }

    // Validate that at least one configuration is active
    const hasActiveConfiguration = Object.values(formData.activeConfigurations).some(isActive => isActive);
    if (!hasActiveConfiguration) {
      errors.activeConfigurations = 'At least one guardrail configuration must be active';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleConfigurationToggle = (configurationType, isActive) => {
    setFormData(prev => ({
      ...prev,
      activeConfigurations: {
        ...prev.activeConfigurations,
        [configurationType]: isActive
      }
    }));

    // Clear validation error for active configurations if at least one is now active
    if (validationErrors.activeConfigurations && isActive) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.activeConfigurations;
        return newErrors;
      });
    }
  };



  const handleSave = async () => {
    // Form validation with required field checking
    if (!validateForm()) {
      // Show validation error notification
      uiStateRecovery.showUserNotification({
        type: 'error',
        message: 'Please fix the validation errors before saving',
        duration: 3000
      });
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Get current guardrail configuration for update
      const currentConfig = await guardrailConfigurationManager.guardrailService.getGuardrail(guardrailId);
      const normalizedConfig = guardrailConfigurationManager.normalizeForUpdate(currentConfig);

      // Build update payload with form data
      const updatePayload = {
        guardrailIdentifier: guardrailId,
        name: formData.name,
        description: formData.description,
        blockedInputMessaging: formData.blockedInputMessage,
        blockedOutputsMessaging: formData.blockedOutputMessage
      };

      // Update contextual grounding threshold if configuration is active
      if (formData.activeConfigurations.CONTEXTUAL_GROUNDING && normalizedConfig.contextualGroundingPolicyConfig) {
        const contextualConfig = JSON.parse(JSON.stringify(normalizedConfig.contextualGroundingPolicyConfig));
        if (contextualConfig.filtersConfig && contextualConfig.filtersConfig.length > 0) {
          contextualConfig.filtersConfig[0].threshold = formData.relevanceThreshold;
          updatePayload.contextualGroundingPolicyConfig = contextualConfig;
        }
      }

      // Apply configuration toggles using existing UpdateGuardrailCommand integration
      for (const [configurationType, isActive] of Object.entries(formData.activeConfigurations)) {
        const currentState = await guardrailConfigurationManager.getConfigurationStates(guardrailId);
        const currentlyActive = currentState.configurations?.[configurationType]?.isActive || false;

        // Only toggle if state has changed
        if (currentlyActive !== isActive) {
          await guardrailConfigurationManager.toggleConfiguration(guardrailId, configurationType, isActive);
        }
      }

      // Update basic properties if they've changed
      if (formData.name !== currentConfig.name ||
          formData.description !== currentConfig.description ||
          formData.blockedInputMessage !== currentConfig.blockedInputMessaging ||
          formData.blockedOutputMessage !== currentConfig.blockedOutputsMessaging) {

        // Use UpdateGuardrailCommand for basic property updates
        const { UpdateGuardrailCommand } = await import("@aws-sdk/client-bedrock");
        const updateCommand = new UpdateGuardrailCommand(updatePayload);
        await guardrailConfigurationManager.guardrailService.managementClient.send(updateCommand);
      }

      // Handle save success with toast notification
      uiStateRecovery.showUserNotification({
        type: 'success',
        message: 'Guardrail settings saved successfully',
        duration: 3000
      });

      // Call the onSave callback with the updated data
      onSave?.(formData);

      // Reset unsaved changes flag
      setHasUnsavedChanges(false);

      // Close the modal
      handleClose();

      console.log('Guardrail saved successfully:', guardrailId);
    } catch (err) {
      console.error('Failed to save guardrail:', err);
      const errorMessage = `Failed to save guardrail: ${err.message}`;
      setError(errorMessage);

      // Handle save failure with toast notification
      uiStateRecovery.showUserNotification({
        type: 'error',
        message: errorMessage,
        duration: 5000,
        actions: [{
          label: 'Retry',
          action: () => handleSave()
        }]
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    // Cancel operation without applying changes
    if (hasUnsavedChanges) {
      const confirmClose = window.confirm('You have unsaved changes. Are you sure you want to close without saving?');
      if (!confirmClose) {
        return;
      }

      // Show notification about cancelled changes
      uiStateRecovery.showUserNotification({
        type: 'warning',
        message: 'Changes cancelled - guardrail settings were not saved',
        duration: 3000
      });
    }

    // Reset form state
    setError(null);
    setValidationErrors({});
    setHasUnsavedChanges(false);

    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <style>
        {`
          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            background: #10b981;
            height: 20px;
            width: 20px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            cursor: pointer;
          }

          input[type="range"]::-webkit-slider-thumb:hover {
            background: #059669;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
          }

          input[type="range"]::-moz-range-thumb {
            background: #10b981;
            height: 20px;
            width: 20px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            cursor: pointer;
          }

          input[type="range"]::-moz-range-thumb:hover {
            background: #059669;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
          }

          input[type="range"]:focus {
            outline: none;
          }

          input[type="range"]:focus::-webkit-slider-thumb {
            box-shadow: 0 0 0 2px #10b981, 0 0 0 4px rgba(16, 185, 129, 0.1);
          }

          input[type="range"]:focus::-moz-range-thumb {
            box-shadow: 0 0 0 2px #10b981, 0 0 0 4px rgba(16, 185, 129, 0.1);
          }
        `}
      </style>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
      >
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[95vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <div>
            <h3 id="modal-title" className="text-lg font-semibold text-gray-900">
              Edit Guardrail Settings
            </h3>
            <p id="modal-description" className="text-sm text-gray-600 mt-1">
              Configure guardrail properties and active policies
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 rounded p-1"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(95vh-140px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" text="Loading guardrail data..." />
            </div>
          ) : isSaving ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" text="Saving guardrail settings..." />
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                  <div className="ml-auto">
                    <button
                      onClick={loadGuardrailData}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Basic Information */}
              <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <h4 className="text-base font-medium text-gray-900 flex items-center space-x-2">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Basic Information</span>
                </h4>

                {/* Name Field */}
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <label htmlFor="guardrail-name" className="block text-sm font-medium text-gray-700">
                      Name
                    </label>
                    <HelpTooltip
                      content="The guardrail name cannot be changed after creation. This is set by AWS Bedrock."
                      position="right"
                    />
                  </div>
                  <input
                    id="guardrail-name"
                    data-modal-first-input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className={`input-field bg-gray-100 cursor-not-allowed ${validationErrors.name ? 'input-field-error' : ''}`}
                    placeholder="Enter guardrail name"
                    disabled
                    readOnly
                  />
                  {validationErrors.name && (
                    <p className="validation-error-text">
                      <svg className="w-4 h-4 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>{validationErrors.name}</span>
                    </p>
                  )}
                </div>

                {/* Description Field */}
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <label htmlFor="guardrail-description" className="block text-sm font-medium text-gray-700">
                      Description
                    </label>
                    <HelpTooltip
                      content="A detailed description of what this guardrail is designed to protect against and its intended use case."
                      position="right"
                    />
                  </div>
                  <textarea
                    id="guardrail-description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className={`input-field resize-none h-16 ${validationErrors.description ? 'input-field-error' : ''}`}
                    placeholder="Enter guardrail description"
                  />
                  {validationErrors.description && (
                    <p className="validation-error-text">
                      <svg className="w-4 h-4 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>{validationErrors.description}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Threshold Settings */}
              <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <h4 className="text-base font-medium text-gray-900 flex items-center space-x-2">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span>Threshold Settings</span>
                </h4>

                {/* Relevance Threshold */}
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <label htmlFor="relevance-threshold" className="block text-sm font-medium text-gray-700">
                      Relevance Threshold: {formData.relevanceThreshold.toFixed(2)}
                    </label>
                    <HelpTooltip
                      content="Controls how relevant content must be to trigger contextual grounding policies. Lower values are more sensitive."
                      position="right"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-xs text-gray-500">0.0</span>
                    <input
                      id="relevance-threshold"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={formData.relevanceThreshold}
                      onChange={(e) => handleInputChange('relevanceThreshold', parseFloat(e.target.value))}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #10b981 0%, #10b981 ${formData.relevanceThreshold * 100}%, #e5e7eb ${formData.relevanceThreshold * 100}%, #e5e7eb 100%)`,
                        WebkitAppearance: 'none',
                        appearance: 'none'
                      }}
                    />
                    <span className="text-xs text-gray-500">1.0</span>
                  </div>
                  {validationErrors.relevanceThreshold && (
                    <p className="validation-error-text">
                      <svg className="w-4 h-4 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>{validationErrors.relevanceThreshold}</span>
                    </p>
                  )}
                </div>

                {/* Confidence Threshold */}
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <label htmlFor="confidence-threshold" className="block text-sm font-medium text-gray-700">
                      Confidence Threshold: {formData.confidenceThreshold.toFixed(2)}
                    </label>
                    <HelpTooltip
                      content="Sets the confidence level required for guardrail interventions. Higher values require more certainty before blocking content."
                      position="right"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-xs text-gray-500">0.0</span>
                    <input
                      id="confidence-threshold"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={formData.confidenceThreshold}
                      onChange={(e) => handleInputChange('confidenceThreshold', parseFloat(e.target.value))}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #10b981 0%, #10b981 ${formData.confidenceThreshold * 100}%, #e5e7eb ${formData.confidenceThreshold * 100}%, #e5e7eb 100%)`,
                        WebkitAppearance: 'none',
                        appearance: 'none'
                      }}
                    />
                    <span className="text-xs text-gray-500">1.0</span>
                  </div>
                  {validationErrors.confidenceThreshold && (
                    <p className="validation-error-text">
                      <svg className="w-4 h-4 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>{validationErrors.confidenceThreshold}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Blocked Messages */}
              <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <h4 className="text-base font-medium text-gray-900 flex items-center space-x-2">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span>Blocked Messages</span>
                </h4>

                {/* Blocked Input Message */}
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <label htmlFor="blocked-input-message" className="block text-sm font-medium text-gray-700">
                      Blocked Input Message
                    </label>
                    <HelpTooltip
                      content="Message shown to users when their input is blocked by the guardrail. Keep it helpful and informative."
                      position="right"
                    />
                  </div>
                  <textarea
                    id="blocked-input-message"
                    value={formData.blockedInputMessage}
                    onChange={(e) => handleInputChange('blockedInputMessage', e.target.value)}
                    className="input-field resize-none h-16"
                    placeholder="Enter message for blocked inputs"
                  />
                </div>

                {/* Blocked Output Message */}
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <label htmlFor="blocked-output-message" className="block text-sm font-medium text-gray-700">
                      Blocked Output Message
                    </label>
                    <HelpTooltip
                      content="Message shown when the AI's response is blocked by the guardrail. Should explain why the response was filtered."
                      position="right"
                    />
                  </div>
                  <textarea
                    id="blocked-output-message"
                    value={formData.blockedOutputMessage}
                    onChange={(e) => handleInputChange('blockedOutputMessage', e.target.value)}
                    className="input-field resize-none h-16"
                    placeholder="Enter message for blocked outputs"
                  />
                </div>
              </div>

              {/* Active Configurations */}
              <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className="flex items-center space-x-2">
                  <h4 className="text-base font-medium text-gray-900 flex items-center space-x-2">
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                    </svg>
                    <span>Active Configurations</span>
                  </h4>
                  <HelpTooltip
                    content="Enable or disable specific guardrail policies. Changes will be applied when you save the guardrail."
                    position="right"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(formData.activeConfigurations).map(([configType, isActive]) => (
                    <div key={configType} className={`flex items-center justify-between p-2 rounded border transition-all duration-200 ${
                      isActive
                        ? 'bg-green-50 border-green-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}>
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          {configType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                        <p className="text-xs text-gray-500 mt-1">
                          {getConfigurationDescription(configType)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleConfigurationToggle(configType, !isActive)}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                          isActive ? 'bg-primary-600' : 'bg-gray-200'
                        }`}
                        role="switch"
                        aria-checked={isActive}
                        aria-label={`Toggle ${configType.replace(/_/g, ' ')}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            isActive ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>

                {validationErrors.activeConfigurations && (
                  <p className="validation-error-text">
                    <svg className="w-4 h-4 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{validationErrors.activeConfigurations}</span>
                  </p>
                )}
              </div>


            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-2">
            {hasUnsavedChanges && (
              <span className="text-sm text-yellow-600">
                You have unsaved changes
              </span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <LoadingSpinner size="sm" color="white" inline />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

// Helper function to get configuration descriptions
function getConfigurationDescription(configType) {
  const descriptions = {
    TOPIC_POLICY: 'Controls topic-based content filtering',
    CONTENT_POLICY: 'Manages harmful content detection',
    WORD_POLICY: 'Filters specific words and phrases',
    SENSITIVE_INFORMATION: 'Detects and protects PII data',
    CONTEXTUAL_GROUNDING: 'Ensures response relevance and accuracy',
    AUTOMATED_REASONING: 'Applies automated policy reasoning'
  };
  return descriptions[configType] || 'Configuration policy';
}

GuardrailEditModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  guardrailId: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func
};

GuardrailEditModal.defaultProps = {
  guardrailId: null,
  onSave: null
};

export default GuardrailEditModal;
