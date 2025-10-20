import { useState } from 'react';
import PropTypes from 'prop-types';
import GuardrailContextualHelp from './GuardrailContextualH

/**
 * Component for guided error recovery workflows
 */
const GuardrailErrorRecovery = ({
  errorInfo,
  onRecoveryStep,
  onComplete,
  onCancel,
  className = ''
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepResults, setStepResults] = useState({});
  const [isExecuting, setIsExecuting] = useState(false);

  const getRecoveryWorkflow = () => {
    const errorType = errorInfo?.type || 'GUARDRAIL_UNKNOWN';

    const workflows = {
      GUARDRAIL_CREDENTIALS: [
        {
          id: 'check-env',
          title: 'Check Environment Variables',
          description: 'Verify that AWS credentials are properly configured',
          action: 'Check .env.local file exists and contains VITE_AWS_* variables',
          autoCheck: true,
          checkFunction: () => {
            const hasAccessKey = !!import.meta.env.VITE_AWS_ACCESS_KEY_ID;
            const hasSecretKey = !!import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;
            const hasRegion = !!import.meta.env.VITE_AWS_REGION;

            return {
              success: hasAccessKey && hasSecretKey && hasRegion,
              details: {
                hasAccessKey,
                hasSecretKey,
                hasRegion,
                region: import.meta.env.VITE_AWS_REGION
              }
            };
          }
        },
        {
          id: 'run-setup',
          title: 'Run Setup Script',
          description: 'Execute the local setup script to configure credentials',
          action: 'Run ./local-setup.sh or ./local-setup.ps1',
          manual: true,
          instructions: [
            'Open a terminal in your project directory',
            'Run: ./local-setup.sh (Linux/Mac) or ./local-setup.ps1 (Windows)',
            'Follow the prompts to configure AWS credentials',
            'Refresh this page after completion'
          ]
        },
        {
          id: 'test-credentials',
          title: 'Test AWS Connection',
          description: 'Verify that AWS credentials are working',
          action: 'Test connection to AWS Bedrock service',
          autoCheck: true,
          checkFunction: async () => {
            try {
              if (onRecoveryStep) {
                return await onRecoveryStep('test-credentials');
              }
              return { success: false, details: 'No test function provided' };
            } catch (error) {
              return { success: false, details: error.message };
            }
          }
        }
      ],

      GUARDRAIL_PERMISSIONS: [
        {
          id: 'check-permissions',
          title: 'Check IAM Permissions',
          description: 'Verify your AWS user/role has the required permissions',
          action: 'Review IAM permissions for Bedrock Guardrails',
          manual: true,
          instructions: [
            'Open the AWS IAM Console',
            'Navigate to your user or role',
            'Ensure you have these permissions: bedrock:CreateGuardrail, bedrock:ListGuardrails, bedrock:ApplyGuardrail',
            'Or attach the managed policy: AmazonBedrockFullAccess'
          ]
        },
        {
          id: 'enable-bedrock',
          title: 'Enable Bedrock Access',
          description: 'Ensure Amazon Bedrock is enabled in your AWS account',
          action: 'Enable Bedrock service access',
          manual: true,
          instructions: [
            'Open the AWS Bedrock Console',
            'If prompted, request access to Amazon Bedrock',
            'Wait for approval (usually immediate for most accounts)',
            'Ensure you are in a supported region (us-east-1, us-west-2, etc.)'
          ]
        },
        {
          id: 'test-permissions',
          title: 'Test Permissions',
          description: 'Verify that permissions are working correctly',
          action: 'Test Bedrock Guardrails API access',
          autoCheck: true,
          checkFunction: async () => {
            try {
              if (onRecoveryStep) {
                return await onRecoveryStep('test-permissions');
              }
              return { success: false, details: 'No test function provided' };
            } catch (error) {
              return { success: false, details: error.message };
            }
          }
        }
      ],

      GUARDRAIL_VALIDATION: [
        {
          id: 'check-config',
          title: 'Check Configuration Syntax',
          description: 'Verify your guardrail configuration is valid',
          action: 'Review scenario guardrail configuration',
          manual: true,
          instructions: [
            'Open your scenario file',
            'Check that the guardrails section has proper JSON syntax',
            'Ensure all required fields are present',
            'Verify filter types and strength values are valid'
          ]
        },
        {
          id: 'validate-config',
          title: 'Validate Configuration',
          description: 'Test the configuration against AWS requirements',
          action: 'Validate guardrail configuration',
          autoCheck: true,
          checkFunction: async () => {
            try {
              if (onRecoveryStep) {
                return await onRecoveryStep('validate-config');
              }
              return { success: false, details: 'No validation function provided' };
            } catch (error) {
              return { success: false, details: error.message };
            }
          }
        }
      ],

      GUARDRAIL_QUOTA: [
        {
          id: 'check-quota',
          title: 'Check Current Usage',
          description: 'Review your current guardrail usage',
          action: 'List existing guardrails in your account',
          autoCheck: true,
          checkFunction: async () => {
            try {
              if (onRecoveryStep) {
                return await onRecoveryStep('check-quota');
              }
              return { success: false, details: 'No quota check function provided' };
            } catch (error) {
              return { success: false, details: error.message };
            }
          }
        },
        {
          id: 'cleanup-guardrails',
          title: 'Clean Up Unused Guardrails',
          description: 'Delete guardrails that are no longer needed',
          action: 'Remove unused guardrails to free up quota',
          manual: true,
          instructions: [
            'Open the AWS Bedrock Console',
            'Navigate to Guardrails section',
            'Review your existing guardrails',
            'Delete any that are no longer needed',
            'Or request a quota increase through AWS Support'
          ]
        }
      ]
    };

    return workflows[errorType] || [
      {
        id: 'generic-retry',
        title: 'Retry Operation',
        description: 'Attempt the operation again',
        action: 'Retry the failed operation',
        autoCheck: true,
        checkFunction: async () => {
          try {
            if (onRecoveryStep) {
              return await onRecoveryStep('retry');
            }
            return { success: false, details: 'No retry function provided' };
          } catch (error) {
            return { success: false, details: error.message };
          }
        }
      }
    ];
  };

  const workflow = getRecoveryWorkflow();
  const currentStepData = workflow[currentStep];

  const executeStep = async (step) => {
    if (!step.autoCheck) return;

    setIsExecuting(true);
    try {
      const result = await step.checkFunction();
      setStepResults(prev => ({
        ...prev,
        [step.id]: result
      }));
      return result;
    } catch (error) {
      const result = { success: false, details: error.message };
      setStepResults(prev => ({
        ...prev,
        [step.id]: result
      }));
      return result;
    } finally {
      setIsExecuting(false);
    }
  };

  const handleNext = async () => {
    if (currentStepData.autoCheck) {
      const result = await executeStep(currentStepData);
      if (!result.success && currentStep < workflow.length - 1) {
        // Auto-advance to next step if current step failed
        setCurrentStep(currentStep + 1);
        return;
      }
    }

    if (currentStep < workflow.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Workflow complete
      if (onComplete) {
        onComplete(stepResults);
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    if (currentStep < workflow.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      if (onComplete) {
        onComplete(stepResults);
      }
    }
  };

  const getStepStatus = (stepIndex) => {
    if (stepIndex < currentStep) {
      const stepId = workflow[stepIndex].id;
      const result = stepResults[stepId];
      return result?.success ? 'completed' : 'failed';
    } else if (stepIndex === currentStep) {
      return 'current';
    } else {
      return 'pending';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case 'current':
        return (
          <div className="w-5 h-5 border-2 border-blue-500 rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          </div>
        );
      default:
        return (
          <div className="w-5 h-5 border-2 border-gray-300 rounded-full"></div>
        );
    }
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-lg ${className}`}>
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          Error Recovery Workflow
        </h3>
        <div className="flex items-center space-x-2">
          <GuardrailContextualHelp type="troubleshooting" />
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Progress indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Step {currentStep + 1} of {workflow.length}
            </span>
            <span className="text-sm text-gray-500">
              {Math.round(((currentStep + 1) / workflow.length) * 100)}% complete
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / workflow.length) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Step list */}
        <div className="mb-6">
          <div className="space-y-3">
            {workflow.map((step, index) => (
              <div key={step.id} className="flex items-center space-x-3">
                {getStatusIcon(getStepStatus(index))}
                <div className="flex-1">
                  <h4 className={`text-sm font-medium ${
                    index === currentStep ? 'text-blue-700' : 'text-gray-700'
                  }`}>
                    {step.title}
                  </h4>
                  <p className="text-xs text-gray-500">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Current step details */}
        {currentStepData && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h4 className="font-medium text-gray-900 mb-2">
              {currentStepData.title}
            </h4>
            <p className="text-sm text-gray-700 mb-3">
              {currentStepData.description}
            </p>

            {currentStepData.manual && currentStepData.instructions && (
              <div className="mb-4">
                <h5 className="text-sm font-medium text-gray-800 mb-2">Instructions:</h5>
                <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                  {currentStepData.instructions.map((instruction, index) => (
                    <li key={index}>{instruction}</li>
                  ))}
                </ol>
              </div>
            )}

            {stepResults[currentStepData.id] && (
              <div className={`p-3 rounded-md ${
                stepResults[currentStepData.id].success
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center space-x-2">
                  {stepResults[currentStepData.id].success ? (
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={`text-sm font-medium ${
                    stepResults[currentStepData.id].success ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {stepResults[currentStepData.id].success ? 'Success' : 'Failed'}
                  </span>
                </div>
                {stepResults[currentStepData.id].details && (
                  <p className={`text-xs mt-1 ${
                    stepResults[currentStepData.id].success ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {typeof stepResults[currentStepData.id].details === 'string'
                      ? stepResults[currentStepData.id].details
                      : JSON.stringify(stepResults[currentStepData.id].details, null, 2)
                    }
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            Previous
          </button>

          <div className="flex items-center space-x-3">
            {currentStepData?.autoCheck && (
              <button
                onClick={() => executeStep(currentStepData)}
                disabled={isExecuting}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors duration-200"
              >
                {isExecuting ? 'Checking...' : 'Check'}
              </button>
            )}

            <button
              onClick={handleSkip}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors duration-200"
            >
              Skip
            </button>

            <button
              onClick={handleNext}
              disabled={isExecuting}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors duration-200"
            >
              {currentStep === workflow.length - 1 ? 'Complete' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

GuardrailErrorRecovery.propTypes = {
  errorInfo: PropTypes.shape({
    type: PropTypes.string,
    userMessage: PropTypes.string,
    suggestedActions: PropTypes.arrayOf(PropTypes.string)
  }).isRequired,
  onRecoveryStep: PropTypes.func,
  onComplete: PropTypes.func,
  onCancel: PropTypes.func.isRequired,
  className: PropTypes.string
};

export default GuardrailErrorRecovery;
