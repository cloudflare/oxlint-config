// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import nkzw from '@nkzw/oxlint-config';

const typeScriptFiles = ['**/*.{ts,tsx,mts,cts}'];
const typeScriptTests = [
  '**/*.{test,spec,integration,e2e}.{ts,tsx,mts,cts}',
  '**/__tests__/**/*.{ts,tsx,mts,cts}',
];

/** @satisfies {import('oxlint').OxlintConfig} */
const config = {
  ...nkzw,
  ignorePatterns: ['**/node_modules/**'],
  jsPlugins: [
    ...(nkzw.jsPlugins ?? []),
    { name: 'cloudflare', specifier: import.meta.resolve('./plugin/index.js') },
  ],
  overrides: [
    // nkzw exempts specific application entry points from no-console.
    ...(nkzw.overrides ?? []).filter(({ rules }) => rules?.['no-console'] !== 'off'),
    {
      files: typeScriptFiles,
      rules: {
        'no-throw-literal': 'off',
        'typescript/only-throw-error': 'error',
      },
    },
    {
      files: typeScriptTests,
      rules: {
        'typescript/no-explicit-any': 'off',
        'typescript/no-non-null-assertion': 'off',
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/only-throw-error': 'off',
        'typescript/unbound-method': 'off',
      },
    },
    {
      files: ['**/*.{js,jsx,mjs,cjs}'],
      rules: {
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-return': 'off',
      },
    },
  ],
  rules: {
    ...nkzw.rules,

    eqeqeq: 'error',
    'import/no-self-import': 'error',
    'no-eval': 'error',
    'typescript/unbound-method': 'error',

    // Keep types out of runtime imports.
    'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
    'typescript/consistent-type-imports': 'error',

    // Require narrowing before values cross a typed boundary.
    'typescript/no-confusing-non-null-assertion': 'error',
    'typescript/no-non-null-assertion': 'error',
    'typescript/no-unnecessary-type-assertion': 'error',
    'typescript/no-unsafe-argument': 'error',
    'typescript/no-unsafe-assignment': 'error',
    'typescript/no-unsafe-call': 'error',
    'typescript/no-unsafe-member-access': 'error',
    'typescript/no-unsafe-return': 'error',
    'typescript/no-unsafe-type-assertion': 'error',
    'typescript/switch-exhaustiveness-check': [
      'error',
      {
        allowDefaultCaseForExhaustiveSwitch: true,
        considerDefaultExhaustiveForUnions: true,
      },
    ],

    // Catch errors that can otherwise be swallowed or left unhandled.
    '@typescript-eslint/no-misused-promises': 'error',
    'no-promise-executor-return': 'error',
    'typescript/no-floating-promises': 'error',
    'typescript/use-unknown-in-catch-callback-variable': 'error',
    'unicorn/prefer-set-has': 'error',

    // Replace first-party dependencies through real seams, not module mocks.
    'cloudflare/no-first-party-module-mocking': 'error',
  },
};

export default config;
