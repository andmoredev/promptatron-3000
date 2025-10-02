import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * UserNotification component for displaying error messages, warnings, and recovery opti
ports different notification types with appropriate styling and actions
 */
function UserNotification({
  notification,
  onDismiss,
  onAction,
  className = '',
  position = 'top'
}) {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (notification?.autoHide && typeof notification.autoHide === 'number') {
      const timer = setTimeout(() => {
        handleDismiss();
      }, notification.autoHide);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleDismiss = () => {
    if (!notification?.dismissible) return;

    setIsAnimating(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, 200);
  };

  const handleAction = (action) => {
    onAction?.(action);

    // Auto-dismiss after action unless specified otherwise
    if (action.dismissAfterAction !== false) {
      handleDismiss();
    }
  };

  if (!notification || !isVisible) {
    return null;
  }

  // Determine notification styling based on type
  const getNotificationStyles = () => {
    const baseStyles = "border rounded-lg p-4 shadow-sm transition-all duration-200";

    switch (notification.type) {
      case 'error':
        return `${baseStyles} bg-red-50 border-red-200 text-red-800`;
      case 'warning':
        return `${baseStyles} bg-yellow-50 border-yellow-200 text-yellow-800`;
      case 'info':
        return `${baseStyles} bg-blue-50 border-blue-200 text-blue-800`;
      case 'success':
        return `${baseStyles} bg-green-50 border-green-200 text-green-800`;
      default:
        return `${baseStyles} bg-gray-50 border-gray-200 text-gray-800`;
    }
  };

  // Get icon for notification type
  const getNotificationIcon = () => {
    const iconClass = "h-5 w-5 flex-shrink-0";

    switch (notification.type) {
      case 'error':
        return (
          <svg className={`${iconClass} text-red-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'warning':
        return (
          <svg className={`${iconClass} text-yellow-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      case 'info':
        return (
          <svg className={`${iconClass} text-blue-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'success':
        return (
          <svg className={`${iconClass} text-green-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className={`${iconClass} text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  // Get position classes
  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4';
      case 'bottom':
        return 'fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4';
      case 'inline':
        return 'relative w-full';
      default:
        return 'relative w-full';
    }
  };

  return (
    <div
      className={`${getPositionClasses()} ${className} ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
      role="alert"
      aria-live="polite"
    >
      <div className={getNotificationStyles()}>
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {getNotificationIcon()}
          </div>

          <div className="ml-3 flex-1">
            {/* Title */}
            {notification.title && (
              <h3 className="text-sm font-medium mb-1">
                {notification.title}
              </h3>
            )}

            {/* Message */}
            <div className="text-sm">
              {notification.message}
            </div>

            {/* Confidence indicator for token/cost estimates */}
            {notification.confidence && (
    <div className="mt-2 text-xs opacity-75">
                Confidence: {notification.confidence}
              </div>
            )}

            {/* Actions */}
            {notification.actions && notification.actions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {notification.actions.map((action, index) => (
                  <button
                    key={index}
                    onClick={() => handleAction(typeof action === 'string' ? { label: action, action: action.toLowerCase().replace(/\s+/g, '_') } : action)}
                    className={`text-xs font-medium px-3 py-1 rounded-md transition-colors duration-200 ${
                      notification.type === 'error'
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : notification.type === 'warning'
                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                        : notification.type === 'info'
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : notification.type === 'success'
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {typeof action === 'string' ? action : action.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dismiss button */}
          {notification.dismissible && (
            <div className="ml-3 flex-shrink-0">
              <button
                onClick={handleDismiss}
                className={`inline-flex rounded-md p-1.5 transition-colors duration-200 ${
                  notification.type === 'error'
                    ? 'text-red-400 hover:text-red-600 hover:bg-red-100'
                    : notification.type === 'warning'
                    ? 'text-yellow-400 hover:text-yellow-600 hover:bg-yellow-100'
                    : notification.type === 'info'
                    ? 'text-blue-400 hover:text-blue-600 hover:bg-blue-100'
                    : notification.type === 'success'
                    ? 'text-green-400 hover:text-green-600 hover:bg-green-100'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
                aria-label="Dismiss notification"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

UserNotification.propTypes = {
  notification: PropTypes.shape({
    type: PropTypes.oneOf(['error', 'warning', 'info', 'success']).isRequired,
    title: PropTypes.string,
    message: PropTypes.string.isRequired,
    actions: PropTypes.arrayOf(
      PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.shape({
          label: PropTypes.string.isRequired,
          action: PropTypes.string.isRequired,
          description: PropTypes.string,
          url: PropTypes.string,
          dismissAfterAction: PropTypes.bool
        })
      ])
    ),
    dismissible: PropTypes.bool,
    autoHide: PropTypes.oneOfType([PropTypes.bool, PropTypes.number]),
    confidence: PropTypes.oneOf(['low', 'medium', 'high'])
  }),
  onDismiss: PropTypes.func,
  onAction: PropTypes.func,
  className: PropTypes.string,
  position: PropTypes.oneOf(['top', 'bottom', 'inline'])
};

export default UserNotification;
