import { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * Comprehensive troubleshooting guide for guardrsues
 */
const GuardrailTroubleshootingGuide = ({
  errorInfo,
  onClose,
  onRetry,
  className = ''
}) => {
  const [activeSection, setActiveSection] = useState('overview');

  const getPermissionsGuidance = () => {
    return {
      title: 'AWS Permissions Setup',
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Required IAM Permissions</h4>
            <div className="bg-gray-50 rounded-md p-3">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap">
{`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:CreateGuardrail",
        "bedrock:DeleteGuardrail",
        "bedrock:GetGuardrail",
        "bedrock:ListGuardrails",
        "bedrock:UpdateGuardrail",
        "bedrock:ApplyGuardrail"
      ],
      "Resource": "*"
    }
  ]
}`}
              </pre>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Steps to Configure Permissions</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              <li>Open the AWS IAM Console</li>
              <li>Navigate to your user or role</li>
              <li>Attach the policy above or use the AWS managed policy: <code className="bg-gray-100 px-1 rounded">AmazonBedrockFullAccess</code></li>
              <li>Ensure Bedrock is enabled in your AWS account</li>
              <li>Verify you're using a supported region (us-east-1, us-west-2, etc.)</li>
            </ol>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <div className="flex">
              <svg className="h-5 w-5 text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-blue-800">Note</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Some AWS accounts may need to request access to Amazon Bedrock through the AWS Console before using guardrails.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    };
  };

  const getCredentialsGuidance = () => {
    return {
      title: 'AWS Credentials Configuration',
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Option 1: Using Local Setup Script</h4>
            <div className="bg-gray-50 rounded-md p-3">
              <pre className="text-sm text-gray-700">
{`# Run the setup script
./local-setup.sh

# Or on Windows
./local-setup.ps1`}
              </pre>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              This script extracts credentials from your AWS CLI configuration and creates a .env.local file.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Option 2: Manual .env.local File</h4>
            <div className="bg-gray-50 rounded-md p-3">
              <pre className="text-sm text-gray-700">
{`VITE_AWS_ACCESS_KEY_ID=your_access_key_here
VITE_AWS_SECRET_ACCESS_KEY=your_secret_key_here
VITE_AWS_SESSION_TOKEN=your_session_token_here
VITE_AWS_REGION=us-east-1`}
              </pre>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Create this file in your project root. Session token is only needed for temporary credentials.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Option 3: AWS SSO</h4>
            <div className="bg-gray-50 rounded-md p-3">
              <pre className="text-sm text-gray-700">
{`# Configure AWS SSO
aws configure sso

# Login to SSO
aws sso login

# Run the local setup script
./local-setup.sh`}
              </pre>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <div className="flex">
              <svg className="h-5 w-5 text-yellow-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-yellow-800">Security Note</h4>
                <p className="text-sm text-yellow-700 mt-1">
                  Never commit .env.local files to version control. They contain sensitive credentials.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    };
  };

  const getConfigurationGuidance = () => {
    return {
      title: 'Guardrail Configuration Help',
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Basic Guardrail Configuration</h4>
            <div className="bg-gray-50 rounded-md p-3">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap">
{`{
  "guardrails": {
    "enabled": true,
    "name": "my-scenario-guardrail",
    "description": "Content safety guardrail for my scenario",
    "blockedInputMessaging": "This input violates our content policy.",
    "blockedOutputsMessaging": "I cannot provide that type of content.",
    "contentPolicyConfig": {
      "filtersConfig": [
        {
          "type": "HATE",
          "inputStrength": "HIGH",
          "outputStrength": "HIGH"
        },
        {
          "type": "VIOLENCE",
          "inputStrength": "MEDIUM",
          "outputStrength": "HIGH"
        }
      ]
    }
  }
}`}
              </pre>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Available Content Filters</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white border rounded-md p-3">
                <h5 className="font-medium text-gray-900">HATE</h5>
                <p className="text-sm text-gray-600">Hate speech and discriminatory content</p>
              </div>
              <div className="bg-white border rounded-md p-3">
                <h5 className="font-medium text-gray-900">VIOLENCE</h5>
                <p className="text-sm text-gray-600">Violent or graphic content</p>
              </div>
              <div className="bg-white border rounded-md p-3">
                <h5 className="font-medium text-gray-900">SEXUAL</h5>
                <p className="text-sm text-gray-600">Sexual or adult content</p>
              </div>
              <div className="bg-white border rounded-md p-3">
                <h5 className="font-medium text-gray-900">INSULTS</h5>
                <p className="text-sm text-gray-600">Insults and offensive language</p>
              </div>
              <div className="bg-white border rounded-md p-3">
                <h5 className="font-medium text-gray-900">MISCONDUCT</h5>
                <p className="text-sm text-gray-600">Criminal activities and misconduct</p>
              </div>
              <div className="bg-white border rounded-md p-3">
                <h5 className="font-medium text-gray-900">PROMPT_ATTACK</h5>
                <p className="text-sm text-gray-600">Prompt injection attempts</p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Filter Strength Levels</h4>
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <span className="w-16 text-sm font-medium">NONE</span>
                <span className="text-sm text-gray-600">No filtering</span>
              </div>
              <div className="flex items-center space-x-3">
                <span className="w-16 text-sm font-medium">LOW</span>
                <span className="text-sm text-gray-600">Minimal filtering, allows most content</span>
              </div>
              <div className="flex items-center space-x-3">
                <span className="w-16 text-sm font-medium">MEDIUM</span>
                <span className="text-sm text-gray-600">Moderate filtering</span>
              </div>
              <div className="flex items-center space-x-3">
                <span className="w-16 text-sm font-medium">HIGH</span>
                <span className="text-sm text-gray-600">Strict filtering, blocks most violations</span>
              </div>
            </div>
          </div>
        </div>
      )
    };
  };

  const getCommonIssuesGuidance = () => {
    return {
      title: 'Common Issues and Solutions',
      content: (
        <div className="space-y-4">
          <div className="border rounded-md p-4">
            <h4 className="font-medium text-gray-900 mb-2">Issue: "Access Denied" Error</h4>
            <p className="text-sm text-gray-600 mb-2">
              This usually means your AWS credentials don't have the required permissions.
            </p>
            <div className="text-sm text-gray-700">
              <strong>Solutions:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Check your IAM permissions (see Permissions tab)</li>
                <li>Ensure Bedrock is enabled in your AWS account</li>
                <li>Try using a different AWS region</li>
                <li>Contact your AWS administrator</li>
              </ul>
            </div>
          </div>

          <div className="border rounded-md p-4">
            <h4 className="font-medium text-gray-900 mb-2">Issue: "Quota Exceeded" Error</h4>
            <p className="text-sm text-gray-600 mb-2">
              You've reached the maximum number of guardrails for your account.
            </p>
            <div className="text-sm text-gray-700">
              <strong>Solutions:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Delete unused guardrails from AWS Console</li>
                <li>Request a quota increase through AWS Support</li>
                <li>Consolidate scenarios to use fewer guardrails</li>
              </ul>
            </div>
          </div>

          <div className="border rounded-md p-4">
            <h4 className="font-medium text-gray-900 mb-2">Issue: "Validation Exception" Error</h4>
            <p className="text-sm text-gray-600 mb-2">
              Your guardrail configuration is invalid or malformed.
            </p>
            <div className="text-sm text-gray-700">
              <strong>Solutions:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Check your scenario's guardrail configuration syntax</li>
                <li>Ensure all required fields are present</li>
                <li>Verify filter types and strength values are valid</li>
                <li>See Configuration tab for examples</li>
              </ul>
            </div>
          </div>

          <div className="border rounded-md p-4">
            <h4 className="font-medium text-gray-900 mb-2">Issue: "Throttling Exception" Error</h4>
            <p className="text-sm text-gray-600 mb-2">
              You're making too many requests to the AWS API.
            </p>
            <div className="text-sm text-gray-700">
              <strong>Solutions:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Wait a moment and try again (automatic retry is enabled)</li>
                <li>Reduce the frequency of guardrail operations</li>
                <li>Contact AWS Support if throttling persists</li>
              </ul>
            </div>
          </div>

          <div className="border rounded-md p-4">
            <h4 className="font-medium text-gray-900 mb-2">Issue: Guardrails Not Working</h4>
            <p className="text-sm text-gray-600 mb-2">
              Guardrails are configured but not being applied during tests.
            </p>
            <div className="text-sm text-gray-700">
              <strong>Solutions:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Check that guardrails are enabled in your scenario</li>
                <li>Verify the guardrail was created successfully in AWS</li>
                <li>Ensure you're using a supported model</li>
                <li>Check the browser console for error messages</li>
              </ul>
            </div>
          </div>
        </div>
      )
    };
  };

  const sections = {
    overview: {
      title: 'Overview',
      content: (
        <div className="space-y-4">
          {errorInfo && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <h4 className="font-medium text-red-800 mb-2">Current Issue</h4>
              <p className="text-sm text-red-700 mb-3">{errorInfo.userMessage}</p>

              {errorInfo.suggestedActions && errorInfo.suggestedActions.length > 0 && (
                <div>
                  <h5 className="font-medium text-red-800 mb-2">Suggested Actions:</h5>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                    {errorInfo.suggestedActions.map((action, index) => (
                      <li key={index}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Quick Troubleshooting Steps</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              <li>Check your AWS credentials are configured (see Credentials tab)</li>
              <li>Verify your AWS permissions (see Permissions tab)</li>
              <li>Review your guardrail configuration (see Configuration tab)</li>
              <li>Check for common issues (see Common Issues tab)</li>
              <li>Try refreshing the page or restarting the application</li>
            </ol>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h4 className="font-medium text-blue-800 mb-2">Need More Help?</h4>
            <p className="text-sm text-blue-700">
              If you're still experiencing issues after following this guide, check the browser console
              for additional error details or contact your system administrator.
            </p>
          </div>
        </div>
      )
    },
    permissions: getPermissionsGuidance(),
    credentials: getCredentialsGuidance(),
    configuration: getConfigurationGuidance(),
    issues: getCommonIssuesGuidance()
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-lg ${className}`}>
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          Guardrail Troubleshooting Guide
        </h3>
        <div className="flex items-center space-x-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200"
            >
              Retry Operation
            </button>
          )}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Navigation */}
        <div className="w-48 border-r border-gray-200 p-4">
          <nav className="space-y-1">
            {Object.entries(sections).map(([key, section]) => (
              <button
                key={key}
                onClick={() => setActiveSection(key)}
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors duration-200 ${
                  activeSection === key
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {section.title}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 p-6">
          <div className="max-w-4xl">
            <h4 className="text-lg font-medium text-gray-900 mb-4">
              {sections[activeSection].title}
            </h4>
            {sections[activeSection].content}
          </div>
        </div>
      </div>
    </div>
  );
};

GuardrailTroubleshootingGuide.propTypes = {
  errorInfo: PropTypes.shape({
    userMessage: PropTypes.string,
    suggestedActions: PropTypes.arrayOf(PropTypes.string),
    type: PropTypes.string,
    severity: PropTypes.string
  }),
  onClose: PropTypes.func.isRequired,
  onRetry: PropTypes.func,
  className: PropTypes.string
};

export default GuardrailTroubleshootingGuide;
