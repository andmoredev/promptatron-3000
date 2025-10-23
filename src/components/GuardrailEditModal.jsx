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
    contentPolicyFilters: [],
    // Editors for policy contents
    topics: [], // [{ name, definition, examples: [] }]
    wordsText: '', // newline separated custom words
    managedWordLists: [], // e.g. ['PROFANITY']
    regexes: [], // [{ name, pattern, description }]
    piiEntities: [],
    contextualGrounding: {
      GROUNDING: { threshold: 0.5, action: 'BLOCK', enabled: true },
      RELEVANCE: { threshold: 0.5, action: 'BLOCK', enabled: true }
    },
    // Policy-level action editors (applied to all items in that policy)
    topicPolicyActions: { inputAction: 'BLOCK', outputAction: 'BLOCK' },
    wordPolicyActions: { inputAction: 'BLOCK', outputAction: 'NONE' },
    piiPolicyActions: { inputAction: 'BLOCK', outputAction: 'ANONYMIZE' },
    regexPolicyActions: { inputAction: 'BLOCK', outputAction: 'ANONYMIZE' },
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
  const [piiExpanded, setPiiExpanded] = useState(false);



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

      // Extract contextual grounding filters (GROUNDING and RELEVANCE)
      let relevanceThreshold = 0.5;
      let confidenceThreshold = 0.5; // kept for UI parity; used for RELEVANCE
      const cg = guardrailConfig.contextualGroundingPolicy || guardrailConfig.contextualGroundingPolicyConfig;
      const cgFilters = (cg?.filters || cg?.filtersConfig || [])
        .reduce((acc, f) => {
          if (f?.type === 'GROUNDING') acc.GROUNDING = { threshold: f.threshold ?? 0.5, action: f.action || 'BLOCK', enabled: f.enabled !== false };
          if (f?.type === 'RELEVANCE') acc.RELEVANCE = { threshold: f.threshold ?? 0.5, action: f.action || 'BLOCK', enabled: f.enabled !== false };
          return acc;
        }, { GROUNDING: { threshold: 0.5, action: 'BLOCK', enabled: true }, RELEVANCE: { threshold: 0.5, action: 'BLOCK', enabled: true } });
      relevanceThreshold = cgFilters.RELEVANCE.threshold;
      confidenceThreshold = cgFilters.GROUNDING.threshold;

      // Extract content policy filters from either ... or ...Config shapes
      const contentPolicy = guardrailConfig.contentPolicy || guardrailConfig.contentPolicyConfig || {};
      const contentFiltersSrc = contentPolicy.filters || contentPolicy.filtersConfig || [];
      const contentPolicyFilters = (contentFiltersSrc || []).map(f => ({
        type: f.type || 'SEXUAL',
        inputStrength: f.inputStrength || 'HIGH',
        outputStrength: f.outputStrength || 'HIGH',
        inputAction: f.inputAction || 'BLOCK',
        outputAction: f.outputAction || 'NONE'
      }));

      // Topic policy actions (derive from first topic if present)
      const topicCfg = guardrailConfig.topicPolicy || guardrailConfig.topicPolicyConfig || {};
      const topicsArr = topicCfg.topics || topicCfg.topicsConfig || [];
      const topicPolicyActions = {
        inputAction: topicsArr[0]?.inputAction || 'BLOCK',
        outputAction: topicsArr[0]?.outputAction || 'BLOCK'
      };
      const topics = (topicsArr || []).map(t => ({
        name: t.name || '',
        definition: t.definition || '',
        examples: Array.isArray(t.examples) ? t.examples : [],
        // Preserve raw text for UI editing so spaces are not lost while typing
        examplesText: Array.isArray(t.examples) ? (t.examples || []).join('\n') : ''
      }));

      // Word policy actions (derive from first found item)
      const wordCfg = guardrailConfig.wordPolicy || guardrailConfig.wordPolicyConfig || {};
      const wordsArr = wordCfg.words || wordCfg.wordsConfig || [];
      const listsArr = wordCfg.managedWordLists || wordCfg.managedWordListsConfig || [];
      const firstWord = wordsArr[0];
      const firstList = listsArr[0];
      const wordPolicyActions = {
        inputAction: (firstWord?.inputAction || firstList?.inputAction) || 'BLOCK',
        outputAction: (firstWord?.outputAction || firstList?.outputAction) || 'NONE'
      };
      const wordsText = (wordsArr || [])
        .map(w => typeof w === 'string' ? w : (w.text || ''))
        .filter(Boolean)
        .join('\n');
      const managedWordLists = (listsArr || []).map(l => (typeof l === 'string' ? l : l.type)).filter(Boolean);

      // Sensitive info actions (PII entities)
      const sensCfg = guardrailConfig.sensitiveInformationPolicy || guardrailConfig.sensitiveInformationPolicyConfig || {};
      const piiArr = sensCfg.piiEntities || sensCfg.piiEntitiesConfig || [];
      const regexArr = sensCfg.regexes || sensCfg.regexesConfig || [];
      const piiPolicyActions = {
        inputAction: piiArr[0]?.inputAction || 'BLOCK',
        outputAction: piiArr[0]?.outputAction || 'ANONYMIZE'
      };
      const regexPolicyActions = {
        inputAction: regexArr[0]?.inputAction || 'BLOCK',
        outputAction: regexArr[0]?.outputAction || 'ANONYMIZE'
      };
      const regexes = (regexArr || []).map(r => ({
        name: r.name || '',
        pattern: r.pattern || '',
        description: r.description || ''
      }));
      const piiEntities = (piiArr || []).map(p => (typeof p === 'string' ? p : p.type)).filter(Boolean);

      // Populate form with current guardrail data
      setFormData({
        name: guardrailConfig.name || '',
        description: guardrailConfig.description || '',
        relevanceThreshold: relevanceThreshold,
        confidenceThreshold: confidenceThreshold,
        blockedInputMessage: guardrailConfig.blockedInputMessaging || '',
        blockedOutputMessage: guardrailConfig.blockedOutputsMessaging || '',
        contentPolicyFilters,
        topics,
        wordsText,
        managedWordLists,
        regexes,
        piiEntities,
        topicPolicyActions,
        wordPolicyActions,
        piiPolicyActions,
        regexPolicyActions,
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


  // Content policy editor helpers
  const CONTENT_FILTER_TYPES = ['SEXUAL', 'VIOLENCE', 'HATE', 'INSULTS', 'MISCONDUCT', 'PROMPT_ATTACK'];
  const STRENGTH_LEVELS = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];
  const CONTENT_ACTIONS = ['BLOCK', 'NONE'];
  const WORD_ACTIONS = ['BLOCK', 'NONE'];
  const TOPIC_ACTIONS = ['BLOCK', 'NONE'];
  const PII_ACTIONS = ['BLOCK', 'ANONYMIZE'];
  const PII_TYPES = [
    'ADDRESS', 'AGE', 'AWS_ACCESS_KEY', 'AWS_SECRET_KEY', 'CA_HEALTH_NUMBER',
    'CA_SOCIAL_INSURANCE_NUMBER', 'CREDIT_DEBIT_CARD_CVV', 'CREDIT_DEBIT_CARD_EXPIRY',
    'CREDIT_DEBIT_CARD_NUMBER', 'DRIVER_ID', 'EMAIL', 'INTERNATIONAL_BANK_ACCOUNT_NUMBER',
    'IP_ADDRESS', 'LICENSE_PLATE', 'MAC_ADDRESS', 'NAME', 'PASSWORD', 'PHONE', 'PIN',
    'SWIFT_CODE', 'UK_NATIONAL_HEALTH_SERVICE_NUMBER', 'UK_NATIONAL_INSURANCE_NUMBER',
    'UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER', 'URL', 'USERNAME', 'US_BANK_ACCOUNT_NUMBER',
    'US_BANK_ROUTING_NUMBER', 'US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER',
    'US_PASSPORT_NUMBER', 'US_SOCIAL_SECURITY_NUMBER', 'VEHICLE_IDENTIFICATION_NUMBER'
  ];

  const addContentFilter = () => {
    setFormData(prev => ({
      ...prev,
      contentPolicyFilters: [
        ...prev.contentPolicyFilters,
        { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH', inputAction: 'BLOCK', outputAction: 'NONE' }
      ]
    }));
  };

  const removeContentFilter = (index) => {
    setFormData(prev => ({
      ...prev,
      contentPolicyFilters: prev.contentPolicyFilters.filter((_, i) => i !== index)
    }));
  };

  const updateContentFilter = (index, field, value) => {
    setFormData(prev => {
      const next = [...prev.contentPolicyFilters];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, contentPolicyFilters: next };
    });
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

      // Include content policy filter updates when provided
      if (formData.contentPolicyFilters && formData.contentPolicyFilters.length > 0) {
        const contentPolicyConfig = JSON.parse(JSON.stringify(normalizedConfig.contentPolicyConfig || {}));
        contentPolicyConfig.filtersConfig = formData.contentPolicyFilters.map(f => ({
          type: f.type,
          inputStrength: f.inputStrength,
          outputStrength: f.outputStrength,
          inputAction: f.inputAction,
          outputAction: f.outputAction
        }));
        updatePayload.contentPolicyConfig = contentPolicyConfig;
      }

      // Topics: build from editor if provided, else apply actions to existing
      if (formData.activeConfigurations.TOPIC_POLICY) {
        if (Array.isArray(formData.topics) && formData.topics.length > 0) {
          const topicsConfig = formData.topics.map(t => ({
            name: t.name || 'topic',
            definition: t.definition || '',
            examples: Array.isArray(t.examples) ? t.examples : [],
            type: 'DENY',
            inputAction: formData.topicPolicyActions.inputAction,
            outputAction: formData.topicPolicyActions.outputAction,
            inputEnabled: true,
            outputEnabled: true
          }));
          updatePayload.topicPolicyConfig = { topicsConfig };
        } else if (normalizedConfig.topicPolicyConfig?.topicsConfig?.length) {
          const topicPolicyConfig = JSON.parse(JSON.stringify(normalizedConfig.topicPolicyConfig));
          for (const topic of topicPolicyConfig.topicsConfig) {
            topic.inputAction = formData.topicPolicyActions.inputAction;
            topic.outputAction = formData.topicPolicyActions.outputAction;
          }
          updatePayload.topicPolicyConfig = topicPolicyConfig;
        }
      }

      // Words: build from editor if provided, else apply actions to existing
      if (formData.activeConfigurations.WORD_POLICY) {
        const words = (formData.wordsText || '')
          .split(/\r?\n/)
          .map(s => s.trim())
          .filter(Boolean);
        const managed = Array.isArray(formData.managedWordLists) ? formData.managedWordLists : [];

        if (words.length > 0 || managed.length > 0) {
          const wordPolicyConfig = {};
          if (words.length > 0) {
            wordPolicyConfig.wordsConfig = words.map(text => ({
              text,
              inputAction: formData.wordPolicyActions.inputAction,
              outputAction: formData.wordPolicyActions.outputAction,
              inputEnabled: true,
              outputEnabled: true
            }));
          }
          if (managed.length > 0) {
            wordPolicyConfig.managedWordListsConfig = managed.map(type => ({
              type,
              inputAction: formData.wordPolicyActions.inputAction,
              outputAction: formData.wordPolicyActions.outputAction,
              inputEnabled: true,
              outputEnabled: true
            }));
          }
          updatePayload.wordPolicyConfig = wordPolicyConfig;
        } else if (normalizedConfig.wordPolicyConfig && (normalizedConfig.wordPolicyConfig.wordsConfig || normalizedConfig.wordPolicyConfig.managedWordListsConfig)) {
          const wordPolicyConfig = JSON.parse(JSON.stringify(normalizedConfig.wordPolicyConfig));
          if (Array.isArray(wordPolicyConfig.wordsConfig)) {
            for (const word of wordPolicyConfig.wordsConfig) {
              word.inputAction = formData.wordPolicyActions.inputAction;
              word.outputAction = formData.wordPolicyActions.outputAction;
            }
          }
          if (Array.isArray(wordPolicyConfig.managedWordListsConfig)) {
            for (const list of wordPolicyConfig.managedWordListsConfig) {
              list.inputAction = formData.wordPolicyActions.inputAction;
              list.outputAction = formData.wordPolicyActions.outputAction;
            }
          }
          updatePayload.wordPolicyConfig = wordPolicyConfig;
        }
      }

      // Sensitive info: build from editor selections, else only update actions
      if (formData.activeConfigurations.SENSITIVE_INFORMATION) {
        const hasEditedRegexes = Array.isArray(formData.regexes) && formData.regexes.length > 0;
        const hasEditedPii = Array.isArray(formData.piiEntities) && formData.piiEntities.length > 0;
        const sensitiveConfig = JSON.parse(JSON.stringify(normalizedConfig.sensitiveInformationPolicyConfig || {}));

        if (Array.isArray(sensitiveConfig.piiEntitiesConfig)) {
          for (const ent of sensitiveConfig.piiEntitiesConfig) {
            ent.inputAction = formData.piiPolicyActions.inputAction;
            ent.outputAction = formData.piiPolicyActions.outputAction;
          }
        }

        if (hasEditedPii) {
          sensitiveConfig.piiEntitiesConfig = formData.piiEntities.map(type => ({
            type,
            action: formData.piiPolicyActions.outputAction,
            inputAction: formData.piiPolicyActions.inputAction,
            outputAction: formData.piiPolicyActions.outputAction,
            inputEnabled: true,
            outputEnabled: true
          }));
        }

        if (hasEditedRegexes) {
          sensitiveConfig.regexesConfig = formData.regexes
            .filter(r => (r.name && r.pattern))
            .map(r => ({
              name: r.name,
              pattern: r.pattern,
              description: r.description || `Custom pattern: ${r.name}`,
              action: formData.regexPolicyActions.outputAction,
              inputAction: formData.regexPolicyActions.inputAction,
              outputAction: formData.regexPolicyActions.outputAction,
              inputEnabled: true,
              outputEnabled: true
            }));
        } else if (Array.isArray(sensitiveConfig.regexesConfig)) {
          for (const rx of sensitiveConfig.regexesConfig) {
            rx.inputAction = formData.regexPolicyActions.inputAction;
            rx.outputAction = formData.regexPolicyActions.outputAction;
          }
        }

        if (sensitiveConfig.piiEntitiesConfig || sensitiveConfig.regexesConfig) {
          updatePayload.sensitiveInformationPolicyConfig = sensitiveConfig;
        }
      }

      // Update contextual grounding filters if configuration is active
      if (formData.activeConfigurations.CONTEXTUAL_GROUNDING) {
        const cg = formData.contextualGrounding || {
          GROUNDING: { threshold: formData.confidenceThreshold ?? 0.5, action: 'BLOCK', enabled: true },
          RELEVANCE: { threshold: formData.relevanceThreshold ?? 0.5, action: 'BLOCK', enabled: true }
        };
        const filtersConfig = [];
        if (cg.GROUNDING) {
          filtersConfig.push({ type: 'GROUNDING', threshold: Number(cg.GROUNDING.threshold ?? 0.5), action: cg.GROUNDING.action || 'BLOCK', enabled: cg.GROUNDING.enabled !== false });
        }
        if (cg.RELEVANCE) {
          filtersConfig.push({ type: 'RELEVANCE', threshold: Number(cg.RELEVANCE.threshold ?? 0.5), action: cg.RELEVANCE.action || 'BLOCK', enabled: cg.RELEVANCE.enabled !== false });
        }
        if (filtersConfig.length) updatePayload.contextualGroundingPolicyConfig = { filtersConfig };
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

      // Decide if we need to send an update based on any changes being present
      const propsChanged = (
        formData.name !== currentConfig.name ||
        formData.description !== currentConfig.description ||
        formData.blockedInputMessage !== currentConfig.blockedInputMessaging ||
        formData.blockedOutputMessage !== currentConfig.blockedOutputsMessaging
      );

      const hasPolicyUpdates = !!(updatePayload.contentPolicyConfig || updatePayload.contextualGroundingPolicyConfig || updatePayload.topicPolicyConfig || updatePayload.wordPolicyConfig || updatePayload.sensitiveInformationPolicyConfig);

      if (propsChanged || hasPolicyUpdates) {
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
    // Close immediately without blocking alerts
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
        className="guardrail-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
      >
        <div className="guardrail-modal-content">
          {/* Header */}
          <div className="guardrail-modal-header bg-green-50 border-b border-green-200">
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
              className="guardrail-modal-close-button"
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
            <div className="p-4 pb-44 space-y-4">
                {/* Basic Information */}
                <div className="guardrail-form-section">
                  <h4 className="guardrail-form-section-header">
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

              {/* Blocked Messages */}
              <div className="guardrail-form-section">
                <h4 className="guardrail-form-section-header">
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

                {/* Threshold Settings */}
                <div className="guardrail-form-section">
                  <h4 className="guardrail-form-section-header">
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
                        className="guardrail-threshold-slider"
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

                {/* Active Configurations */}
                <div className="guardrail-form-section">
                  <div className="flex items-center space-x-2">
                    <h4 className="guardrail-form-section-header">
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
                      <div key={configType} className={`flex items-center justify-between p-2 rounded border transition-all duration-200 ${isActive
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
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${isActive ? 'bg-primary-600' : 'bg-gray-200'
                            }`}
                          role="switch"
                          aria-checked={isActive}
                          aria-label={`Toggle ${configType.replace(/_/g, ' ')}`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isActive ? 'translate-x-4' : 'translate-x-0'
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



                {/* Content Policy Filters */}
                {formData.activeConfigurations.CONTENT_POLICY && (
                  <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-medium text-gray-900 flex items-center space-x-2">
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
                        </svg>
                        <span>Content Policy Filters</span>
                        <HelpTooltip
                          content="Configure content filters with separate input/output strengths and actions."
                          position="right"
                        />
                      </h4>
                      <button onClick={addContentFilter} className="btn-secondary text-sm px-2 py-1">
                        + Add Filter
                      </button>
                    </div>

                    {formData.contentPolicyFilters.length === 0 ? (
                      <p className="text-sm text-gray-500">No filters added yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {formData.contentPolicyFilters.map((f, idx) => (
                          <div key={idx} className="p-3 bg-white border border-gray-200 rounded-md">
                            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                              <div className="md:col-span-1">
                                <label className="block text-xs font-medium text-gray-700">Type</label>
                                <select
                                  className="input"
                                  value={f.type}
                                  onChange={e => updateContentFilter(idx, 'type', e.target.value)}
                                >
                                  {CONTENT_FILTER_TYPES.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700">Input Strength</label>
                                <select
                                  className="input"
                                  value={f.inputStrength}
                                  onChange={e => updateContentFilter(idx, 'inputStrength', e.target.value)}
                                >
                                  {STRENGTH_LEVELS.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700">Output Strength</label>
                                <select
                                  className="input"
                                  value={f.outputStrength}
                                  onChange={e => updateContentFilter(idx, 'outputStrength', e.target.value)}
                                >
                                  {STRENGTH_LEVELS.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700">Input Action</label>
                                <select
                                  className="input"
                                  value={f.inputAction}
                                  onChange={e => updateContentFilter(idx, 'inputAction', e.target.value)}
                                >
                                  {CONTENT_ACTIONS.map(a => (
                                    <option key={a} value={a}>{a}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700">Output Action</label>
                                <select
                                  className="input"
                                  value={f.outputAction}
                                  onChange={e => updateContentFilter(idx, 'outputAction', e.target.value)}
                                >
                                  {CONTENT_ACTIONS.map(a => (
                                    <option key={a} value={a}>{a}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex md:justify-end">
                                <button
                                  type="button"
                                  onClick={() => removeContentFilter(idx)}
                                  className="text-sm text-red-600 hover:text-red-700"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Topic Policy Actions */}
                {formData.activeConfigurations.TOPIC_POLICY && (
                  <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <h4 className="text-base font-medium text-gray-900 flex items-center space-x-2">
                      <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                      </svg>
                      <span>Topic Policy Actions</span>
                      <HelpTooltip content="Set input/output actions for all topics." position="right" />
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Input Action</label>
                        <select
                          className="input"
                          value={formData.topicPolicyActions.inputAction}
                          onChange={e => setFormData(prev => ({ ...prev, topicPolicyActions: { ...prev.topicPolicyActions, inputAction: e.target.value } }))}
                        >
                          {TOPIC_ACTIONS.map(a => (<option key={a} value={a}>{a}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Output Action</label>
                        <select
                          className="input"
                          value={formData.topicPolicyActions.outputAction}
                          onChange={e => setFormData(prev => ({ ...prev, topicPolicyActions: { ...prev.topicPolicyActions, outputAction: e.target.value } }))}
                        >
                          {TOPIC_ACTIONS.map(a => (<option key={a} value={a}>{a}</option>))}
                        </select>
                      </div>
                    </div>
                    {/* Topics Editor */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">Topics</span>
                        <button
                          type="button"
                          className="btn-secondary text-sm px-2 py-1"
                          onClick={() => setFormData(prev => ({ ...prev, topics: [...prev.topics, { name: '', definition: '', examples: [], examplesText: '' }] }))}
                        >
                          + Add Topic
                        </button>
                      </div>
                      {formData.topics.length === 0 ? (
                        <p className="text-sm text-gray-500">No topics defined.</p>
                      ) : (
                        <div className="space-y-2">
                          {formData.topics.map((t, idx) => (
                            <div key={idx} className="p-3 bg-white border border-gray-200 rounded-md">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700">Name</label>
                                  <input
                                    className="input-field"
                                    value={t.name}
                                    onChange={e => setFormData(prev => { const next = [...prev.topics]; next[idx] = { ...next[idx], name: e.target.value }; return { ...prev, topics: next }; })}
                                    placeholder="e.g., Disallowed Topics"
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <label className="block text-xs font-medium text-gray-700">Definition</label>
                                  <input
                                    className="input-field"
                                    value={t.definition}
                                    onChange={e => setFormData(prev => { const next = [...prev.topics]; next[idx] = { ...next[idx], definition: e.target.value }; return { ...prev, topics: next }; })}
                                    placeholder="Describe the topic scope"
                                  />
                                </div>
                                <div className="md:col-span-3">
                                  <label className="block text-xs font-medium text-gray-700">Examples (one per line)</label>
                                  <textarea
                                    className="input-field resize-none h-16"
                                    value={typeof t.examplesText === 'string' ? t.examplesText : (t.examples || []).join('\n')}
                                    onChange={e => setFormData(prev => {
                                      const next = [...prev.topics];
                                      const raw = e.target.value;
                                      const parsed = raw.split('\n').map(s => s.trim()).filter(s => s.length > 0);
                                      next[idx] = { ...next[idx], examplesText: raw, examples: parsed };
                                      return { ...prev, topics: next };
                                    })}
                                    placeholder="Example 1\nExample 2"
                                  />
                                </div>
                              </div>
                              <div className="mt-2 flex justify-end">
                                <button
                                  type="button"
                                  className="text-sm text-red-600 hover:text-red-700"
                                  onClick={() => setFormData(prev => ({ ...prev, topics: prev.topics.filter((_, i) => i !== idx) }))}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Word Policy Actions */}
                {formData.activeConfigurations.WORD_POLICY && (
                  <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <h4 className="text-base font-medium text-gray-900 flex items-center space-x-2">
                      <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16h8M8 12h8M8 8h8" />
                      </svg>
                      <span>Word Policy Actions</span>
                      <HelpTooltip content="Set input/output actions for all word filters and managed lists." position="right" />
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Input Action</label>
                        <select
                          className="input"
                          value={formData.wordPolicyActions.inputAction}
                          onChange={e => setFormData(prev => ({ ...prev, wordPolicyActions: { ...prev.wordPolicyActions, inputAction: e.target.value } }))}
                        >
                          {WORD_ACTIONS.map(a => (<option key={a} value={a}>{a}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Output Action</label>
                        <select
                          className="input"
                          value={formData.wordPolicyActions.outputAction}
                          onChange={e => setFormData(prev => ({ ...prev, wordPolicyActions: { ...prev.wordPolicyActions, outputAction: e.target.value } }))}
                        >
                          {WORD_ACTIONS.map(a => (<option key={a} value={a}>{a}</option>))}
                        </select>
                      </div>
                    </div>
                    {/* Custom Words */}
                    <div className="mt-3">
                      <span className="block text-sm font-medium text-gray-900 mb-1">Custom Words (one per line)</span>
                      <textarea
                        className="input-field resize-none h-28"
                        value={formData.wordsText}
                        onChange={e => setFormData(prev => ({ ...prev, wordsText: e.target.value }))}
                        placeholder="word1\nword2\nphrase three"
                      />
                    </div>

                    {/* Managed Lists */}
                    <div className="mt-2">
                      <span className="block text-sm font-medium text-gray-900 mb-1">Managed Lists</span>
                      <div className="flex items-center space-x-4 text-sm">
                        <label className="inline-flex items-center space-x-2">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={formData.managedWordLists.includes('PROFANITY')}
                            onChange={e => setFormData(prev => {
                              const set = new Set(prev.managedWordLists);
                              if (e.target.checked) set.add('PROFANITY'); else set.delete('PROFANITY');
                              return { ...prev, managedWordLists: Array.from(set) };
                            })}
                          />
                          <span>PROFANITY</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sensitive Information Actions */}
                {formData.activeConfigurations.SENSITIVE_INFORMATION && (
                  <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <h4 className="text-base font-medium text-gray-900 flex items-center space-x-2">
                      <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.657-1.79-3-4-3S4 9.343 4 11s1.79 3 4 3 4-1.343 4-3zM12 11c0 1.657 1.79 3 4 3s4-1.343 4-3-1.79-3-4-3-4 1.343-4 3z" />
                      </svg>
                      <span>Sensitive Information Actions</span>
                      <HelpTooltip content="Set actions for PII entities and custom regexes." position="right" />
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700">PII Input Action</label>
                        <select
                          className="input"
                          value={formData.piiPolicyActions.inputAction}
                          onChange={e => setFormData(prev => ({ ...prev, piiPolicyActions: { ...prev.piiPolicyActions, inputAction: e.target.value } }))}
                        >
                          {PII_ACTIONS.map(a => (<option key={a} value={a}>{a}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">PII Output Action</label>
                        <select
                          className="input"
                          value={formData.piiPolicyActions.outputAction}
                          onChange={e => setFormData(prev => ({ ...prev, piiPolicyActions: { ...prev.piiPolicyActions, outputAction: e.target.value } }))}
                        >
                          {PII_ACTIONS.map(a => (<option key={a} value={a}>{a}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Regex Input Action</label>
                        <select
                          className="input"
                          value={formData.regexPolicyActions.inputAction}
                          onChange={e => setFormData(prev => ({ ...prev, regexPolicyActions: { ...prev.regexPolicyActions, inputAction: e.target.value } }))}
                        >
                          {PII_ACTIONS.map(a => (<option key={a} value={a}>{a}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Regex Output Action</label>
                        <select
                          className="input"
                          value={formData.regexPolicyActions.outputAction}
                          onChange={e => setFormData(prev => ({ ...prev, regexPolicyActions: { ...prev.regexPolicyActions, outputAction: e.target.value } }))}
                        >
                          {PII_ACTIONS.map(a => (<option key={a} value={a}>{a}</option>))}
                        </select>
                      </div>
                    </div>
                    {/* PII Entities */}
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setPiiExpanded(prev => !prev)}
                        className="w-full flex items-center justify-between p-2 rounded border border-gray-200 bg-white hover:bg-gray-50"
                        aria-expanded={piiExpanded}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">PII Entities</span>
                          <span className="text-xs text-gray-500">{formData.piiEntities.length} selected</span>
                          <HelpTooltip content="Select PII types to detect and protect." position="right" />
                        </div>
                        <svg className={`h-4 w-4 text-gray-500 transform transition-transform ${piiExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {piiExpanded && (
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
                          {PII_TYPES.map(type => (
                            <label key={type} className="inline-flex items-center space-x-2 p-2 rounded border border-gray-200 bg-white">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300"
                                checked={formData.piiEntities.includes(type)}
                                onChange={e => setFormData(prev => {
                                  const set = new Set(prev.piiEntities);
                                  if (e.target.checked) set.add(type); else set.delete(type);
                                  return { ...prev, piiEntities: Array.from(set) };
                                })}
                              />
                              <span>{type}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                {/* Regex Patterns */}
                <div className="mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">Regex Patterns</span>
                        <button
                          type="button"
                          className="btn-secondary text-sm px-2 py-1"
                          onClick={() => setFormData(prev => ({ ...prev, regexes: [...prev.regexes, { name: '', pattern: '', description: '' }] }))}
                        >
                          + Add Pattern
                        </button>
                      </div>
                      {formData.regexes.length === 0 ? (
                        <p className="text-sm text-gray-500">No regex patterns configured.</p>
                      ) : (
                        <div className="space-y-2">
                          {formData.regexes.map((r, idx) => (
                            <div key={idx} className="p-3 bg-white border border-gray-200 rounded-md">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700">Name</label>
                                  <input
                                    className="input-field"
                                    value={r.name}
                                    onChange={e => setFormData(prev => { const next = [...prev.regexes]; next[idx] = { ...next[idx], name: e.target.value }; return { ...prev, regexes: next }; })}
                                    placeholder="e.g., Email"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700">Pattern</label>
                                  <input
                                    className="input-field"
                                    value={r.pattern}
                                    onChange={e => setFormData(prev => { const next = [...prev.regexes]; next[idx] = { ...next[idx], pattern: e.target.value }; return { ...prev, regexes: next }; })}
                                    placeholder="e.g., ^[^@\n]+@[^@\n]+\.[^@\n]+$"
                                  />
                                </div>
                                <div className="md:col-span-1">
                                  <label className="block text-xs font-medium text-gray-700">Description</label>
                                  <input
                                    className="input-field"
                                    value={r.description}
                                    onChange={e => setFormData(prev => { const next = [...prev.regexes]; next[idx] = { ...next[idx], description: e.target.value }; return { ...prev, regexes: next }; })}
                                    placeholder="Optional description"
                                  />
                                </div>
                              </div>
                              <div className="mt-2 flex justify-end">
                                <button
                                  type="button"
                                  className="text-sm text-red-600 hover:text-red-700"
                                  onClick={() => setFormData(prev => ({ ...prev, regexes: prev.regexes.filter((_, i) => i !== idx) }))}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Contextual Grounding */}
                {formData.activeConfigurations.CONTEXTUAL_GROUNDING && (
                  <div className="guardrail-form-section">
                    {(() => {
                      const defaultCg = { GROUNDING: { threshold: 0.5, action: 'BLOCK', enabled: true }, RELEVANCE: { threshold: 0.5, action: 'BLOCK', enabled: true } };
                      const cg = formData.contextualGrounding || defaultCg;
                      return (
                        <>
                          <h4 className="guardrail-form-section-header">
                            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" /></svg>
                            <span>Contextual Grounding</span>
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium text-gray-900">Grounding Filter</span>
                                <HelpTooltip content="Controls grounding confidence threshold and action." position="right" />
                              </div>
                              <label className="inline-flex items-center space-x-2 text-sm">
                                <input type="checkbox" className="rounded border-gray-300" checked={cg.GROUNDING?.enabled}
                                  onChange={e => setFormData(prev => { const base = prev.contextualGrounding || defaultCg; return ({ ...prev, contextualGrounding: { ...base, GROUNDING: { ...base.GROUNDING, enabled: e.target.checked } } }); })} />
                                <span>Enabled</span>
                              </label>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-700">Threshold: {Number(cg.GROUNDING?.threshold ?? 0.5).toFixed(2)}</label>
                                <input type="range" min="0" max="1" step="0.01" value={cg.GROUNDING?.threshold ?? 0.5}
                                  onChange={e => setFormData(prev => { const base = prev.contextualGrounding || defaultCg; return ({ ...prev, contextualGrounding: { ...base, GROUNDING: { ...base.GROUNDING, threshold: parseFloat(e.target.value) } } }); })}
                                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700">Action</label>
                                <select className="input" value={cg.GROUNDING?.action || 'BLOCK'}
                                  onChange={e => setFormData(prev => { const base = prev.contextualGrounding || defaultCg; return ({ ...prev, contextualGrounding: { ...base, GROUNDING: { ...base.GROUNDING, action: e.target.value } } }); })}>
                                  {PII_ACTIONS.map(a => (<option key={a} value={a}>{a}</option>))}
                                </select>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2 mt-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium text-gray-900">Relevance Filter</span>
                                <HelpTooltip content="Controls relevance threshold and action." position="right" />
                              </div>
                              <label className="inline-flex items-center space-x-2 text-sm">
                                <input type="checkbox" className="rounded border-gray-300" checked={cg.RELEVANCE?.enabled}
                                  onChange={e => setFormData(prev => { const base = prev.contextualGrounding || defaultCg; return ({ ...prev, contextualGrounding: { ...base, RELEVANCE: { ...base.RELEVANCE, enabled: e.target.checked } } }); })} />
                                <span>Enabled</span>
                              </label>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-700">Threshold: {Number(cg.RELEVANCE?.threshold ?? 0.5).toFixed(2)}</label>
                                <input type="range" min="0" max="1" step="0.01" value={cg.RELEVANCE?.threshold ?? 0.5}
                                  onChange={e => setFormData(prev => { const base = prev.contextualGrounding || defaultCg; return ({ ...prev, contextualGrounding: { ...base, RELEVANCE: { ...base.RELEVANCE, threshold: parseFloat(e.target.value) } } }); })}
                                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700">Action</label>
                                <select className="input" value={cg.RELEVANCE?.action || 'BLOCK'}
                                  onChange={e => setFormData(prev => { const base = prev.contextualGrounding || defaultCg; return ({ ...prev, contextualGrounding: { ...base, RELEVANCE: { ...base.RELEVANCE, action: e.target.value } } }); })}>
                                  {PII_ACTIONS.map(a => (<option key={a} value={a}>{a}</option>))}
                                </select>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

            )}
          </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between p-4 border-t border-green-200 bg-green-50">
            <div className="flex items-center space-x-2">
              {hasUnsavedChanges && (
                <span className="text-sm ">
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
