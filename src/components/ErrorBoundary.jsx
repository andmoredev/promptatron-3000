import React from 'react'
import PropTypes from 'prop-types'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    }
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // Generate unique error ID for tracking
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Log the error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo)

    // Log additional context
    console.error('Error ID:', errorId)
    console.error('User Agent:', navigator.userAgent)
    console.error('URL:', window.location.href)
    console.error('Timestamp:', new Date().toISOString())

    this.setState({
      error: error,
      errorInfo: errorInfo,
      errorId: errorId
    })

    // Report error to external service if configured
    this.reportError(error, errorInfo, errorId)
  }

  reportError = (error, errorInfo, errorId) => {
    // In a production environment, you would send this to an error reporting service
    // For now, we'll just log it locally
    try {
      const errorReport = {
        errorId,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        props: this.props
      }

      // Store in localStorage for debugging
      const existingReports = JSON.parse(localStorage.getItem('error-reports') || '[]')
      existingReports.unshift(errorReport)
      // Keep only last 10 error reports
      localStorage.setItem('error-reports', JSON.stringify(existingReports.slice(0, 10)))
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError)
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Something went wrong
              </h1>
              <p className="text-gray-600">
                The application encountered an unexpected error and needs to be restarted.
              </p>
            </div>

            {/* Error Details (in development) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Error Details:</h3>
                {this.state.errorId && (
                  <div className="mb-2 text-xs text-gray-600">
                    <span className="font-medium">Error ID:</span> {this.state.errorId}
                  </div>
                )}
                <div className="text-sm text-gray-700 font-mono bg-white p-3 rounded border overflow-auto max-h-32">
                  {this.state.error.toString()}
                </div>
                {this.state.errorInfo && (
                  <details className="mt-2">
                    <summary className="text-sm font-medium text-gray-700 cursor-pointer">
                      Component Stack
                    </summary>
                    <div className="mt-2 text-xs text-gray-600 font-mono bg-white p-3 rounded border overflow-auto max-h-32">
                      {this.state.errorInfo.componentStack}
                    </div>
                  </details>
                )}
                <details className="mt-2">
                  <summary className="text-sm font-medium text-gray-700 cursor-pointer">
                    Browser Information
                  </summary>
                  <div className="mt-2 text-xs text-gray-600 space-y-1">
                    <div><span className="font-medium">User Agent:</span> {navigator.userAgent}</div>
                    <div><span className="font-medium">URL:</span> {window.location.href}</div>
                    <div><span className="font-medium">Timestamp:</span> {new Date().toISOString()}</div>
                  </div>
                </details>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors duration-200"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors duration-200"
              >
                Reload Page
              </button>
            </div>

            {/* Help Text */}
            <div className="mt-6 text-center text-sm text-gray-500">
              <p>If this problem persists, try:</p>
              <ul className="mt-2 space-y-1">
                <li>• Clearing your browser cache and cookies</li>
                <li>• Checking your AWS credentials configuration</li>
                <li>• Ensuring you have a stable internet connection</li>
                <li>• Refreshing the page</li>
                <li>• Using a different browser</li>
                <li>• Checking browser console for additional details</li>
              </ul>
              {this.state.errorId && (
                <p className="mt-3 text-xs">
                  <span className="font-medium">Error ID:</span> {this.state.errorId}
                  <br />
                  <span className="text-gray-400">Include this ID when reporting the issue</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired
}

export default ErrorBoundary