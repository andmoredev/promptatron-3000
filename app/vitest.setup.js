import '@testing-library/jest-dom'

// jsdom ships no `matchMedia`. The robot faces query `prefers-reduced-motion`,
// `prefers-contrast` and `forced-colors` before they render, so give them a
// stub that answers "no preference" to everything.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })
}
