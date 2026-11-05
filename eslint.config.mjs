// ESLint flat config: type-checked TypeScript, Playwright best practices, import hygiene, Prettier-compatible.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import { importX } from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import prettier from 'eslint-config-prettier';

// Credentials must never reach a report: Playwright titles fill/type steps with the typed value
// (`Fill "<value>"`), and step titles are listed in the HTML and Allure reports. SecretGuard backs this
// up at run time.
// Whole names only, case-sensitive suffixes for camelCase / SCREAMING_CASE: `env.password`, `pwd`,
// `adminPassword`, `apiKey`, `process.env['QACLOUD_PASSWORD']`; not `passengerName` or `bypass`.
const CREDENTIAL =
  '/^(password|passwd|pwd|secret|apiKey|api_key|apikey)$|(Password|Passwd|Secret|ApiKey|_PASSWORD|_SECRET|_API_KEY)$/';
const NAMES_CREDENTIAL = `:matches(Identifier[name=${CREDENTIAL}], Literal[value=${CREDENTIAL}])`;
const TYPING = 'CallExpression[callee.property.name=/^(fill|pressSequentially|type|insertText)$/]';
const STEP =
  ":matches(CallExpression[callee.name='step'], CallExpression[callee.property.name='step'])";
const TYPED_MESSAGE =
  'Typing a credential puts it in the step title and the reports. Set it with locator.evaluate() (see LoginPage).';
const TITLE_MESSAGE = 'Step titles are shown in the reports: never build one from a credential.';
const NO_CREDENTIALS_IN_REPORTS = [
  // The argument itself (`fill(password)`) or anything inside it (`fill(String(env.password))`).
  { selector: `${TYPING} > Identifier.arguments[name=${CREDENTIAL}]`, message: TYPED_MESSAGE },
  { selector: `${TYPING} > *.arguments ${NAMES_CREDENTIAL}`, message: TYPED_MESSAGE },
  // The title is the first argument; the step body may use credentials freely.
  {
    selector: `${STEP} > Identifier.arguments:first-child[name=${CREDENTIAL}]`,
    message: TITLE_MESSAGE,
  },
  { selector: `${STEP} > *.arguments:first-child ${NAMES_CREDENTIAL}`, message: TITLE_MESSAGE },
];

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
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'allure-js-commons',
              importNames: ['step'],
              message:
                'Use the @step decorator from @utils/allure: one boxed step mechanism for every layer.',
            },
          ],
        },
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
    // POST /api/reset wipes the shared account: only the fixtures build MaintenanceApi, and they refuse
    // outside the `maintenance` project. Repeats the base rule's paths, since this setting replaces it.
    files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    ignores: ['src/fixtures/**', 'src/api/MaintenanceApi.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'allure-js-commons',
              importNames: ['step'],
              message:
                'Use the @step decorator from @utils/allure: one boxed step mechanism for every layer.',
            },
            {
              name: '@api/MaintenanceApi',
              message:
                'Use the maintenanceApi fixture: it resets the whole account and only works in the maintenance project.',
            },
          ],
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
        {
          selector: "CallExpression[callee.object.name='test'][callee.property.name='step']",
          message:
            'Steps come from the @step decorator on page objects, API clients and the seeder.',
        },
        {
          // The built-in request inherits the project's storageState (browser session cookie).
          selector: "NewExpression[callee.name=/Api$/] > Identifier.arguments[name='request']",
          message: 'API clients come from fixtures built on the cookie-less apiRequest.',
        },
        ...NO_CREDENTIALS_IN_REPORTS,
      ],
    },
  },
  {
    // Auth setup and the agent seed may talk to the app directly, but never leak a credential.
    files: ['tests/setup/**/*.ts', 'tests/seed.spec.ts'],
    rules: { 'no-restricted-syntax': ['error', ...NO_CREDENTIALS_IN_REPORTS] },
  },
  {
    // node:test tracks the promises describe() and it() return.
    files: ['scripts/**/*.test.ts'],
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
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
        ...NO_CREDENTIALS_IN_REPORTS,
      ],
    },
  },
  {
    files: ['src/fixtures/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // The built-in request inherits the project's storageState (browser session cookie).
          selector: "ObjectPattern > Property[key.name='request']",
          message:
            'Build API clients on the cookie-less apiRequest fixture, not the built-in request.',
        },
      ],
    },
  },
  {
    files: [
      'src/utils/**/*.ts',
      'src/data/**/*.ts',
      'src/api/**/*.ts',
      'src/config/**/*.ts',
      'src/reporters/**/*.ts',
      'playwright.config.ts',
    ],
    rules: { 'no-restricted-syntax': ['error', ...NO_CREDENTIALS_IN_REPORTS] },
  },
  prettier,
);
