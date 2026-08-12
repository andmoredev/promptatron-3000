import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  {
    // Global ignores
    ignores: ['dist/**', 'node_modules/**', 'coverage/**']
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: true
    }
  },
  js.configs.recommended,
  {
    // Root-level tool config files (eslint, tailwind, postcss) - plain Node
    // ESM, no JSX/React involved. Everything under src/ is TypeScript.
    files: ['*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021
      }
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      '@typescript-eslint': tseslint.plugin
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      // Full typescript-eslint recommended rule set (no type-aware rules for
      // speed). The reduce merges every config in the array — including the
      // eslint-recommended overrides that switch off core rules like no-undef
      // and no-unused-vars that misfire on TypeScript syntax.
      ...tseslint.configs.recommended.reduce((acc, c) => ({ ...acc, ...(c.rules ?? {}) }), {}),

      // React 17+ / React 19 JSX transform
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // Prop validation is TypeScript's job now
      'react/prop-types': 'off',
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'off',
      'react/no-unknown-property': 'warn',

      // Hooks correctness
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  }
]
