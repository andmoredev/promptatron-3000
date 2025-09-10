/**
 * Theme utility functions with null-checking for safe color access
 */

// Default fallback colors
const DEFAULT_COLORS = {
  primary: '#5c8c5a',
  secondary: '#9ecc8c',
  tertiary: '#e6f3d5',
  gray: '#6b7280',
  white: '#ffffff',
  black: '#000000'
}

/**
 * Safely get a theme color with null-checking
 * @param {string} colorName - The color name (primary, secondary, tertiary, etc.)
 * @param {string|number} shade - The shade (50, 100, 200, etc.) or 'DEFAULT'
 * @param {object} theme - Optional theme object to check
 * @returns {string} The color value or fallback
 */
export const getThemeColor = (colorName, shade = 'DEFAULT', theme = null) => {
  try {
    // If theme is provided, try to get color from theme
    if (theme && theme.colors && theme.colors[colorName]) {
      if (shade === 'DEFAULT' || shade === 500) {
        return theme.colors[colorName].DEFAULT || theme.colors[colorName][500] || DEFAULT_COLORS[colorName]
      }
      return theme.colors[colorName][shade] || DEFAULT_COLORS[colorName]
    }

    // Fallback to default colors
    return DEFAULT_COLORS[colorName] || DEFAULT_COLORS.gray
  } catch (error) {
    console.warn(`Failed to get theme color ${colorName}-${shade}:`, error)
    return DEFAULT_COLORS[colorName] || DEFAULT_COLORS.gray
  }
}

/**
 * Generate CSS custom properties for theme colors with null-checking
 * @param {object} theme - Theme configuration object
 * @returns {object} CSS custom properties object
 */
export const generateThemeVariables = (theme = null) => {
  const variables = {}

  try {
    const colorNames = ['primary', 'secondary', 'tertiary']
    const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]

    colorNames.forEach(colorName => {
      shades.forEach(shade => {
        const colorValue = getThemeColor(colorName, shade, theme)
        variables[`--color-${colorName}-${shade}`] = colorValue
      })
    })
  } catch (error) {
    console.warn('Failed to generate theme variables:', error)
  }

  return variables
}

/**
 * Validate theme configuration
 * @param {object} theme - Theme configuration to validate
 * @returns {object} Validation result with isValid flag and errors array
 */
export const validateTheme = (theme) => {
  const errors = []
  let isValid = true

  try {
    if (!theme) {
      errors.push('Theme configuration is null or undefined')
      isValid = false
      return { isValid, errors }
    }

    if (!theme.colors) {
      errors.push('Theme colors configuration is missing')
      isValid = false
    }

    const requiredColors = ['primary', 'secondary', 'tertiary']
    requiredColors.forEach(colorName => {
      if (!theme.colors || !theme.colors[colorName]) {
        errors.push(`Missing ${colorName} color configuration`)
        isValid = false
      }
    })

  } catch (error) {
    errors.push(`Theme validation error: ${error.message}`)
    isValid = false
  }

  return { isValid, errors }
}

/**
 * Get safe Tailwind class name with fallback
 * @param {string} baseClass - Base Tailwind class (e.g., 'bg-primary')
 * @param {string|number} shade - Color shade
 * @param {string} fallbackClass - Fallback class if color doesn't exist
 * @returns {string} Safe Tailwind class name
 */
export const getSafeColorClass = (baseClass, shade = 600, fallbackClass = 'bg-gray-600') => {
  try {
    if (!baseClass) return fallbackClass

    const className = shade ? `${baseClass}-${shade}` : baseClass
    return className || fallbackClass
  } catch (error) {
    console.warn(`Failed to generate safe color class for ${baseClass}-${shade}:`, error)
    return fallbackClass
  }
}

export default {
  getThemeColor,
  generateThemeVariables,
  validateTheme,
  getSafeColorClass
}