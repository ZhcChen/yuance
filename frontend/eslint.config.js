import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';

const commonRules = {
  'no-console': ['error', { allow: ['warn', 'error'] }],
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
  'react/prop-types': 'off',
  'react/react-in-jsx-scope': 'off',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'packages/*/dist/**',
    ],
  },
  {
    settings: {
      react: {
        version: '19.1.1',
      },
    },
  },
  js.configs.recommended,
  reactPlugin.configs.flat.recommended,
  {
    files: [
      'packages/**/*.{js,jsx}',
      'src/**/*.{js,jsx}',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        URLSearchParams: 'readonly',
      },
    },
    rules: commonRules,
  },
  {
    files: [
      'packages/**/*.mjs',
      'scripts/**/*.mjs',
      'test/**/*.mjs',
      '*.mjs',
      '*.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.node,
      },
    },
    rules: commonRules,
  },
];
