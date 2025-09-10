// Test setup file for vitest
import { vi } from 'vitest'
import '@testing-library/jest-dom'

// Mock environment variables
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_AWS_ACCESS_KEY_ID: 'test-access-key',
    VITE_AWS_SECRET_ACCESS_KEY: 'test-secret-key',
    VITE_AWS_REGION: 'us-east-1'
  },
  writable: true
})

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}