import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import UserNotification from './UserNotification';
import { notificationManager } from '../utils/notificationManager';

/**
 * NotificationContainer component that displays and manages multiple notifications
 * Integrates with the notification manager to show system-wide notifications
 */
function NotificationContainer({
  position = 'top',
  maxVisible = 3,
  className = ''
}) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // Subscribe to notification manager updates
    const unsubscribe = notificationManager.addListener((updatedNotifications) => {
      // Limit visible notifications
      const visibleNotifications = updatedNotifications.slice(0, maxVisible);
      setNotifications(visibleNotifications);
    });

    // Get initial notifications
    const initialNotifications = notificationManager.getNotifications().slice(0, maxVisible);
    setNotifications(initialNotifications);

    return unsubscribe;
  }, [maxVisible]);

  const handleDismiss = (notificationId) => {
    notificationManager.removeNotification(notificationId);
  };

  const handleAction = (notification, action) => {
    // Handle different action types
    switch (action.action) {
      case 'refresh':
        window.location.reload();
        break;

      case 'clear_cache':
        // Clear browser cache and reload
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => {
              caches.delete(name);
            });
            window.location.reload();
          });
        } else {
          // Fallback: just reload
          window.location.reload();
        }
        break;

      case 'retry':
        // Emit custom event for retry actions
        window.dispatchEvent(new CustomEvent('notification-retry', {
          detail: { notification, action }
        }));
        break;

      case 'disable_costs':
        // Emit event to disable cost display
        window.dispatchEvent(new CustomEvent('disable-cost-display', {
          detail: { notification, action }
        }));
        break;

      case 'change_model':
        // Emit event to suggest model change
        window.dispatchEvent(new CustomEvent('suggest-model-change', {
          detail: { notification, action }
        }));
        break;

      case 'external_link':
        // Open external link
        if (action.url) {
          window.open(action.url, '_blank', 'noopener,noreferrer');
        }
        break;

      case 'optimize_memory':
        // Show memory optimization tips
        window.dispatchEvent(new CustomEvent('show-memory-tips', {
          detail: { notification, action }
        }));
        break;

      default:
        // Emit generic action event
        window.dispatchEvent(new CustomEvent('notification-action', {
          detail: { notification, action }
        }));
        break;
    }
  };

  if (notifications.length === 0) {
    return null;
  }

  // Calculate container positioning
  const getContainerClasses = () => {
    const baseClasses = "fixed z-50 pointer-events-none";

    switch (position) {
      case 'top':
        return `${baseClasses} top-4 left-0 right-0 flex flex-col items-center space-y-2`;
      case 'bottom':
        return `${baseClasses} bottom-4 left-0 right-0 flex flex-col items-center space-y-2`;
      case 'top-right':
        return `${baseClasses} top-4 right-4 flex flex-col items-end space-y-2`;
      case 'top-left':
        return `${baseClasses} top-4 left-4 flex flex-col items-start space-y-2`;
      case 'bottom-right':
        return `${baseClasses} bottom-4 right-4 flex flex-col items-end space-y-2`;
      case 'bottom-left':
        return `${baseClasses} bottom-4 left-4 flex flex-col items-start space-y-2`;
      default:
        return `${baseClasses} top-4 left-0 right-0 flex flex-col items-center space-y-2`;
    }
  };

  return (
    <div className={`${getContainerClasses()} ${className}`}>
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          className="pointer-events-auto w-full max-w-md mx-4"
          style={{
            animationDelay: `${index * 100}ms`,
            zIndex: 1000 - index // Ensure proper stacking
          }}
        >
          <UserNotification
            notification={notification}
            onDismiss={() => handleDismiss(notification.id)}
            onAction={(action) => handleAction(notification, action)}
            position="inline"
          />
        </div>
      ))}

      {/* Show notification count if there are more */}
      {notificationManager.getNotifications().length > maxVisible && (
        <div className="pointer-events-auto">
          <button
            onClick={() => {
              // Show all notifications or open a notification panel
              window.dispatchEvent(new CustomEvent('show-all-notifications'));
            }}
            className="text-xs text-gray-500 hover:text-gray-700 bg-white bg-opacity-90 px-2 py-1 rounded-full shadow-sm border border-gray-200 transition-colors duration-200"
          >
            +{notificationManager.getNotifications().length - maxVisible} more
          </button>
        </div>
      )}
    </div>
  );
}

NotificationContainer.propTypes = {
  position: PropTypes.oneOf(['top', 'bottom', 'top-right', 'top-left', 'bottom-right', 'bottom-left']),
  maxVisible: PropTypes.number,
  className: PropTypes.string
};

export default NotificationContainer;
