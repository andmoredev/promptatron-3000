/**
 * Theme utility functions with null-checking for safe color access
 */

/** A theme's color name -> shade -> CSS color value map. */
export type ThemeColorMap = Record<string, Record<string | number, string> | undefined>

/** Shape of a theme configuration object. */
export interface ThemeConfig {
  colors?: ThemeColorMap | null
}

export interface ThemeValidationResult {
  isValid: boolean
  errors: string[]
}

// Default fallback colors
const DEFAULT_COLORS: Record<string, string> = {
  primary: '#5c8c5a',
  secondary: '#9ecc8c',
  tertiary: '#e6f3d5',
  gray: '#6b7280',
  white: '#ffffff',
  black: '#000000'
}

/**
 * Safely get a theme color with null-checking
 * @param colorName - The color name (primary, secondary, tertiary, etc.)
 * @param shade - The shade (50, 100, 200, etc.) or 'DEFAULT'
 * @param theme - Optional theme object to check
 * @returns The color value or fallback
 */
export const getThemeColor = (
  colorName: string,
  shade: string | number = 'DEFAULT',
  theme: ThemeConfig | null = null
): string => {
  try {
    // If theme is provided, try to get color from theme
    const themeColor = theme?.colors?.[colorName]
    if (themeColor) {
      if (shade === 'DEFAULT' || shade === 500) {
        return themeColor.DEFAULT || themeColor[500] || DEFAULT_COLORS[colorName]
      }
      return themeColor[shade] || DEFAULT_COLORS[colorName]
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
 * @param theme - Theme configuration object
 * @returns CSS custom properties object
 */
export const generateThemeVariables = (theme: ThemeConfig | null = null): Record<string, string> => {
  const variables: Record<string, string> = {}

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
 * @param theme - Theme configuration to validate
 * @returns Validation result with isValid flag and errors array
 */
export const validateTheme = (theme: ThemeConfig | null | undefined): ThemeValidationResult => {
  const errors: string[] = []
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
    errors.push(`Theme validation error: ${error instanceof Error ? error.message : String(error)}`)
    isValid = false
  }

  return { isValid, errors }
}

/**
 * Get safe Tailwind class name with fallback
 * @param baseClass - Base Tailwind class (e.g., 'bg-primary')
 * @param shade - Color shade
 * @param fallbackClass - Fallback class if color doesn't exist
 * @returns Safe Tailwind class name
 */
export const getSafeColorClass = (
  baseClass: string,
  shade: string | number = 600,
  fallbackClass = 'bg-gray-600'
): string => {
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
