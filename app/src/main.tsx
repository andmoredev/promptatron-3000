import React from 'react'
import ReactDOM from 'react-dom/client'
import AppShell from './AppShell'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import ThemeProvider from './components/ThemeProvider.jsx'
import './index.css'

/**
 * The green nature palette, published as CSS custom properties by
 * `ThemeProvider` and read by the robot faces via `themeUtils`.
 * Kept in step with `tailwind.config.js`.
 */
const themeConfig = {
  colors: {
    primary: { 50: '#f0f9f0', 100: '#e6f3d5', 500: '#5c8c5a', 600: '#5c8c5a', 700: '#4a7348' },
    secondary: {
      100: '#e6f3d5',
      200: '#d4ecc8',
      300: '#b8d8b4',
      500: '#9ecc8c',
      700: '#739965',
      800: '#5e7d53'
    },
    tertiary: { 50: '#e6f3d5', 100: '#e6f3d5', 500: '#e6f3d5' }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider theme={themeConfig}>
        <AppShell />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
