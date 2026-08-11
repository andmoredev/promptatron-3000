import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const BrowserCompatibility = ({ children }) => {
  const [compatibilityIssues, setCompatibilityIssues] = useState([]);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    checkBrowserCompatibility();
  }, []);

  const checkBrowserCompatibility = () => {
    const issues = [];

    // Check for ES6+ support using safer feature detection
    try {
      // Test arrow functions
      const testArrow = () => true;
      // Test destructuring
      const [testDestructure] = [1];
      // Test const/let
      const testConst = 'test';
      let testLet = 'test';

      // If we get here, basic ES6 features are supported
      if (!testArrow() || testDestructure !== 1 || !testConst || !testLet) {
        throw new Error('ES6 features not working properly');
      }
    } catch (e) {
      issues.push({
        type: 'critical',
        feature: 'ES6 Support',
        message: 'Your browser does not support modern JavaScript features required by this application.',
        solution: 'Please update to a modern browser (Chrome 60+, Firefox 55+, Safari 12+, Edge 79+)'
      });
    }

    // Check for Fetch API
    if (!window.fetch) {
      issues.push({
        type: 'critical',
        feature: 'Fetch API',
        message: 'Your browser does not support the Fetch API required for network requests.',
        solution: 'Please update your browser or use a fetch polyfill'
      });
    }

    // Check for localStorage
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
    } catch (e) {
      issues.push({
        type: 'warning',
        feature: 'Local Storage',
        message: 'Local storage is not available. Test history will not be saved.',
        solution: 'Enable local storage in your browser settings or use a different browser'
      });
    }

    // Check for File System Access API (optional)
    if (!('showOpenFilePicker' in window)) {
      issues.push({
        type: 'info',
        feature: 'File System Access API',
        message: 'Advanced file operations are not supported in this browser.',
        solution: 'For full functionality, use Chrome 86+ or Edge 86+'
      });
    }

    // Check for WebCrypto API (used by AWS SDK)
    if (!window.crypto || !window.crypto.subtle) {
      issues.push({
        type: 'critical',
        feature: 'Web Crypto API',
        message: 'Your browser does not support cryptographic operations required by AWS SDK.',
        solution: 'Please use a modern browser with HTTPS support'
      });
    }

    // Check if running on HTTPS (required for some features)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      issues.push({
        type: 'warning',
        feature: 'HTTPS',
        message: 'Some features may not work properly without HTTPS.',
        solution: 'Access the application via HTTPS for full functionality'
      });
    }

    // Check for minimum viewport size
    if (window.innerWidth < 320 || window.innerHeight < 480) {
      issues.push({
        type: 'warning',
        feature: 'Screen Size',
        message: 'Your screen size is very small. Some features may not display properly.',
        solution: 'Use a larger screen or rotate your device to landscape mode'
      });
    }

    setCompatibilityIssues(issues);

    // Show warning if there are critical issues
    const hasCriticalIssues = issues.some(issue => issue.type === 'critical');
    setShowWarning(hasCriticalIssues || issues.length > 2);
  };

  const dismissWarning = () => {
    setShowWarning(false);
  };

  const criticalIssues = compatibilityIssues.filter(issue => issue.type === 'critical');
  const warningIssues = compatibilityIssues.filter(issue => issue.type === 'warning');
  const infoIssues = compatibilityIssues.filter(issue => issue.type === 'info');

  // If there are critical issues, show blocking screen
  if (criticalIssues.length > 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-100 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-yellow-100 mb-4">
              <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Browser Compatibility Issues
            </h1>
            <p className="text-gray-600">
              Your browser does not support some features required by this application.
            </p>
          </div>

          <div className="space-y-4 mb-6">
            {criticalIssues.map((issue, index) => (
              <div key={index} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      {issue.feature}
                    </h3>
                    <p className="mt-1 text-sm text-red-700">{issue.message}</p>
                    <p className="mt-2 text-sm text-red-600 font-medium">{issue.solution}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors duration-200"
            >
              Retry After Browser Update
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Warning Banner for non-critical issues */}
      {showWarning && (warningIssues.length > 0 || infoIssues.length > 0) && (
        <div className="bg-yellow-50 border-b border-yellow-200 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-yellow-800">
                  Browser Compatibility Notice
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>Some features may not work optimally in your current browser:</p>
                  <ul className="mt-1 list-disc list-inside space-y-1">
                    {[...warningIssues, ...infoIssues].map((issue, index) => (
                      <li key={index}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="ml-3 flex-shrink-0">
                <button
                  onClick={dismissWarning}
                  className="inline-flex text-yellow-400 hover:text-yellow-600"
                >
                  <span className="sr-only">Dismiss</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {children}
    </>
  );
};

BrowserCompatibility.propTypes = {
  children: PropTypes.node.isRequired
};

export default BrowserCompatibility;
