import { useState } from 'react';
import PropTypes from 'prop-types';
import { isMomentoEnabled } from '../utils/momentoConfig.js';
import { flushAllCache } from '../utils/caching.js';

/**
 * Cache Manager Component
 *
 * Provides cache status and flush functionality.
 * Only renders when caching is enabled.
 */
export default function CacheManager({ compact = false }) {
  const [isFlushingCache, setIsFlushingCache] = useState(false);
  const [flushResult, setFlushResult] = useState(null);
  const [showResult, setShowResult] = useState(false);

  // Don't render if caching is not enabled
  if (!isMomentoEnabled()) {
    return null;
  }

  const handleFlushCache = async () => {
    setIsFlushingCache(true);
    setFlushResult(null);
    setShowResult(false);

    try {
      const result = await flushAllCache();
      setFlushResult(result);
      setShowResult(true);

      // Auto-hide result after 3 seconds
      setTimeout(() => {
        setShowResult(false);
      }, 3000);
    } catch (error) {
      setFlushResult({
        success: false,
        message: `Failed to flush cache: ${error.message}`,
        error: error.message
      });
      setShowResult(true);

      setTimeout(() => {
        setShowResult(false);
      }, 5000);
    } finally {
      setIsFlushingCache(false);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center space-x-1">
        {/* Compact Cache Status and Button */}
        <div className="flex items-center space-x-1 text-xs text-gray-500">
          <div className="w-2 h-2 bg-green-400 rounded-full" title="Cache enabled"></div>
        </div>

        <button
          onClick={handleFlushCache}
          disabled={isFlushingCache}
          className={`
            inline-flex items-center p-1 text-xs rounded-md
            transition-colors duration-200
            ${isFlushingCache
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }
          `}
          title="Clear cached tool data"
        >
          {isFlushingCache ? (
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          )}
        </button>

        {/* Compact Result Message */}
        {showResult && flushResult && (
          <div className={`
            inline-flex items-center px-1 py-0.5 text-xs rounded
            ${flushResult.success
              ? 'text-green-600'
              : 'text-red-600'
            }
          `}>
            {flushResult.success ? (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      {/* Cache Status Indicator */}
      <div className="flex items-center space-x-1 text-xs text-gray-500">
        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
        <span>Cache</span>
      </div>

      {/* Flush Cache Button */}
      <button
        onClick={handleFlushCache}
        disabled={isFlushingCache}
        className={`
          inline-flex items-center px-2 py-1 text-xs font-medium rounded-md
          transition-colors duration-200
          ${isFlushingCache
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-700'
          }
        `}
        title="Clear all cached data"
      >
        {isFlushingCache ? (
          <>
            <svg className="w-3 h-3 mr-1 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Clearing...
          </>
        ) : (
          <>
            <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Clear Cache
          </>
        )}
      </button>

      {/* Result Message */}
      {showResult && flushResult && (
        <div className={`
          px-2 py-1 text-xs rounded-md transition-all duration-300
          ${flushResult.success
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
          }
        `}>
          {flushResult.success ? (
            <div className="flex items-center space-x-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Cache cleared</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Clear failed</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

CacheManager.propTypes = {
  compact: PropTypes.bool
};
