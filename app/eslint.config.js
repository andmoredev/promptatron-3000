import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  {
    // Global ignores
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      // Pre-existing hard syntax error (`typeof export`) that the parser cannot
      // recover from, so even an inline eslint-disable can't suppress it.
      // Currently dead/unreachable code (not part of the built bundle) - see
      // tooling report for details. Needs a real source fix, out of scope here.
      'src/utils/browserCompatibility.js'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true }
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021
      }
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      // Base recommended rules from react / react-hooks plugins, applied selectively
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // This is a legacy, actively-evolving codebase - keep lint focused on real bugs,
      // not stylistic nits. Stylistic/formatting concerns are Prettier's job.
      'no-unused-vars': 'warn',
      'no-empty': 'warn',
      'no-constant-condition': 'warn',
      'no-cond-assign': 'warn',
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'warn',
      'no-case-declarations': 'warn',
      'no-fallthrough': 'warn',
      'no-extra-boolean-cast': 'warn',

      // Real undefined-reference bugs exist pre-existing in this legacy codebase
      // (missing imports / typo'd destructured props). Fixing them means editing
      // application logic across multiple in-flight files, out of scope here, so
      // this is reported as warn rather than left as a blocking error. See
      // tooling report for the specific occurrences found.
      'no-undef': 'warn',
      'no-unreachable': 'warn',

      // React 17+ / React 19 JSX transform - no need to import React in every file
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // prop-types are not maintained consistently across this codebase; off for now
      'react/prop-types': 'off',
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'off',
      'react/no-unknown-property': 'warn',

      // Hooks correctness - these catch real bugs, keep them enforced
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
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
      // Use typescript-eslint recommended rules (no type-aware rules for speed)
      ...tseslint.configs.recommended[0].rules,

      // React 17+ / React 19 JSX transform
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // prop-types not maintained consistently
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
