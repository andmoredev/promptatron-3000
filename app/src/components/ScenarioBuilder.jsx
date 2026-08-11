/**
 * ScenarioBuilder Component
 * Provides a comprehensive interface for creating and editing scenarios
 * Handles validation, file operations, and user feedback
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import LoadingSpinner from './LoadingSpinner.jsx';
import HelpTooltip from './HelpTooltip.jsx';
import { validateScenario, createDefaultScenario } from '../utils/scenarioModels.js';
import { scenarioService } from '../services/scenarioService.js';

/**
 * Main ScenarioBuilder component
 */
function ScenarioBuilder({ isOpen, onClose, onSave, editingScenario = null }) {
  const [activeTab, setActiveTab] = useState('metadata');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving', 'success', 'error'
  const [saveMessage, setSaveMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const [isValidating, setIsValidating] = useState(false);

  // Initialize scenario data
  const [scenarioData, setScenarioData] = useState(() => {
    if (editingScenario) {
      return { ...editingScenario };
    }
    return createDefaultScenario('', '', '');
  });

  // File input refs for dataset uploads
  const datasetFileInputRef = useRef(null);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      if (editingScenario) {
        setScenarioData({ ...editingScenario });
      } else {
        setScenarioData(createDefaultScenario('', '', ''));
      }
      setHasUnsavedChanges(false);
      setSaveStatus(null);
      setSaveMessage('');
      setValidationErrors({});
      setActiveTab('metadata');
    }
  }, [isOpen, editingScenario]);

  // Validate scenario data when it changes
  useEffect(() => {
    if (isOpen) {
      validateScenarioData();
    }
  }, [scenarioData, isOpen]);

  // Handle close with unsaved changes warning
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to close without saving?'
      );
      if (!confirmed) return;
    }

    setHasUnsavedChanges(false);
    setSaveStatus(null);
    setSaveMessage('');
    setValidationErrors({});
    onClose();
  }, [hasUnsavedChanges, onClose]);

  // Validate scenario data
  const validateScenarioData = useCallback(async () => {
    setIsValidating(true);
    try {
      const validation = await validateScenario(scenarioData);
      setValidationErrors(validation.errors || {});
      return validation.isValid;
    } catch (error) {
      console.error('Validation error:', error);
      setValidationErrors({ general: 'Validation failed: ' + error.message });
      return false;
    } finally {
      setIsValidating(false);
    }
  }, [scenarioData]);

  // Handle save scenario
  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    setSaveMessage('Validating scenario...');

    try {
      // Validate scenario first
      const isValid = await validateScenarioData();
      if (!isValid) {
        setSaveStatus('error');
        setSaveMessage('Please fix validation errors before saving.');
        return;
      }

      setSaveMessage('Saving scenario to disk...');

      // Generate filename if not provided
      let filename = scenarioData.filename;
      if (!filename) {
        const sanitizedId = scenarioData.id.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        filename = `${sanitizedId}.json`;
      }

      // Create the scenario file content
      const scenarioContent = {
        id: scenarioData.id,
        name: scenarioData.name,
        description: scenarioData.description,
        ...(scenarioData.datasets && scenarioData.datasets.length > 0 && { datasets: scenarioData.datasets }),
        ...(scenarioData.systemPrompts && scenarioData.systemPrompts.length > 0 && { systemPrompts: scenarioData.systemPrompts }),
        ...(scenarioData.userPrompts && scenarioData.userPrompts.length > 0 && { userPrompts: scenarioData.userPrompts }),
        ...(scenarioData.tools && scenarioData.tools.length > 0 && { tools: scenarioData.tools }),
        ...(scenarioData.configuration && { configuration: scenarioData.configuration }),
        ...(scenarioData.examples && scenarioData.examples.length > 0 && { examples: scenarioData.examples })
      };

      // Save scenario file using File System Access API
      await saveScenarioToFile(filename, scenarioContent);

      setHasUnsavedChanges(false);
      setSaveStatus('success');
      setSaveMessage('Scenario saved successfully!');

      // Notify parent component
      if (onSave) {
        onSave(scenarioContent, filename);
      }

      // Reload scenarios in the service
      await scenarioService.reloadScenarios();

      // Clear success message after 2 seconds
      setTimeout(() => {
        setSaveStatus(null);
        setSaveMessage('');
      }, 2000);

    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus('error');
      setSaveMessage(`Failed to save scenario: ${error.message}`);
    }
  }, [scenarioData, validateScenarioData, onSave]);

  // Save scenario to file using File System Access API
  const saveScenarioToFile = async (filename, content) => {
    try {
      // Check if File System Access API is supported
      if ('showSaveFilePicker' in window) {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'Scenario files',
            accept: { 'application/json': ['.json'] }
          }]
        });

        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(content, null, 2));
        await writable.close();
      } else {
        // Fallback: download as file
        const blob = new Blob([JSON.stringify(content, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Save cancelled by user');
      }
      throw error;
    }
  };

  // Update scenario data and mark as changed
  const updateScenarioData = useCallback((updates) => {
    setScenarioData(prev => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
  }, []);

  // Handle dataset file upload
  const handleDatasetFileUpload = useCallback((event, datasetIndex) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const updatedDatasets = [...scenarioData.datasets];

        // Update the dataset with file content
        updatedDatasets[datasetIndex] = {
          ...updatedDatasets[datasetIndex],
          file: file.name,
          content: content
        };

        updateScenarioData({ datasets: updatedDatasets });
      } catch (error) {
        console.error('Error reading file:', error);
        setSaveStatus('error');
        setSaveMessage(`Error reading file: ${error.message}`);
      }
    };

    reader.readAsText(file);
    event.target.value = ''; // Reset file input
  }, [scenarioData.datasets, updateScenarioData]);

  if (!isOpen) return null;

  const tabs = [
    { id: 'metadata', label: 'Metadata', icon: '📝' },
    { id: 'datasets', label: 'Datasets', icon: '📊' },
    { id: 'prompts', label: 'Prompts', icon: '💬' },
    { id: 'tools', label: 'Tools', icon: '🔧' },
    { id: 'configuration', label: 'Configuration', icon: '⚙️' }
  ];

  const isFormValid = Object.keys(validationErrors).length === 0 &&
    scenarioData.id &&
    scenarioData.name &&
    scenarioData.description;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[95vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-secondary-100">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {editingScenario ? 'Edit Scenario' : 'Create New Scenario'}
              </h2>
              <p className="text-sm text-gray-600">
                {editingScenario ? 'Modify scenario configuration' : 'Build a comprehensive test scenario'}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-200 whitespace-nowrap flex items-center space-x-2 ${activeTab === tab.id
                ? 'border-primary-500 text-primary-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {validationErrors[tab.id] && (
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto h-[60vh]">
          {activeTab === 'metadata' && (
            <MetadataTab
              scenarioData={scenarioData}
              updateScenarioData={updateScenarioData}
              validationErrors={validationErrors}
            />
          )}
          {activeTab === 'datasets' && (
            <DatasetsTab
              scenarioData={scenarioData}
              updateScenarioData={updateScenarioData}
              validationErrors={validationErrors}
              onFileUpload={handleDatasetFileUpload}
              fileInputRef={datasetFileInputRef}
            />
          )}
          {activeTab === 'prompts' && (
            <PromptsTab
              scenarioData={scenarioData}
              updateScenarioData={updateScenarioData}
              validationErrors={validationErrors}
            />
          )}
          {activeTab === 'tools' && (
            <ToolsTab
              scenarioData={scenarioData}
              updateScenarioData={updateScenarioData}
              validationErrors={validationErrors}
            />
          )}
          {activeTab === 'configuration' && (
            <ConfigurationTab
              scenarioData={scenarioData}
              updateScenarioData={updateScenarioData}
              validationErrors={validationErrors}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-4">
            {/* Validation Status */}
            {isValidating && (
              <div className="flex items-center space-x-2">
                <LoadingSpinner size="sm" />
                <span className="text-sm text-gray-600">Validating...</span>
              </div>
            )}

            {Object.keys(validationErrors).length > 0 && !isValidating && (
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-sm text-red-600">
                  {Object.keys(validationErrors).length} validation error(s)
                </span>
              </div>
            )}

            {isFormValid && !isValidating && (
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-green-600">Ready to save</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* Save Status */}
            {saveStatus && (
              <div className="flex items-center space-x-2">
                {saveStatus === 'saving' && <LoadingSpinner size="sm" />}
                {saveStatus === 'success' && (
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {saveStatus === 'error' && (
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                )}
                <span className={`text-sm ${saveStatus === 'success' ? 'text-green-600' :
                  saveStatus === 'error' ? 'text-red-600' : 'text-gray-600'
                  }`}>
                  {saveMessage}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <button
              onClick={handleClose}
              className="btn-secondary"
            >
              {hasUnsavedChanges ? 'Cancel' : 'Close'}
            </button>

            <button
              onClick={handleSave}
              className="btn-primary"
              disabled={!isFormValid || saveStatus === 'saving' || isValidating}
            >
              {saveStatus === 'saving' ? 'Saving...' : editingScenario ? 'Update Scenario' : 'Save Scenario'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

ScenarioBuilder.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func,
  editingScenario: PropTypes.object
};

export default ScenarioBuilder;

/**
 * Metadata Tab Component
 */
function MetadataTab({ scenarioData, updateScenarioData, validationErrors }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
        <p className="text-sm text-gray-600 mb-6">
          Define the basic metadata for your scenario including ID, name, and description.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Scenario ID */}
        <div>
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
            <span>Scenario ID</span>
            <HelpTooltip
              content="Unique identifier for the scenario. Use lowercase letters, numbers, and hyphens only."
              position="bottom"
            />
          </label>
          <input
            type="text"
            value={scenarioData.id || ''}
            onChange={(e) => updateScenarioData({ id: e.target.value })}
            className={`input-field ${validationErrors.id ? 'border-red-300' : ''}`}
            placeholder="e.g., fraud-detection-comprehensive"
            pattern="[a-z0-9-]+"
          />
          {validationErrors.id && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.id}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            This will be used as the filename (with .json extension)
          </p>
        </div>

        {/* Scenario Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Scenario Name
          </label>
          <input
            type="text"
            value={scenarioData.name || ''}
            onChange={(e) => updateScenarioData({ name: e.target.value })}
            className={`input-field ${validationErrors.name ? 'border-red-300' : ''}`}
            placeholder="e.g., Fraud Detection - Comprehensive Analysis"
          />
          {validationErrors.name && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.name}</p>
          )}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description
        </label>
        <textarea
          value={scenarioData.description || ''}
          onChange={(e) => updateScenarioData({ description: e.target.value })}
          className={`input-field resize-none h-24 ${validationErrors.description ? 'border-red-300' : ''}`}
          placeholder="Describe what this scenario is for, what it tests, and how it should be used..."
        />
        {validationErrors.description && (
          <p className="mt-1 text-sm text-red-600">{validationErrors.description}</p>
        )}
      </div>

      {/* Preview */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-800 mb-2">Preview</h4>
        <div className="text-sm text-blue-700">
          <p><strong>ID:</strong> {scenarioData.id || 'Not set'}</p>
          <p><strong>Name:</strong> {scenarioData.name || 'Not set'}</p>
          <p><strong>Description:</strong> {scenarioData.description || 'Not set'}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Datasets Tab Component
 */
function DatasetsTab({ scenarioData, updateScenarioData, validationErrors, onFileUpload, fileInputRef }) {
  const datasets = scenarioData.datasets || [];

  const addDataset = () => {
    const newDataset = {
      id: `dataset-${Date.now()}`,
      name: '',
      description: '',
      file: '',
      content: ''
    };
    updateScenarioData({ datasets: [...datasets, newDataset] });
  };

  const updateDataset = (index, updates) => {
    const updatedDatasets = [...datasets];
    updatedDatasets[index] = { ...updatedDatasets[index], ...updates };
    updateScenarioData({ datasets: updatedDatasets });
  };

  const removeDataset = (index) => {
    const updatedDatasets = datasets.filter((_, i) => i !== index);
    updateScenarioData({ datasets: updatedDatasets });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Datasets</h3>
          <p className="text-sm text-gray-600">
            Add datasets that will be available for this scenario. Users can select from these datasets during testing.
          </p>
        </div>
        <button
          onClick={addDataset}
          className="btn-secondary flex items-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>Add Dataset</span>
        </button>
      </div>

      {datasets.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-600 mb-4">No datasets added yet</p>
          <button
            onClick={addDataset}
            className="btn-primary"
          >
            Add Your First Dataset
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {datasets.map((dataset, index) => (
            <div key={dataset.id || index} className="card">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-medium text-gray-900">Dataset {index + 1}</h4>
                <button
                  onClick={() => removeDataset(index)}
                  className="text-red-600 hover:text-red-700 text-sm font-medium"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Dataset ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dataset ID
                  </label>
                  <input
                    type="text"
                    value={dataset.id || ''}
                    onChange={(e) => updateDataset(index, { id: e.target.value })}
                    className="input-field"
                    placeholder="e.g., retail-transactions"
                  />
                </div>

                {/* Dataset Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={dataset.name || ''}
                    onChange={(e) => updateDataset(index, { name: e.target.value })}
                    className="input-field"
                    placeholder="e.g., Retail Transaction Data"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={dataset.description || ''}
                  onChange={(e) => updateDataset(index, { description: e.target.value })}
                  className="input-field resize-none h-20"
                  placeholder="Describe what this dataset contains and how it should be used..."
                />
              </div>

              {/* File Upload */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dataset File
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => onFileUpload(e, index)}
                    accept=".csv,.json,.txt"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-secondary flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>Upload File</span>
                  </button>
                  {dataset.file && (
                    <span className="text-sm text-gray-600">
                      📄 {dataset.file}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Supported formats: CSV, JSON, TXT
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {validationErrors.datasets && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{validationErrors.datasets}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Prompts Tab Component
 */
function PromptsTab({ scenarioData, updateScenarioData, validationErrors }) {
  const systemPrompts = scenarioData.systemPrompts || [];
  const userPrompts = scenarioData.userPrompts || [];

  const addSystemPrompt = () => {
    const newPrompt = {
      id: `system-prompt-${Date.now()}`,
      name: '',
      content: ''
    };
    updateScenarioData({ systemPrompts: [...systemPrompts, newPrompt] });
  };

  const addUserPrompt = () => {
    const newPrompt = {
      id: `user-prompt-${Date.now()}`,
      name: '',
      content: ''
    };
    updateScenarioData({ userPrompts: [...userPrompts, newPrompt] });
  };

  const updateSystemPrompt = (index, updates) => {
    const updatedPrompts = [...systemPrompts];
    updatedPrompts[index] = { ...updatedPrompts[index], ...updates };
    updateScenarioData({ systemPrompts: updatedPrompts });
  };

  const updateUserPrompt = (index, updates) => {
    const updatedPrompts = [...userPrompts];
    updatedPrompts[index] = { ...updatedPrompts[index], ...updates };
    updateScenarioData({ userPrompts: updatedPrompts });
  };

  const removeSystemPrompt = (index) => {
    const updatedPrompts = systemPrompts.filter((_, i) => i !== index);
    updateScenarioData({ systemPrompts: updatedPrompts });
  };

  const removeUserPrompt = (index) => {
    const updatedPrompts = userPrompts.filter((_, i) => i !== index);
    updateScenarioData({ userPrompts: updatedPrompts });
  };

  return (
    <div className="space-y-8">
      {/* System Prompts Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">System Prompts</h3>
            <p className="text-sm text-gray-600">
              Define the AI's role, expertise, and behavior. Users can select from these system prompts.
            </p>
          </div>
          <button
            onClick={addSystemPrompt}
            className="btn-secondary flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>Add System Prompt</span>
          </button>
        </div>

        {systemPrompts.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-600 mb-4">No system prompts added</p>
            <button onClick={addSystemPrompt} className="btn-primary">
              Add System Prompt
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {systemPrompts.map((prompt, index) => (
              <div key={prompt.id || index} className="card">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-md font-medium text-gray-900">System Prompt {index + 1}</h4>
                  <button
                    onClick={() => removeSystemPrompt(index)}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Prompt ID
                    </label>
                    <input
                      type="text"
                      value={prompt.id || ''}
                      onChange={(e) => updateSystemPrompt(index, { id: e.target.value })}
                      className="input-field"
                      placeholder="e.g., fraud-analyst"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={prompt.name || ''}
                      onChange={(e) => updateSystemPrompt(index, { name: e.target.value })}
                      className="input-field"
                      placeholder="e.g., Fraud Detection Analyst"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prompt Content
                  </label>
                  <textarea
                    value={prompt.content || ''}
                    onChange={(e) => updateSystemPrompt(index, { content: e.target.value })}
                    className="input-field resize-none h-32"
                    placeholder="You are an expert fraud detection analyst with 10+ years of experience..."
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User Prompts Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">User Prompts</h3>
            <p className="text-sm text-gray-600">
              Define specific tasks or questions. Users can select from these user prompts.
            </p>
          </div>
          <button
            onClick={addUserPrompt}
            className="btn-secondary flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>Add User Prompt</span>
          </button>
        </div>

        {userPrompts.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-600 mb-4">No user prompts added</p>
            <button onClick={addUserPrompt} className="btn-primary">
              Add User Prompt
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {userPrompts.map((prompt, index) => (
              <div key={prompt.id || index} className="card">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-md font-medium text-gray-900">User Prompt {index + 1}</h4>
                  <button
                    onClick={() => removeUserPrompt(index)}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Prompt ID
                    </label>
                    <input
                      type="text"
                      value={prompt.id || ''}
                      onChange={(e) => updateUserPrompt(index, { id: e.target.value })}
                      className="input-field"
                      placeholder="e.g., analyze-transactions"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={prompt.name || ''}
                      onChange={(e) => updateUserPrompt(index, { name: e.target.value })}
                      className="input-field"
                      placeholder="e.g., Analyze for Fraud Patterns"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prompt Content
                  </label>
                  <textarea
                    value={prompt.content || ''}
                    onChange={(e) => updateUserPrompt(index, { content: e.target.value })}
                    className="input-field resize-none h-32"
                    placeholder="Analyze the provided transaction data for potential fraud indicators..."
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(validationErrors.systemPrompts || validationErrors.userPrompts) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          {validationErrors.systemPrompts && (
            <p className="text-sm text-red-700 mb-2">System Prompts: {validationErrors.systemPrompts}</p>
          )}
          {validationErrors.userPrompts && (
            <p className="text-sm text-red-700">User Prompts: {validationErrors.userPrompts}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Tools Tab Component
 */
function ToolsTab({ scenarioData, updateScenarioData, validationErrors }) {
  const tools = scenarioData.tools || [];

  const addTool = () => {
    const newTool = {
      name: '',
      description: '',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: ''
    };
    updateScenarioData({ tools: [...tools, newTool] });
  };

  const updateTool = (index, updates) => {
    const updatedTools = [...tools];
    updatedTools[index] = { ...updatedTools[index], ...updates };
    updateScenarioData({ tools: updatedTools });
  };

  const removeTool = (index) => {
    const updatedTools = tools.filter((_, i) => i !== index);
    updateScenarioData({ tools: updatedTools });
  };

  const updateToolSchema = (index, schemaText) => {
    try {
      const schema = JSON.parse(schemaText);
      updateTool(index, { inputSchema: schema });
    } catch (error) {
      // Invalid JSON, but don't update - let user fix it
      console.warn('Invalid JSON schema:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Tools</h3>
          <p className="text-sm text-gray-600">
            Define tools that the AI can use during execution. Tools can be detection-only or have actual implementations.
          </p>
        </div>
        <button
          onClick={addTool}
          className="btn-secondary flex items-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>Add Tool</span>
        </button>
      </div>

      {tools.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-600 mb-4">No tools defined yet</p>
          <button
            onClick={addTool}
            className="btn-primary"
          >
            Add Your First Tool
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {tools.map((tool, index) => (
            <div key={index} className="card">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-medium text-gray-900">Tool {index + 1}</h4>
                <button
                  onClick={() => removeTool(index)}
                  className="text-red-600 hover:text-red-700 text-sm font-medium"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Tool Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tool Name
                  </label>
                  <input
                    type="text"
                    value={tool.name || ''}
                    onChange={(e) => updateTool(index, { name: e.target.value })}
                    className="input-field"
                    placeholder="e.g., freeze_account"
                  />
                </div>

                {/* Handler (Optional) */}
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-1">
                    <span>Handler (Optional)</span>
                    <HelpTooltip
                      content="JavaScript function path for tool execution. Leave empty for detection-only mode."
                      position="bottom"
                    />
                  </label>
                  <input
                    type="text"
                    value={tool.handler || ''}
                    onChange={(e) => updateTool(index, { handler: e.target.value })}
                    className="input-field"
                    placeholder="e.g., mockFraudTools.freezeAccount"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={tool.description || ''}
                  onChange={(e) => updateTool(index, { description: e.target.value })}
                  className="input-field resize-none h-20"
                  placeholder="Describe what this tool does and when it should be used..."
                />
              </div>

              {/* Input Schema */}
              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-1">
                  <span>Input Schema (JSON)</span>
                  <HelpTooltip
                    content="JSON Schema defining the parameters this tool accepts. Must be valid JSON."
                    position="bottom"
                  />
                </label>
                <textarea
                  value={JSON.stringify(tool.inputSchema || {}, null, 2)}
                  onChange={(e) => updateToolSchema(index, e.target.value)}
                  className="input-field resize-none h-40 font-mono text-sm"
                  placeholder={JSON.stringify({
                    type: 'object',
                    properties: {
                      account_id: { type: 'string', pattern: '^A[0-9]{4}$' },
                      reason: { type: 'string', minLength: 20 }
                    },
                    required: ['account_id', 'reason']
                  }, null, 2)}
                />
              </div>

              {/* Tool Mode Indicator */}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-blue-800">
                    Mode: {tool.handler ? 'Execution' : 'Detection Only'}
                  </span>
                </div>
                <p className="text-xs text-blue-700 mt-1">
                  {tool.handler
                    ? 'This tool can be executed by the AI during conversations.'
                    : 'This tool will only be detected in AI responses, not executed.'
                  }
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {validationErrors.tools && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{validationErrors.tools}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Configuration Tab Component
 */
function ConfigurationTab({ scenarioData, updateScenarioData, validationErrors }) {
  const config = scenarioData.configuration || {};

  const updateConfig = (updates) => {
    updateScenarioData({
      configuration: { ...config, ...updates }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Scenario Configuration</h3>
        <p className="text-sm text-gray-600 mb-6">
          Configure how this scenario behaves and what options are available to users.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Max Iterations */}
        <div>
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
            <span>Max Iterations</span>
            <HelpTooltip
              content="Maximum number of tool execution iterations allowed for this scenario."
              position="bottom"
            />
          </label>
          <input
            type="number"
            min="1"
            max="50"
            value={config.maxIterations || 10}
            onChange={(e) => updateConfig({ maxIterations: parseInt(e.target.value) })}
            className="input-field"
          />
        </div>

        {/* Default Streaming */}
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="defaultStreaming"
            checked={config.defaultStreamingEnabled !== false}
            onChange={(e) => updateConfig({ defaultStreamingEnabled: e.target.checked })}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="defaultStreaming" className="text-sm font-medium text-gray-700">
            Enable Streaming by Default
          </label>
        </div>

        {/* Allow Custom Prompts */}
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="allowCustomPrompts"
            checked={config.allowCustomPrompts !== false}
            onChange={(e) => updateConfig({ allowCustomPrompts: e.target.checked })}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="allowCustomPrompts" className="text-sm font-medium text-gray-700">
            Allow Custom Prompts
          </label>
        </div>

        {/* Allow Dataset Modification */}
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="allowDatasetModification"
            checked={config.allowDatasetModification === true}
            onChange={(e) => updateConfig({ allowDatasetModification: e.target.checked })}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="allowDatasetModification" className="text-sm font-medium text-gray-700">
            Allow Dataset Modification
          </label>
        </div>
      </div>

      {/* Recommended Models */}
      <div>
        <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
          <span>Recommended Models</span>
          <HelpTooltip
            content="List of model IDs that work best with this scenario. One per line."
            position="bottom"
          />
        </label>
        <textarea
          value={(config.recommendedModels || []).join('\n')}
          onChange={(e) => updateConfig({
            recommendedModels: e.target.value.split('\n').filter(line => line.trim())
          })}
          className="input-field resize-none h-24"
          placeholder={`anthropic.claude-3-5-sonnet-20241022-v2:0\namazon.nova-pro-v1:0\nmeta.llama3-2-90b-instruct-v1:0`}
        />
        <p className="mt-1 text-xs text-gray-500">
          Enter one model ID per line. These will be highlighted in the model selector.
        </p>
      </div>

      {/* Configuration Preview */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-800 mb-2">Configuration Summary</h4>
        <div className="text-sm text-blue-700 space-y-1">
          <p>• Max Iterations: {config.maxIterations || 10}</p>
          <p>• Streaming: {config.defaultStreamingEnabled !== false ? 'Enabled' : 'Disabled'} by default</p>
          <p>• Custom Prompts: {config.allowCustomPrompts !== false ? 'Allowed' : 'Not allowed'}</p>
          <p>• Dataset Modification: {config.allowDatasetModification ? 'Allowed' : 'Not allowed'}</p>
          <p>• Recommended Models: {(config.recommendedModels || []).length} specified</p>
        </div>
      </div>

      {validationErrors.configuration && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{validationErrors.configuration}</p>
        </div>
      )}
    </div>
  );
}
