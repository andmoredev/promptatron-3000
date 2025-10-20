import { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * Contextual help component for guardrail-related guidance
 */
const GuardrailContextualHelp = ({
  type = 'general',
  trigger = 'hover',
  position = 'right',
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const getHelpContent = () => {
    const helpContent = {
      general: {
        title: 'About Guardrails',
        content: (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Guardrails provide content filtering and safety controls for AI model interactions.
            </p>
            <p className="text-sm text-gray-700">
              They can detect and block harmful content, PII, and other sensitive information.
            </p>
          </div>
        )
      },
      permissions: {
        title: 'AWS Permissions Required',
        content: (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Your AWS credentials need the following permissions:
            </p>
            <ul className="text-xs text-gray-600 list-disc list-inside space-y-1">
              <li>bedrock:CreateGuardrail</li>
              <li>bedrock:ListGuardrails</li>
              <li>bedrock:ApplyGuardrail</li>
            </ul>
            <p className="text-xs text-gray-500">
              Or use the managed policy: AmazonBedrockFullAccess
            </p>
          </div>
        )
      },
      credentials: {
        title: 'AWS Credentials Setup',
        content: (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Configure AWS credentials using one of these methods:
            </p>
            <ul className="text-xs text-gray-600 list-disc list-inside space-y-1">
              <li>Run ./local-setup.sh script</li>
              <li>Create .env.local with VITE_AWS_* variables</li>
              <li>Use AWS SSO with aws sso login</li>
            </ul>
          </div>
        )
      },
      configuration: {
        title: 'Guardrail Configuration',
        content: (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Configure guardrails in your scenario file:
            </p>
            <div className="bg-gray-50 rounded p-2 text-xs font-mono">
              "guardrails": {'{'}
              <br />
              &nbsp;&nbsp;"enabled": true,
              <br />
              &nbsp;&nbsp;"contentPolicyConfig": ...
              <br />
              {'}'}
            </div>
          </div>
        )
      },
      troubleshooting: {
        title: 'Common Issues',
        content: (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Common guardrail issues and solutions:
            </p>
            <ul className="text-xs text-gray-600 list-disc list-inside space-y-1">
              <li>Access Denied → Check AWS permissions</li>
              <li>Quota Exceeded → Delete unused guardrails</li>
              <li>Validation Error → Check configuration syntax</li>
              <li>Throttling → Wait and retry automatically</li>
            </ul>
          </div>
        )
      },
      degraded: {
        title: 'Degraded Mode',
        content: (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Guardrails are temporarily unavailable, but core functionality continues.
            </p>
            <p className="text-xs text-gray-600">
              This usually happens due to AWS credential issues or service problems.
              Try the recovery option or check your AWS setup.
            </p>
          </div>
        )
      }
    };

    return helpContent[type] || helpContent.general;
  };

  const handleMouseEnter = () => {
    if (trigger === 'hover') {
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    if (trigger === 'hover') {
      setIsVisible(false);
    }
  };

  const handleClick = () => {
    if (trigger === 'click') {
      setIsVisible(!isVisible);
    }
  };

  const getPositionClasses = () => {
    const positions = {
      right: 'left-full top-0 ml-2',
      left: 'right-full top-0 mr-2',
      top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
      bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2'
    };
    return positions[position] || positions.right;
  };

  const getArrowClasses = () => {
    const arrows = {
      right: 'absolute top-3 -left-1 w-2 h-2 bg-gray-800 transform rotate-45',
      left: 'absolute top-3 -right-1 w-2 h-2 bg-gray-800 transform rotate-45',
      top: 'absolute -bottom-1 left-1/2 transform -translate-x-1/2 rotate-45 w-2 h-2 bg-gray-800',
      bottom: 'absolute -top-1 left-1/2 transform -translate-x-1/2 rotate-45 w-2 h-2 bg-gray-800'
    };
    return arrows[position] || arrows.right;
  };

  const content = getHelpContent();

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className="inline-flex items-center justify-center w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors duration-200"
        aria-label="Help"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {isVisible && (
        <div className={`absolute z-50 w-80 ${getPositionClasses()}`}>
          <div className="bg-gray-800 text-white rounded-lg shadow-lg p-4 relative">
            <div className={getArrowClasses()}></div>

            <h4 className="font-medium text-white mb-2">
              {content.title}
            </h4>

            <div className="text-gray-200">
              {content.content}
            </div>

            {trigger === 'click' && (
              <button
                onClick={() => setIsVisible(false)}
                className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors duration-200"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

GuardrailContextualHelp.propTypes = {
  type: PropTypes.oneOf([
    'general',
    'permissions',
    'credentials',
    'configuration',
    'troubleshooting',
    'degraded'
  ]),
  trigger: PropTypes.oneOf(['hover', 'click']),
  position: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
  className: PropTypes.string
};

export default GuardrailContextualHelp;
