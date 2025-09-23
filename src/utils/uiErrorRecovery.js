/**
 * UI Error Recovery Utilities
 * Handles text wrapping and display issues with fallback strategies
 */

export class UIErrorRecovery {
  constructor() {
    this.recoveryStrategies = new Map([
      ['wrapping', {
        errorType: 'wrapping',
        fallbackCSS: 'text-content fallback',
        userMessage: 'Text wrapping issue detected. Applied fallback formatting.'
      }],
      ['gradient', {
        errorType: 'gradient',
        fallbackCSS: 'gradient-container fallback',
        userMessage: 'Display issue detected. Applied fallback styling.'
      }],
      ['display', {
        errorType: 'display',
        fallbackCSS: 'text-content fallback expanded',
        userMessage: 'Display formatting issue detected. Applied recovery styling.'
      }]
    ])
  }

  /**
   * Handle UI error with appropriate recovery strategy
   * @param {Object} error - Error details
   * @param {string} error.errorType - Type of error ('wrapping', 'gradient', 'display')
   * @param {string} error.component - Component name where error occurred
   * @param {string} error.errorMessage - Error message
   * @returns {Promise<boolean>} - Success of recovery attempt
   */
  async handleUIError(error) {
    const strategy = this.recoveryStrategies.get(error.errorType)
    if (!strategy) return false

    switch (error.errorType) {
      case 'wrapping':
        return this.recoverWrappingIssue(error, strategy)
      case 'gradient':
        return this.recoverGradientIssue(error, strategy)
      case 'display':
        return this.recoverDisplayIssue(error, strategy)
      default:
        return false
    }
  }

  /**
   * Recover from text wrapping issues
   * @param {Object} error - Error details
   * @param {Object} strategy - Recovery strategy
   * @returns {boolean} - Success of recovery
   */
  recoverWrappingIssue(error, strategy) {
    try {
      // Find elements with text wrapping issues
      const elements = document.querySelectorAll(`.${error.component}`)
      let recovered = false

      elements.forEach(element => {
        // Check if text is overflowing horizontally
        if (element.scrollWidth > element.clientWidth) {
          // Apply fallback text wrapping classes
          element.classList.add('text-content', 'fallback')

          // Ensure proper word breaking
          element.style.wordWrap = 'break-word'
          element.style.wordBreak = 'break-word'
          element.style.overflowWrap = 'anywhere'
          element.style.whiteSpace = 'pre-wrap'
          element.style.maxWidth = '100%'
          element.style.overflowX = 'hidden'

          recovered = true
        }
      })

      if (recovered) {
        console.log(`Text wrapping recovery applied to ${error.component}`)
      }

      return recovered
    } catch (e) {
      console.error('Failed to recover from wrapping issue:', e)
      return false
    }
  }

  /**
   * Recover from gradient display issues
   * @param {Object} error - Error details
   * @param {Object} strategy - Recovery strategy
   * @returns {boolean} - Success of recovery
   */
  recoverGradientIssue(error, strategy) {
    try {
      const elements = document.querySelectorAll(`.${error.component}`)
      let recovered = false

      elements.forEach(element => {
        // Apply fallback gradient classes
        element.classList.add('gradient-container', 'fallback')

        // Ensure proper containment
        element.style.backgroundAttachment = 'local'
        element.style.contain = 'layout style paint'
        element.style.overflow = 'hidden'

        recovered = true
      })

      if (recovered) {
        console.log(`Gradient recovery applied to ${error.component}`)
      }

      return recovered
    } catch (e) {
      console.error('Failed to recover from gradient issue:', e)
      return false
    }
  }

  /**
   * Recover from general display issues
   * @param {Object} error - Error details
   * @param {Object} strategy - Recovery strategy
   * @returns {boolean} - Success of recovery
   */
  recoverDisplayIssue(error, strategy) {
    try {
      const elements = document.querySelectorAll(`.${error.component}`)
      let recovered = false

      elements.forEach(element => {
        // Apply comprehensive fallback styling
        element.classList.add('text-content', 'fallback', 'expanded')

        // Ensure element is properly contained and visible
        element.style.display = 'block'
        element.style.width = '100%'
        element.style.maxWidth = '100%'
        element.style.overflow = 'visible'
        element.style.whiteSpace = 'pre-wrap'
        element.style.wordWrap = 'break-word'
        element.style.boxSizing = 'border-box'

        recovered = true
      })

      if (recovered) {
        console.log(`Display recovery applied to ${error.component}`)
      }

      return recovered
    } catch (e) {
      console.error('Failed to recover from display issue:', e)
      return false
    }
  }

  /**
   * Detect text overflow issues in an element
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} - Whether overflow is detected
   */
  detectTextOverflow(element) {
    if (!element) return false

    return element.scrollWidth > element.clientWidth ||
           element.scrollHeight > element.clientHeight
  }

  /**
   * Apply preventive text wrapping to an element
   * @param {HTMLElement} element - Element to enhance
   * @param {string} type - Type of content ('system-prompt', 'user-prompt', 'general')
   */
  applyPreventiveWrapping(element, type = 'general') {
    if (!element) return

    const classMap = {
      'system-prompt': 'system-prompt-display text-safe',
      'user-prompt': 'test-results-prompt text-safe',
      'general': 'text-content text-safe'
    }

    const classes = classMap[type] || classMap.general
    element.className = `${element.className} ${classes}`.trim()

    // Apply inline styles as backup
    element.style.wordWrap = 'break-word'
    element.style.wordBreak = 'break-word'
    element.style.overflowWrap = 'anywhere'
    element.style.maxWidth = '100%'
    element.style.overflowX = 'hidden'
  }

  /**
   * Monitor elements for text overflow and apply recovery if needed
   * @param {string} selector - CSS selector for elements to monitor
   * @param {string} contentType - Type of content being monitored
   */
  monitorTextOverflow(selector, contentType = 'general') {
    const elements = document.querySelectorAll(selector)

    elements.forEach(element => {
      // Check immediately
      if (this.detectTextOverflow(element)) {
        this.applyPreventiveWrapping(element, contentType)
      }

      // Set up observer for dynamic content changes
      if (window.ResizeObserver) {
        const observer = new ResizeObserver(() => {
          if (this.detectTextOverflow(element)) {
            this.applyPreventiveWrapping(element, contentType)
          }
        })

        observer.observe(element)
      }
    })
  }
}

// Create singleton instance
export const uiErrorRecovery = new UIErrorRecovery()

// Auto-monitor common text elements when DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Monitor system prompt displays
    uiErrorRecovery.monitorTextOverflow('.system-prompt-display', 'system-prompt')

    // Monitor test results prompts
    uiErrorRecovery.monitorTextOverflow('.test-results-prompt', 'user-prompt')

    // Monitor prompt editor textareas
    uiErrorRecovery.monitorTextOverflow('.prompt-editor-textarea', 'general')
  })
}
