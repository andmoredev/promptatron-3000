import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * UI Error Notification Component
 * Displays user-friendly error messages and recovery options
 */
const UIErrorNotification = ({ onDismiss }) => {
  const [notifications, setNotifications] = useState([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Listen for UI notifications
    const handleNotification = (event) => {
      const notification = event.detail;
      setNotifications(prev => [...prev, notification]);
      setIsVisible(true);
    };

    // Listen for notification removal
    const handleNotificationRemove = (event) => {
      const { id } = event.detail;
      setNotifications(prev => prev.filter(n => n.id !== id));
    };

    window.addEventListener('ui-notification', handleNotification);
    window.addEventListener('ui-notification-remove', handleNotificationRemove);

    return () => {
      window.removeEventListener('ui-notification', handleNotification);
      window.removeEventListener('ui-notification-remove', handleNotificationRemove);
    };
  }, []);

  useEffect(() => {
    if (notifications.length === 0) {
      setIsVisible(false);
    }
  }, [notifications]);

  const handleDismiss = (notificationId) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    if (onDismiss) {
      onDismiss(notificationId);
    }
  };

  const handleAction = (action, notificationId) => {
    if (action.action && typeof action.action === 'function') {
      action.action();
    }
    handleDismiss(notificationId);
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'success':
        return (
          <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      case 'error':
        return (
          <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getNotificationStyles = (type) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  if (!isVisible || notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`rounded-lg border p-4 shadow-lg animate-slide-in ${getNotificationStyles(notification.type)}`}
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              {getNotificationIcon(notification.type)}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {notification.message}
              </p>

              {notification.actions && notification.actions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {notification.actions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => handleAction(action, notification.id)}
                      className={`text-xs font-medium px-3 py-1 rounded transition-colors duration-200 ${
                        notification.type === 'error'
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : notification.type === 'warning'
                          ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-shrink-0">
              <button
                onClick={() => handleDismiss(notification.id)}
                className={`inline-flex rounded-md p-1.5 transition-colors duration-200 ${
                  notification.type === 'error'
                    ? 'text-red-400 hover:text-red-600 hover:bg-red-100'
                    : notification.type === 'warning'
                    ? 'text-yellow-400 hover:text-yellow-600 hover:bg-yellow-100'
                    : 'text-green-400 hover:text-green-600 hover:bg-green-100'
                }`}
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

UIErrorNotification.propTypes = {
  onDismiss: PropTypes.func
};

export default UIErrorNotification;
