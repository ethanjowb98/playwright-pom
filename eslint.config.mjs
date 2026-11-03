// ESLint flat config: type-checked TypeScript, Playwright best practices, import hygiene, Prettier-compatible.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import { importX } from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'test-results/',
      'playwright-report/',
      'blob-report/',
      'allure-results/',
      'allure-report/',
      'templates/',
      '.claude/',
      '**/*.cjs',
      '**/*.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // `||` on strings is intentional: empty env values should fall back to defaults.
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],
      'import-x/no-cycle': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
          pathGroups: [
            { pattern: '@{config,api,pages,data,fixtures,utils}{,/**}', group: 'internal' },
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-networkidle': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-conditional-expect': 'error',
      'playwright/no-skipped-test': ['warn', { allowConditional: true }],
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/valid-title': 'error',
      // Specs talk to page objects and API clients only: no raw locators or HTTP calls.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='page'][callee.property.name=/^(locator|getBy\\w+|\\$|\\$\\$)$/]",
          message: 'Raw locators belong in a page object or component (src/pages).',
        },
        {
          selector:
            "CallExpression[callee.object.name='request'][callee.property.name=/^(get|post|put|patch|delete|fetch)$/]",
          message: 'HTTP calls belong in an API client (src/api).',
        },
      ],
    },
  },
  {
    // Auth setup and the agent seed are allowed to talk to the app directly.
    files: ['tests/setup/**/*.ts', 'tests/seed.spec.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/pages/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='page'][callee.property.name='waitForTimeout']",
          message: 'No hard waits. Use web-first waits (expect / locator.waitFor).',
        },
      ],
    },
  },
  prettier,
);
