import GuardrailPolicyList from './GuardrailPolicyList';

// Demo component to showcase the new GuardrailPolicyList
const GuardrailPolicyListDemo = () => {
  // Sample data that mimics real guardrail configurations - only active policies
  const sampleConfigurations = {
    TOPIC_POLICY: {
      isActive: true,
      hasConfiguration: true
    },
    CONTENT_POLICY: {
      isActive: true,
      hasConfiguration: true
    },
    WORD_POLICY: {
      isActive: true,
      hasConfiguration: true
    },
    SENSITIVE_INFORMATION: {
      isActive: true,
      hasConfiguration: true
    },
    CONTEXTUAL_GROUNDING: {
      isActive: true,
      hasConfiguration: true
    }
  };

  // Comprehensive sample guardrail data structure that matches AWS Bedrock format
  const sampleConfigurationDetails = {
    topicPolicyConfig: {
      topicsConfig: [
        {
          name: 'Financial Advice',
          definition: 'Investment recommendations, financial planning, and market predictions',
          inputEnabled: true,
          outputEnabled: true
        },
        {
          name: 'Medical Diagnosis',
          definition: 'Specific medical diagnoses, treatment recommendations, and health advice',
          inputEnabled: true,
          outputEnabled: false
        },
        {
          name: 'Legal Counsel',
          definition: 'Legal advice, case analysis, and regulatory interpretation',
          inputEnabled: false,
          outputEnabled: true
        },
        {
          name: 'Personal Information Requests',
          definition: 'Requests for personal data, private information, or confidential details',
          inputEnabled: true,
          outputEnabled: true
        }
      ]
    },
    contentPolicyConfig: {
      filtersConfig: [
        { type: 'HATE', inputEnabled: true, outputEnabled: true, inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'VIOLENCE', inputEnabled: true, outputEnabled: true, inputStrength: 'MEDIUM', outputStrength: 'HIGH' },
        { type: 'SEXUAL', inputEnabled: false, outputEnabled: true, outputStrength: 'MEDIUM' },
        { type: 'MISCONDUCT', inputEnabled: true, outputEnabled: false, inputStrength: 'LOW' }
      ]
    },
    wordPolicyConfig: {
      wordsConfig: [
        { text: 'confidential', inputEnabled: true, outputEnabled: true },
        { text: 'proprietary', inputEnabled: true, outputEnabled: false },
        { text: 'classified', inputEnabled: true, outputEnabled: true },
        { text: 'internal-only', inputEnabled: false, outputEnabled: true }
      ],
      managedWordListsConfig: [
        { name: 'Profanity Filter', inputEnabled: true, outputEnabled: true },
        { name: 'Company Secrets', inputEnabled: true, outputEnabled: true },
        { name: 'Competitor Names', inputEnabled: false, outputEnabled: true }
      ]
    },
    sensitiveInformationPolicyConfig: {
      piiEntitiesConfig: [
        { type: 'EMAIL', inputEnabled: true, outputEnabled: true, action: 'BLOCK' },
        { type: 'PHONE', inputEnabled: true, outputEnabled: false, action: 'ANONYMIZE' },
        { type: 'SSN', inputEnabled: true, outputEnabled: true, action: 'BLOCK' },
        { type: 'CREDIT_DEBIT_CARD_NUMBER', inputEnabled: true, outputEnabled: true, action: 'BLOCK' },
        { type: 'ADDRESS', inputEnabled: false, outputEnabled: true, action: 'ANONYMIZE' }
      ],
      regexesConfig: [
        {
          name: 'Credit Card Pattern',
          pattern: '\\d{4}-\\d{4}-\\d{4}-\\d{4}',
          inputEnabled: true,
          outputEnabled: true,
          action: 'BLOCK'
        },
        {
          name: 'API Key Pattern',
          pattern: 'sk-[a-zA-Z0-9]{32}',
          inputEnabled: true,
          outputEnabled: false,
          action: 'BLOCK'
        },
        {
          name: 'Employee ID Pattern',
          pattern: 'EMP-\\d{6}',
          inputEnabled: true,
          outputEnabled: true,
          action: 'ANONYMIZE'
        }
      ]
    },
    contextualGroundingPolicyConfig: {
      filtersConfig: [
        { name: 'Source Attribution', type: 'GROUNDING', threshold: 0.8, enabled: true },
        { name: 'Factual Accuracy', type: 'GROUNDING', threshold: 0.7, enabled: true }
      ]
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Guardrail Policy List Demo
        </h1>
        <p className="text-gray-600">
          This demo shows the new informative guardrail policy display without toggles.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <GuardrailPolicyList
          guardrailId="demo-guardrail-123"
          configurations={sampleConfigurations}
          configurationDetails={sampleConfigurationDetails}
          isLoading={false}
        />
      </div>

      <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Key Improvements</h2>
        <ul className="space-y-2 text-gray-700">
          <li className="flex items-start space-x-2">
            <span className="text-green-500 mt-1">✓</span>
            <span>Shows only active policies with comprehensive configuration details</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-green-500 mt-1">✓</span>
            <span>Displays ALL topic names, managed lists, words, and filter configurations</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-green-500 mt-1">✓</span>
            <span>Compact, dense layout with tooltips for descriptions</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-green-500 mt-1">✓</span>
            <span>Expandable detailed cards showing complete policy configurations</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-green-500 mt-1">✓</span>
            <span>Color-coded configuration cards for easy identification</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-green-500 mt-1">✓</span>
            <span>Professional presentation suitable for compliance and auditing</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default GuardrailPolicyListDemo;
