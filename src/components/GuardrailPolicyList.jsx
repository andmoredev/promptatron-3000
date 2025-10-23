import { useState } from 'react';
import PropTypes from 'prop-types';
import HelpTooltip from './HelpTooltip';

const GuardrailPolicyList = ({
  guardrailId,
  configurations,
  configurationDetails,
  isLoading
}) => {
  const [expandedPolicies, setExpandedPolicies] = useState(new Set());

  // Configuration type display information
  const configurationInfo = {
    TOPIC_POLICY: {
      name: 'Topic Policy',
      description: 'Prevents discussion of specific subjects you define (e.g., "financial advice", "medical diagnosis", "legal counsel"). Blocks both user questions and AI responses about these restricted topics.',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      )
    },
    CONTENT_POLICY: {
      name: 'Content Policy',
      description: 'Automatically detects and blocks harmful content categories: sexual content, violence, hate speech, insults, misconduct, and prompt injection attacks. Uses AI to analyze content meaning, not just keywords.',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    WORD_POLICY: {
      name: 'Word Policy',
      description: 'Blocks exact words and phrases you specify, plus AWS managed lists (like PROFANITY). Unlike content policy, this does exact text matching rather than meaning analysis. Useful for brand-specific terms or compliance requirements.',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
        </svg>
      )
    },
    SENSITIVE_INFORMATION: {
      name: 'Sensitive Information',
      description: 'Automatically detects personally identifiable information like social security numbers, email addresses, phone numbers, credit cards, and names. Can either block the content entirely or anonymize it (replace with [EMAIL], [SSN], etc.).',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )
    },
    CONTEXTUAL_GROUNDING: {
      name: 'Contextual Grounding',
      description: 'Ensures AI responses are based on your provided documents/context rather than general knowledge. Blocks responses that drift off-topic (relevance) or aren\'t supported by your source material (grounding). Essential for customer service and documentation use cases.',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    AUTOMATED_REASONING: {
      name: 'Automated Reasoning',
      description: 'Advanced policy type that applies logical reasoning and consistency checks to content. Evaluates whether responses make logical sense, are internally consistent, and follow proper reasoning patterns. Useful for complex analytical or decision-making applications.',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )
    }
  };

  const toggleExpanded = (policyType) => {
    setExpandedPolicies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(policyType)) {
        newSet.delete(policyType);
      } else {
        newSet.add(policyType);
      }
      return newSet;
    });
  };



  // Parse detailed configuration data to extract ALL names and comprehensive information
  const parseConfigurationDetails = (guardrailData, policyType) => {
    if (!guardrailData) return null;

    const pick = (obj, keyBase) => obj?.[`${keyBase}Config`] || obj?.[keyBase] || null;
    const asArray = (v) => (Array.isArray(v) ? v : []);

    switch (policyType) {
      case 'TOPIC_POLICY': {
        const topicPolicy = pick(guardrailData, 'topicPolicy');
        const topics = topicPolicy?.topicsConfig || topicPolicy?.topics || [];
        const enabledTopics = asArray(topics).filter(t => t.inputEnabled || t.outputEnabled);

        if (enabledTopics.length > 0) {
          // Get ALL topic names, not just first 3
          const allTopicNames = enabledTopics.map(t => t.name || t.definition || 'Unnamed Topic');
          const topicDetails = enabledTopics.map(t => ({
            name: t.name || t.definition || 'Unnamed Topic',
            definition: t.definition || t.name || '',
            inputEnabled: t.inputEnabled || false,
            outputEnabled: t.outputEnabled || false
          }));

          return {
            type: 'Topics',
            names: allTopicNames,
            details: topicDetails,
            totalEnabled: enabledTopics.length,
            summary: `${enabledTopics.length} topics: ${allTopicNames.join(', ')}`
          };
        }
        break;
      }

      case 'CONTENT_POLICY': {
        const contentPolicy = pick(guardrailData, 'contentPolicy');
        const filters = contentPolicy?.filtersConfig || contentPolicy?.filters || [];
        const enabledFilters = asArray(filters).filter(f => f.inputEnabled || f.outputEnabled || f.inputStrength || f.outputStrength);

        if (enabledFilters.length > 0) {
          const filterDetails = enabledFilters.map(f => ({
            type: f.type,
            inputEnabled: f.inputEnabled || !!f.inputStrength,
            outputEnabled: f.outputEnabled || !!f.outputStrength,
            inputStrength: f.inputStrength || (f.inputEnabled ? 'MEDIUM' : null),
            outputStrength: f.outputStrength || (f.outputEnabled ? 'MEDIUM' : null)
          }));

          const filterTypes = [...new Set(enabledFilters.map(f => f.type).filter(Boolean))];

          return {
            type: 'Content Filters',
            filterTypes: filterTypes,
            details: filterDetails,
            summary: `${filterTypes.length} filter types: ${filterTypes.join(', ')}`
          };
        }
        break;
      }

      case 'WORD_POLICY': {
        const wordPolicy = pick(guardrailData, 'wordPolicy');
        const words = wordPolicy?.wordsConfig || wordPolicy?.words || [];
        const managedLists = wordPolicy?.managedWordListsConfig || wordPolicy?.managedWordLists || [];

        const enabledWords = asArray(words).filter(w => w.inputEnabled || w.outputEnabled);
        const enabledLists = asArray(managedLists).filter(l => l.inputEnabled || l.outputEnabled);

        // Get ALL words and lists, not just first 3
        const allWordTexts = enabledWords.map(w => w.text || 'Word');
        const allListNames = enabledLists.map(l => l.type || l.name || 'List');

        const wordDetails = enabledWords.map(w => ({
          text: w.text || 'Word',
          inputEnabled: w.inputEnabled || false,
          outputEnabled: w.outputEnabled || false
        }));

        const listDetails = enabledLists.map(l => ({
          name: l.type || l.name || 'List',
          inputEnabled: l.inputEnabled || false,
          outputEnabled: l.outputEnabled || false
        }));

        if (allWordTexts.length > 0 || allListNames.length > 0) {
          const parts = [];
          if (allWordTexts.length > 0) {
            parts.push(`${allWordTexts.length} words: ${allWordTexts.join(', ')}`);
          }
          if (allListNames.length > 0) {
            parts.push(`${allListNames.length} managed lists: ${allListNames.join(', ')}`);
          }

          return {
            type: 'Word Filtering',
            words: allWordTexts,
            managedLists: allListNames,
            wordDetails: wordDetails,
            listDetails: listDetails,
            summary: parts.join('; ')
          };
        }
        break;
      }

      case 'SENSITIVE_INFORMATION': {
        const sensitivePolicy = pick(guardrailData, 'sensitiveInformationPolicy');
        const piiEntities = sensitivePolicy?.piiEntitiesConfig || sensitivePolicy?.piiEntities || [];
        const regexes = sensitivePolicy?.regexesConfig || sensitivePolicy?.regexes || [];

        const enabledPii = asArray(piiEntities).filter(e => e.inputEnabled || e.outputEnabled);
        const enabledRegex = asArray(regexes).filter(r => r.inputEnabled || r.outputEnabled);

        // Get ALL PII types and regex patterns
        const allPiiTypes = enabledPii.map(e => e.type || 'PII');
        const allRegexNames = enabledRegex.map(r => r.name || r.pattern || 'Pattern');

        const piiDetails = enabledPii.map(e => ({
          type: e.type || 'PII',
          inputEnabled: e.inputEnabled || false,
          outputEnabled: e.outputEnabled || false,
          action: e.action || 'BLOCK'
        }));

        const regexDetails = enabledRegex.map(r => ({
          name: r.name || 'Pattern',
          pattern: r.pattern || '',
          inputEnabled: r.inputEnabled || false,
          outputEnabled: r.outputEnabled || false,
          action: r.action || 'BLOCK'
        }));

        if (allPiiTypes.length > 0 || allRegexNames.length > 0) {
          const parts = [];
          if (allPiiTypes.length > 0) {
            parts.push(`${allPiiTypes.length} PII types: ${allPiiTypes.join(', ')}`);
          }
          if (allRegexNames.length > 0) {
            parts.push(`${allRegexNames.length} patterns: ${allRegexNames.join(', ')}`);
          }

          return {
            type: 'PII Detection',
            piiTypes: allPiiTypes,
            regexPatterns: allRegexNames,
            piiDetails: piiDetails,
            regexDetails: regexDetails,
            summary: parts.join('; ')
          };
        }
        break;
      }

      case 'CONTEXTUAL_GROUNDING': {
        const groundingPolicy = pick(guardrailData, 'contextualGroundingPolicy');
        const filters = groundingPolicy?.filtersConfig || groundingPolicy?.filters || [];
        const enabledFilters = asArray(filters).filter(f => f.enabled);

        if (enabledFilters.length > 0) {
          // Get ALL filter names and details
          const allFilterNames = enabledFilters.map(f => f.type || f.name || 'Filter');
          const filterDetails = enabledFilters.map(f => ({
            name: f.type || f.name || 'Filter',
            type: f.type || 'GROUNDING',
            threshold: f.threshold || 0.5,
            enabled: f.enabled || false
          }));

          return {
            type: 'Grounding Filters',
            filterNames: allFilterNames,
            details: filterDetails,
            summary: `${enabledFilters.length} filters: ${allFilterNames.join(', ')}`
          };
        }
        break;
      }

      case 'AUTOMATED_REASONING': {
        const reasoningPolicy = pick(guardrailData, 'automatedReasoningPolicy');
        const policies = reasoningPolicy?.policies || [];

        if (policies.length > 0) {
          const policyDetails = policies.map(p => ({
            name: p.name || 'Policy',
            type: p.type || 'REASONING',
            enabled: p.enabled !== false
          }));

          const policyNames = policies.map(p => p.name || 'Policy');

          return {
            type: 'Reasoning Policies',
            count: policies.length,
            names: policyNames,
            details: policyDetails,
            summary: `${policies.length} policies: ${policyNames.join(', ')}`
          };
        }
        break;
      }

      default:
        return null;
    }

    return null;
  };

  if (!configurations) {
    return (
      <div className="text-center py-4 text-gray-500">
        <p className="text-sm">No guardrail configurations available</p>
      </div>
    );
  }

  // Only show active policies that have configuration
  const availableConfigurations = Object.entries(configurations).filter(
    ([, config]) => config.hasConfiguration && config.isActive
  );

  if (availableConfigurations.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        <svg className="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <p className="text-sm font-medium">No active policies</p>
        <p className="text-xs text-gray-400 mt-1">
          Active guardrail policies will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium text-gray-900">Active Policies</h4>
        <span className="text-xs text-gray-500">
          {availableConfigurations.length} {availableConfigurations.length === 1 ? 'policy' : 'policies'} active
        </span>
      </div>

      <div className="space-y-1.5">
        {availableConfigurations.map(([policyType, config]) => {
          const info = configurationInfo[policyType];
          const isActive = config.isActive;
          const isExpanded = expandedPolicies.has(policyType);
          const parsedDetails = parseConfigurationDetails(configurationDetails, policyType);

          if (!info) return null;

          return (
            <div
              key={policyType}
              className="border border-primary-200 bg-primary-50 rounded-lg transition-all duration-200 hover:shadow-sm"
            >
              <div className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 p-2 rounded-lg bg-primary-100 text-primary-600">
                      {info.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        <h5 className="text-sm font-medium text-gray-900 truncate">
                          {info.name}
                        </h5>
                        <HelpTooltip
                          content={info.description}
                          position="right"
                        />
                      </div>

                      {parsedDetails && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-700">
                            {parsedDetails.summary}
                          </p>

                          {isExpanded && (
                            <div className="mt-2 p-3 bg-white rounded border border-gray-100">
                              <div className="space-y-3 text-xs">

                                {/* Topic Policy Details */}
                                {parsedDetails.details && policyType === 'TOPIC_POLICY' && (
                                  <div>
                                    <span className="font-medium text-gray-600 block mb-2">Topic Configurations:</span>
                                    <div className="space-y-2">
                                      {parsedDetails.details.map((topic, index) => (
                                        <div key={index} className="flex items-center justify-between p-2 bg-blue-50 rounded border border-blue-100">
                                          <div className="flex-1">
                                            <span className="font-medium text-blue-900">{topic.name}</span>
                                            {topic.definition && topic.definition !== topic.name && (
                                              <p className="text-blue-700 text-xs mt-1">{topic.definition}</p>
                                            )}
                                          </div>
                                          <div className="flex space-x-1 ml-2">
                                            {topic.inputEnabled && (
                                              <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 rounded text-xs">Input</span>
                                            )}
                                            {topic.outputEnabled && (
                                              <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 rounded text-xs">Output</span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Content Policy Details */}
                                {parsedDetails.details && policyType === 'CONTENT_POLICY' && (
                                  <div>
                                    <span className="font-medium text-gray-600 block mb-2">Content Filter Configurations:</span>
                                    <div className="space-y-2">
                                      {parsedDetails.details.map((filter, index) => (
                                        <div key={index} className="flex items-center justify-between p-2 bg-red-50 rounded border border-red-100">
                                          <div className="flex-1">
                                            <span className="font-medium text-red-900">{filter.type}</span>
                                          </div>
                                          <div className="flex space-x-1 ml-2">
                                            {filter.inputEnabled && (
                                              <span className="px-1.5 py-0.5 bg-red-200 text-red-800 rounded text-xs">
                                                Input {filter.inputStrength && `(${filter.inputStrength})`}
                                              </span>
                                            )}
                                            {filter.outputEnabled && (
                                              <span className="px-1.5 py-0.5 bg-red-200 text-red-800 rounded text-xs">
                                                Output {filter.outputStrength && `(${filter.outputStrength})`}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Word Policy Details */}
                                {policyType === 'WORD_POLICY' && (parsedDetails.wordDetails || parsedDetails.listDetails) && (
                                  <div className="space-y-3">
                                    {parsedDetails.wordDetails && parsedDetails.wordDetails.length > 0 && (
                                      <div>
                                        <span className="font-medium text-gray-600 block mb-2">Custom Words:</span>
                                        <div className="space-y-1">
                                          {parsedDetails.wordDetails.map((word, index) => (
                                            <div key={index} className="flex items-center justify-between p-2 bg-yellow-50 rounded border border-yellow-100">
                                              <span className="font-medium text-yellow-900">{word.text}</span>
                                              <div className="flex space-x-1 ml-2">
                                                {word.inputEnabled && (
                                                  <span className="px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded text-xs">Input</span>
                                                )}
                                                {word.outputEnabled && (
                                                  <span className="px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded text-xs">Output</span>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {parsedDetails.listDetails && parsedDetails.listDetails.length > 0 && (
                                      <div>
                                        <span className="font-medium text-gray-600 block mb-2">Managed Word Lists:</span>
                                        <div className="space-y-1">
                                          {parsedDetails.listDetails.map((list, index) => (
                                            <div key={index} className="flex items-center justify-between p-2 bg-purple-50 rounded border border-purple-100">
                                              <span className="font-medium text-purple-900">{list.name}</span>
                                              <div className="flex space-x-1 ml-2">
                                                {list.inputEnabled && (
                                                  <span className="px-1.5 py-0.5 bg-purple-200 text-purple-800 rounded text-xs">Input</span>
                                                )}
                                                {list.outputEnabled && (
                                                  <span className="px-1.5 py-0.5 bg-purple-200 text-purple-800 rounded text-xs">Output</span>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Sensitive Information Policy Details */}
                                {policyType === 'SENSITIVE_INFORMATION' && (parsedDetails.piiDetails || parsedDetails.regexDetails) && (
                                  <div className="space-y-3">
                                    {parsedDetails.piiDetails && parsedDetails.piiDetails.length > 0 && (
                                      <div>
                                        <span className="font-medium text-gray-600 block mb-2">PII Entity Types:</span>
                                        <div className="space-y-1">
                                          {parsedDetails.piiDetails.map((pii, index) => (
                                            <div key={index} className="flex items-center justify-between p-2 bg-orange-50 rounded border border-orange-100">
                                              <span className="font-medium text-orange-900">{pii.type}</span>
                                              <div className="flex space-x-1 ml-2">
                                                {pii.inputEnabled && (
                                                  <span className="px-1.5 py-0.5 bg-orange-200 text-orange-800 rounded text-xs">Input</span>
                                                )}
                                                {pii.outputEnabled && (
                                                  <span className="px-1.5 py-0.5 bg-orange-200 text-orange-800 rounded text-xs">Output</span>
                                                )}
                                                <span className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">{pii.action}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {parsedDetails.regexDetails && parsedDetails.regexDetails.length > 0 && (
                                      <div>
                                        <span className="font-medium text-gray-600 block mb-2">Regex Patterns:</span>
                                        <div className="space-y-1">
                                          {parsedDetails.regexDetails.map((regex, index) => (
                                            <div key={index} className="p-2 bg-pink-50 rounded border border-pink-100">
                                              <div className="flex items-center justify-between mb-1">
                                                <span className="font-medium text-pink-900">{regex.name}</span>
                                                <div className="flex space-x-1">
                                                  {regex.inputEnabled && (
                                                    <span className="px-1.5 py-0.5 bg-pink-200 text-pink-800 rounded text-xs">Input</span>
                                                  )}
                                                  {regex.outputEnabled && (
                                                    <span className="px-1.5 py-0.5 bg-pink-200 text-pink-800 rounded text-xs">Output</span>
                                                  )}
                                                  <span className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">{regex.action}</span>
                                                </div>
                                              </div>
                                              {regex.pattern && (
                                                <code className="text-xs text-pink-700 bg-pink-100 px-1 py-0.5 rounded font-mono">
                                                  {regex.pattern}
                                                </code>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Contextual Grounding Details */}
                                {parsedDetails.details && policyType === 'CONTEXTUAL_GROUNDING' && (
                                  <div>
                                    <span className="font-medium text-gray-600 block mb-2">Grounding Filter Configurations:</span>
                                    <div className="space-y-2">
                                      {parsedDetails.details.map((filter, index) => (
                                        <div key={index} className="flex items-center justify-between p-2 bg-green-50 rounded border border-green-100">
                                          <div className="flex-1">
                                            <span className="font-medium text-green-900">{filter.name}</span>
                                            <span className="text-green-700 text-xs ml-2">({filter.type})</span>
                                          </div>
                                          <div className="flex space-x-1 ml-2">
                                            <span className="px-1.5 py-0.5 bg-green-200 text-green-800 rounded text-xs">
                                              Threshold: {filter.threshold}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Automated Reasoning Details */}
                                {parsedDetails.details && policyType === 'AUTOMATED_REASONING' && (
                                  <div>
                                    <span className="font-medium text-gray-600 block mb-2">Reasoning Policy Configurations:</span>
                                    <div className="space-y-2">
                                      {parsedDetails.details.map((policy, index) => (
                                        <div key={index} className="flex items-center justify-between p-2 bg-indigo-50 rounded border border-indigo-100">
                                          <div className="flex-1">
                                            <span className="font-medium text-indigo-900">{policy.name}</span>
                                            <span className="text-indigo-700 text-xs ml-2">({policy.type})</span>
                                          </div>
                                          <div className="flex space-x-1 ml-2">
                                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                                              policy.enabled
                                                ? 'bg-green-200 text-green-800'
                                                : 'bg-gray-200 text-gray-700'
                                            }`}>
                                              {policy.enabled ? 'Enabled' : 'Disabled'}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    {parsedDetails && (
                      <button
                        onClick={() => toggleExpanded(policyType)}
                        className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${info.name} details`}
                      >
                        <svg
                          className={`h-4 w-4 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>


              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

GuardrailPolicyList.propTypes = {
  guardrailId: PropTypes.string,
  configurations: PropTypes.objectOf(PropTypes.shape({
    isActive: PropTypes.bool.isRequired,
    lastUpdated: PropTypes.string,
    hasConfiguration: PropTypes.bool.isRequired
  })),
  configurationDetails: PropTypes.object,
  isLoading: PropTypes.bool
};

GuardrailPolicyList.defaultProps = {
  guardrailId: null,
  configurations: {},
  configurationDetails: null,
  isLoading: false
};

export default GuardrailPolicyList;
