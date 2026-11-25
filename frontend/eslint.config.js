import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
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
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...commonRules,
      // 体检 P2：Hooks 调用规则必须遵守；依赖数组问题先以警告呈现，逐步清理。
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
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
