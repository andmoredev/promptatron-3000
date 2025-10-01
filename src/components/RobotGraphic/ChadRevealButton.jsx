/**
 * @fileoverview Chad reveal button component for triggering Chad personality reveal
 */

import { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import LoadingSpinner from '../LoadingSpinner';

/**
 * Chad reveal button component
 * Displays a button to reveal Chad personality with loading states and animations
 *
 * @param {Object} props - Component props
 * @param {Function} props.onReveal - Callback function when reveal is triggered
 * @param {boolean} props.isRevealed - Whether Chad is already revealed
 * @param {boolean} props.isRevealing - Whether reveal animation is in progress
 * @param {boolean} [props.disabled=false] - Whether the button is disabled
 * @param {string} [props.className] - Additional CSS classes
 * @param {Object} [props.style] - Inline styles
 * @returns {JSX.Element|null} Chad reveal button or null if already revealed
 */
const ChadRevealButton = ({
  onReveal,
  isRevealed,
  isRevealing,
  disabled = false,
  className = '',
  style = {},
  ...props
}) => {
  const [isClicked, setIsClicked] = useState(false);

  /**
   * Handle button click with animation and callback
   */
  const handleClick = useCallback(async () => {
    console.log('Chad reveal button clicked!', { disabled, isRevealing, isRevealed, isClicked });

    if (disabled || isRevealing || isRevealed || isClicked) {
      console.log('Chad reveal button click blocked:', { disabled, isRevealing, isRevealed, isClicked });
      return;
    }

    console.log('Setting clicked state and calling reveal function...');
    setIsClicked(true);

    try {
      // Call the reveal callback
      if (typeof onReveal === 'function') {
        console.log('Calling onReveal function...');
        const result = await onReveal();
        console.log('onReveal result:', result);
      } else {
        console.error('onReveal is not a function:', typeof onReveal, onReveal);
      }
    } catch (error) {
      console.error('Error during Chad reveal:', error);
      // Reset clicked state on error so user can try again
      setIsClicked(false);
    }
  }, [onReveal, disabled, isRevealing, isRevealed, isClicked]);

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  // Don't render if Chad is already revealed
  if (isRevealed) {
    return null;
  }

  // Determine button state and styling
  const isButtonDisabled = disabled || isRevealing || isClicked;
  const showLoading = isRevealing || isClicked;

  // Button text based on state
  const getButtonText = () => {
    if (isRevealing) {
      return 'Revealing...';
    }
    if (isClicked) {
      return 'Revealing...';
    }
    return 'Reveal Agent';
  };

  // Combine classes for button styling
  const buttonClasses = [
    // Base button styles matching existing patterns
    'px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',

    // Primary button styling (matching btn-primary from CSS)
    'bg-primary-600 hover:bg-primary-700 text-white',

    // Focus and accessibility styles
    'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',

    // Disabled state
    isButtonDisabled && 'opacity-50 cursor-not-allowed',

    // Animation states
    showLoading && 'transform scale-95',

    // Fade out animation when revealing
    (isRevealing || isClicked) && 'animate-fade-out',

    // Custom classes
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={isButtonDisabled}
      className={buttonClasses}
      style={style}
      aria-label="Reveal Chad personality for the robot"
      aria-describedby="chad-reveal-description"
      data-testid="chad-reveal-button"
      {...props}
    >
      <div className="flex items-center space-x-2">
        {showLoading && (
          <LoadingSpinner
            size="sm"
            color="white"
            inline
            aria-hidden="true"
          />
        )}
        <span>{getButtonText()}</span>
      </div>

      {/* Screen reader description */}
      <span id="chad-reveal-description" className="sr-only">
        Click to reveal Chad, the robot's personality. This will transform the robot's appearance and add a floating companion.
      </span>
    </button>
  );
};

ChadRevealButton.propTypes = {
  onReveal: PropTypes.func.isRequired,
  isRevealed: PropTypes.bool.isRequired,
  isRevealing: PropTypes.bool.isRequired,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  style: PropTypes.object
};

ChadRevealButton.defaultProps = {
  disabled: false,
  className: '',
  style: {}
};

export default ChadRevealButton;