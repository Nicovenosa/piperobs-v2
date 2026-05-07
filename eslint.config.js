import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import obsidian from 'eslint-plugin-obsidian';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'obsidian': obsidian,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'obsidian/no-inner-html': 'error',
      'obsidian/no-console': ['error', { allow: ['warn', 'error', 'debug'] }],
    },
  },
];
