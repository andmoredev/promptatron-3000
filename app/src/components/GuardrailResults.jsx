import { useState } from 'react';
import PropTypes from 'prop-types';

const GuardrailResults = ({
  results,
andaloneTest = false,
  onDismiss,
  title
}) => {
  const [expandedResults, setExpandedResults] = useState(new Set());

  if (!results || results.length === 0) {
    return null;
  }

  const toggleExpanded = (index) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedResults(newExpanded);
  };

  // Calculate overall status
  const hasViolations = results.some(result => result.hasViolations?.() || result.action === 'GUARDRAIL_INTERVENED');
  const totalGuardrails = results.length;
  const violatedGuardrails = results.filter(result => result.hasViolations?.() || result.action === 'GUARDRAIL_INTERVENED').length;

  const getViolationTypeColor = (type) => {
    const colors = {
      'SEXUAL': 'bg-red-100 text-red-800 border-red-200',
      'VIOLENCE': 'bg-red-100 text-red-800 border-red-200',
      'HATE': 'bg-orange-100 text-orange-800 border-orange-200',
      'INSULTS': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'MISCONDUCT': 'bg-purple-100 text-purple-800 border-purple-200',
      'PROMPT_ATTACK': 'bg-red-100 text-red-800 border-red-200',
      'PII': 'bg-blue-100 text-blue-800 border-blue-200',
      'WORD': 'bg-orange-100 text-orange-800 border-orange-200',
      'TOPIC': 'bg-purple-100 text-purple-800 border-purple-200',
      'default': 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colors[type] || colors.default;
  };

  const formatViolationDetails = (result) => {
    const details = [];

    if (result.assessments) {
      result.assessments.forEach(assessment => {
        if (assessment.contentPolicy) {
          assessment.contentPolicy.filters?.forEach(filter => {
            if (filter.action === 'BLOCKED') {
              details.push({
                type: filter.type,
                category: 'Content Policy',
                strength: filter.strength,
                confidence: filter.confidence
              });
            }
          });
        }

        if (assessment.wordPolicy) {
          assessment.wordPolicy.words?.forEach(word => {
            if (word.action === 'BLOCKED') {
              details.push({
                type: 'WORD',
                category: 'Word Policy',
                word: word.match,
                confidence: word.confidence
              });
            }
          });

          assessment.wordPolicy.managedWordLists?.forEach(list => {
            if (list.action === 'BLOCKED') {
              details.push({
                type: 'WORD',
                category: 'Managed Word List',
                listType: list.type,
                matches: list.matches
              });
            }
          });
        }

        if (assessment.sensitiveInformationPolicy) {
          assessment.sensitiveInformationPolicy.piiEntities?.forEach(entity => {
            if (entity.action === 'BLOCKED' || entity.action === 'ANONYMIZED') {
              details.push({
                type: 'PII',
                category: 'PII Detection',
                entityType: entity.type,
                action: entity.action,
                matches: entity.matches
              });
            }
          });

          assessment.sensitiveInformationPolicy.regexes?.forEach(regex => {
            if (regex.action === 'BLOCKED' || regex.action === 'ANONYMIZED') {
              details.push({
                type: 'PII',
                category: 'Regex Pattern',
                name: regex.name,
                action: regex.action,
                matches: regex.matches
              });
            }
          });
        }

        if (assessment.topicPolicy) {
          assessment.topicPolicy.topics?.forEach(topic => {
            if (topic.action === 'BLOCKED') {
              details.push({
                type: 'TOPIC',
                category: 'Topic Policy',
                name: topic.name,
                topicType: topic.type,
                confidence: topic.confidence
              });
            }
          });
        }
      });
    }

    return details;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${
              hasViolations ? 'bg-red-400' : 'bg-green-400'
            }`} />
            <h3 className="text-lg font-semibold text-gray-900">
              {title || (isStandaloneTest ? 'Guardrail Evaluation Results' : 'Guardrail Results')}
            </h3>
          </div>

          <div className="flex items-center space-x-3">
            <div className="text-sm text-gray-600">
              {violatedGuardrails > 0 ? (
                <span className="text-red-600 font-medium">
                  {violatedGuardrails} of {totalGuardrails} guardrails triggered
                </span>
              ) : (
                <span className="text-green-600 font-medium">
                  All {totalGuardrails} guardrails passed
                </span>
              )}
            </div>

            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Dismiss results"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Overall Status */}
      <div className={`px-4 py-3 ${
        hasViolations ? 'bg-red-50 border-b border-red-100' : 'bg-green-50 border-b border-green-100'
      }`}>
        <div className="flex items-center space-x-2">
          {hasViolations ? (
            <>
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-sm font-medium text-red-800">
                Content policy violations detected
              </span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-green-800">
                All guardrails passed successfully
              </span>
            </>
          )}
        </div>

        {hasViolations && (
          <p className="mt-1 text-sm text-red-700">
            {isStandaloneTest
              ? 'Review the violations below and consider modifying your content.'
              : 'The model response was filtered according to your guardrail policies.'
            }
          </p>
        )}
      </div>

      {/* Individual Results */}
      <div className="divide-y divide-gray-200">
        {results.map((result, index) => {
          const isExpanded = expandedResults.has(index);
          const hasViolation = result.hasViolations?.() || result.action === 'GUARDRAIL_INTERVENED';
          const violationDetails = hasViolation ? formatViolationDetails(result) : [];

          return (
            <div key={index} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${
                    hasViolation ? 'bg-red-400' : 'bg-green-400'
                  }`} />
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">
                      {result.guardrailName || result.guardrailId || `Guardrail ${index + 1}`}
                    </h4>
                    <p className="text-xs text-gray-500">
                      {hasViolation ? 'Violation detected' : 'No violations'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {result.inputTokens && result.outputTokens && (
                    <span className="text-xs text-gray-500">
                      {result.inputTokens + result.outputTokens} tokens
                    </span>
                  )}

                  {violationDetails.length > 0 && (
                    <button
                      onClick={() => toggleExpanded(index)}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {isExpanded ? 'Hide Details' : 'Show Details'}
                    </button>
                  )}
                </div>
              </div>

              {/* Violation Details */}
              {isExpanded && violationDetails.length > 0 && (
                <div className="mt-3 pl-5 space-y-2">
                  {violationDetails.map((detail, detailIndex) => (
                    <div key={detailIndex} className={`p-3 rounded-lg border ${getViolationTypeColor(detail.type)}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <h5 className="text-sm font-medium">
                            {detail.category}
                          </h5>
                          <div className="mt-1 text-xs space-y-1">
                            {detail.type && (
                              <div>Type: <span className="font-medium">{detail.type}</span></div>
                            )}
                            {detail.entityType && (
                              <div>Entity: <span className="font-medium">{detail.entityType}</span></div>
                            )}
                            {detail.word && (
                              <div>Word: <span className="font-medium">"{detail.word}"</span></div>
                            )}
                            {detail.name && (
                              <div>Name: <span className="font-medium">{detail.name}</span></div>
                            )}
                            {detail.listType && (
                              <div>List Type: <span className="font-medium">{detail.listType}</span></div>
                            )}
                            {detail.action && (
                              <div>Action: <span className="font-medium">{detail.action}</span></div>
                            )}
                            {detail.strength && (
                              <div>Strength: <span className="font-medium">{detail.strength}</span></div>
                            )}
                            {detail.confidence && (
                              <div>Confidence: <span className="font-medium">{(detail.confidence * 100).toFixed(1)}%</span></div>
                            )}
                          </div>
                        </div>

                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getViolationTypeColor(detail.type)}`}>
                          {detail.type}
                        </span>
                      </div>

                      {detail.matches && detail.matches.length > 0 && (
                        <div className="mt-2">
                          <h6 className="text-xs font-medium mb-1">Matches:</h6>
                          <div className="text-xs space-y-1">
                            {detail.matches.slice(0, 3).map((match, matchIndex) => (
                              <div key={matchIndex} className="bg-white bg-opacity-50 px-2 py-1 rounded">
                                "{match}"
                              </div>
                            ))}
                            {detail.matches.length > 3 && (
                              <div className="text-xs text-gray-600">
                                +{detail.matches.length - 3} more matches
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Filtered Content Preview */}
              {hasViolation && result.output && result.output !== result.originalOutput && (
                <div className="mt-3 pl-5">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <h5 className="text-sm font-medium text-yellow-800 mb-2">
                      Filtered Content
                    </h5>
                    <div className="text-sm text-yellow-700 bg-white bg-opacity-50 p-2 rounded border">
                      {result.output.length > 200
                        ? `${result.output.substring(0, 200)}...`
                        : result.output
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer with Actions */}
      {isStandaloneTest && hasViolations && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 rounded-b-lg">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Consider revising your content to address the violations above.
            </div>
            <div className="flex space-x-2">
              <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                Export Results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

GuardrailResults.propTypes = {
  results: PropTypes.arrayOf(PropTypes.shape({
    action: PropTypes.string,
    output: PropTypes.string,
    originalOutput: PropTypes.string,
    assessments: PropTypes.array,
    timestamp: PropTypes.string,
    guardrailId: PropTypes.string,
    guardrailName: PropTypes.string,
    inputTokens: PropTypes.number,
    outputTokens: PropTypes.number,
    hasViolations: PropTypes.func
  })),
  isStandaloneTest: PropTypes.bool,
  onDismiss: PropTypes.func,
  title: PropTypes.string
};

GuardrailResults.defaultProps = {
  results: [],
  isStandaloneTest: false,
  onDismiss: null,
  title: null
};

export default GuardrailResults;
