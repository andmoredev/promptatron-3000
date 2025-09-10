import React, { createContext, useContext, useEffect, useState } from 'react'
import { validateTheme, generateThemeVariables } from '../utils/themeUtils'

const ThemeContext = createContext(null)

/**
 * Theme Provider component with null-checking and fallback handling
 */
export const ThemeProvider = ({ children, theme = null }) => {
  const [themeState, setThemeState] = useState({
    isValid: false,
    colors: null,
    errors: []
  })

  useEffect(() => {
    // Validate theme configuration
    const validation = validateTheme(theme)

    if (validation.isValid) {
      // Generate CSS custom properties
      const cssVariables = generateThemeVariables(theme)

      // Apply CSS variables to document root
      const root = document.documentElement
      Object.entries(cssVariables).forEach(([property, value]) => {
        if (value) {
          root.style.setProperty(property, value)
        }
      })

      setThemeState({
        isValid: true,
        colors: theme?.colors || null,
        errors: []
      })
    } else {
      console.warn('Theme validation failed:', validation.errors)
      setThemeState({
        isValid: false,
        colors: null,
        errors: validation.errors
      })
    }
  }, [theme])

  const contextValue = {
    ...themeState,
    theme
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Hook to safely access theme context
 */
export const useTheme = () => {
  const context = useContext(ThemeContext)

  // Return safe defaults if context is not available
  if (!context) {
    return {
      isValid: false,
      colors: null,
      errors: ['Theme context not available'],
      theme: null
    }
  }

  return context
}

/**
 * Higher-order component to wrap components with theme safety
 */
export const withTheme = (Component) => {
  return function ThemedComponent(props) {
    const theme = useTheme()
    return <Component {...props} theme={theme} />
  }
}

export default ThemeProvider