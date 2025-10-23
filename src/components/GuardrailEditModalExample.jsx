import React, { useState } from 'react';
import GuardrailEditModal from './GuardrailEditModal.jsx';

/**
 * Example component showing how to integrate GuardrailEditModal
 * This demonstrates the usage pattern for the modal component
 */
function GuardrailEditModalExample() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedGuardrailId, setSelectedGuardrailId] = useState('test-guardrail-id');

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleSaveGuardrail = (formData) => {
    console.log('Guardrail saved with data:', formData);
    // Here you would typically:
    // 1. Call the UpdateGuardrailCommand through guardrailConfigurationManager
    // 2. Update the UI to reflect changes
    // 3. Show success notification
    setIsModalOpen(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Guardrail Edit Modal Example</h2>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium">Sample Guardrail Configuration</h3>
            <p className="text-sm text-gray-600">Content Policy, Word Policy, PII Detection</p>
          </div>
          <button
            onClick={handleOpenModal}
            className="inline-flex text-gray-400 hover:text-gray-600 transition-colors"
            title="Edit guardrail settings"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>

        <div className="text-sm text-gray-600">
          Click the edit icon to open the guardrail configuration modal.
        </div>
      </div>

      <GuardrailEditModal
        isOpen={isModalOpen}
        guardrailId={selectedGuardrailId}
        onClose={handleCloseModal}
        onSave={handleSaveGuardrail}
      />
    </div>
  );
}

export default GuardrailEditModalExample;
