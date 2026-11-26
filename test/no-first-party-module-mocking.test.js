import { fileURLToPath } from 'node:url';
import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';
import { noFirstPartyModuleMockingRule } from '../plugin/rules/no-first-party-module-mocking.js';

RuleTester.describe = describe;
RuleTester.it = it;

const cwd = fileURLToPath(new URL('fixture-project', import.meta.url));
const tester = new RuleTester({ cwd, languageOptions: { parserOptions: { lang: 'ts' } } });
const error = (specifier) => ({ data: { specifier }, messageId: 'firstPartyModuleMock' });
const nested = `${cwd}/src/deep/nested/user.test.ts`;
const shallow = `${cwd}/src/user.test.ts`;

tester.run('cloudflare/no-first-party-module-mocking', noFirstPartyModuleMockingRule, {
  invalid: [
    { code: "vi.mock('./user-store');", errors: [error('./user-store')] },
    { code: "vi.doMock('../user-store.ts');", errors: [error('../user-store.ts')] },
    { code: "vi['mock']('/src/user-store');", errors: [error('/src/user-store')] },
    { code: 'vi.mock(`./user-store`);', errors: [error('./user-store')] },
    { code: "vi.mock(import('./user-store'), () => ({}));", errors: [error('./user-store')] },
    { code: "vi.mock('#db/client');", errors: [error('#db/client')] },
    { code: "vi.mock('@/services/user-store');", errors: [error('@/services/user-store')] },
    { code: "vi.mock('~/services/user-store');", errors: [error('~/services/user-store')] },
    {
      code: "import { vi } from 'vitest'; vi.mock('./user-store', { spy: true });",
      errors: [error('./user-store')],
    },
    {
      code: "import { vi } from 'vite-plus/test'; vi.mock('./user-store');",
      errors: [error('./user-store')],
    },
    {
      code: "import { vi as testApi } from 'vite-plus/test'; testApi.doMock('./user-store');",
      errors: [error('./user-store')],
    },
    {
      code: "import * as vitest from 'vitest'; vitest.vi.mock('./user-store');",
      errors: [error('./user-store')],
    },
    {
      code: "vi.mock('@acme/billing'); vi.mock('@acme/billing/client');",
      errors: [error('@acme/billing'), error('@acme/billing/client')],
      options: [{ deny: ['@acme/billing'] }],
    },
    {
      code: "vi.mock('@acme/billing'); vi.mock('src/user-store');",
      errors: [error('@acme/billing'), error('src/user-store')],
      options: [{ deny: ['@acme/', 'src'] }],
    },
    {
      code: "vi.mock('axios');",
      errors: [error('axios')],
      options: [{ deny: ['axios'] }],
    },
    {
      code: "vi.mock('@acme/billing'); vi.mock('@acme/test-utils');",
      errors: [error('@acme/billing')],
      options: [{ allow: ['@acme/test-utils'], deny: ['@acme/'] }],
    },
    {
      code: "vi.mock('./generated-client'); vi.mock('./user-store');",
      errors: [error('./generated-client'), error('./user-store')],
      filename: shallow,
      options: [{ allow: ['src/generated/'] }],
    },
    {
      code: "vi.mock('./generated/client');",
      errors: [error('./generated/client')],
      filename: nested,
      options: [{ allow: ['src/generated/'] }],
    },
    {
      code: "vi.mock('../env.ts');",
      errors: [error('../env.ts')],
      filename: nested,
      options: [{ allow: ['src/env'] }],
    },
    {
      code: "import { vi } from './test-utils'; vi.mock('./user-store');",
      errors: [error('./user-store')],
    },
    {
      code: "import { vi } from '@acme/test-utils'; vi.mock('./user-store');",
      errors: [error('./user-store')],
      options: [{ deny: ['@acme/'] }],
    },
    {
      code: "import * as helpers from '#test/helpers'; helpers.vi.mock('./user-store');",
      errors: [error('./user-store')],
    },
    {
      code: "import { vi } from 'vitest'; const testApi = vi; testApi.mock('./user-store');",
      errors: [error('./user-store')],
    },
    {
      code: "import { vi } from 'vitest'; const { mock } = vi; mock('./user-store');",
      errors: [error('./user-store')],
    },
    {
      code: "const { doMock: register } = vi; register('./user-store');",
      errors: [error('./user-store')],
    },
    {
      code: "const mock = vi.mock; mock('./user-store');",
      errors: [error('./user-store')],
    },
    {
      code: "import * as vitest from 'vitest'; const { vi } = vitest; vi.mock('./user-store');",
      errors: [error('./user-store')],
    },
    { code: "globalThis.vi.mock('./user-store');", errors: [error('./user-store')] },
    { code: "(vi as any).mock('./user-store');", errors: [error('./user-store')] },
    { code: "vi!.doMock('./user-store' as string);", errors: [error('./user-store')] },
    {
      code: "(vi satisfies object).mock(import.meta.resolve('./user-store'));",
      errors: [error("import.meta.resolve('./user-store')")],
    },
    {
      code: "vi.mock('./generated/client'); vi.mock('../user-store');",
      errors: [error('../user-store')],
      filename: nested,
      options: [{ allow: ['**/generated/'] }],
    },
    {
      code: "vi.mock('../../generated/client');",
      errors: [error('../../generated/client')],
      filename: nested,
      options: [{ allow: ['**/deep/generated/'] }],
    },
    {
      code: "declare const vi: { mock(path: string): void }; vi.mock('./user-store');",
      errors: [error('./user-store')],
    },
    { code: 'vi.mock(`./${name}`);', errors: [error('`./${name}`')] },
    {
      code: "vi.mock('file:///repo/src/user-store.ts');",
      errors: [error('file:///repo/src/user-store.ts')],
    },
    {
      code: String.raw`vi.mock('C:\\repo\\src\\user-store');`,
      errors: [error(String.raw`C:\repo\src\user-store`)],
    },
    {
      code: "import path from 'node:path'; vi.mock(path.resolve(__dirname, './user-store'));",
      errors: [error("path.resolve(__dirname, './user-store')")],
    },
    {
      code: "import { join } from 'path'; vi.mock(join(import.meta.dirname, '../user-store'));",
      errors: [error("join(import.meta.dirname, '../user-store')")],
    },
    {
      code: "vi.mock(new URL('./user-store', import.meta.url).pathname);",
      errors: [error("new URL('./user-store', import.meta.url).pathname")],
    },
    {
      code: "import { fileURLToPath } from 'node:url'; vi.mock(fileURLToPath(new URL('./user-store', import.meta.url).href));",
      errors: [error("fileURLToPath(new URL('./user-store', import.meta.url).href)")],
    },
  ],
  valid: [
    "vi.mock('node:fs');",
    "vi.mock('axios', () => ({ default: { get: vi.fn() } }));",
    "vi.mock('@cloudflare/workers-types');",
    "vi.mock(import('nanoid'));",
    "vi.mock('@acme/billing');",
    'vi.mock(moduleName);',
    "mock('./user-store');",
    "vi.mock(import.meta.resolve('axios'));",
    "vi.mock(new URL('file://server/share/user-store', import.meta.url).pathname);",
    "vi.mock(new URL('http://[', import.meta.url).pathname);",
    "vi.mock(fileURLToPath('file://server/share/user-store'));",
    {
      code: "vi.mock('./generated/client'); vi.mock('../../generated/client');",
      filename: nested,
      options: [{ allow: ['**/generated/'] }],
    },
    {
      code: "vi.mock('@acme/generated');",
      options: [{ deny: ['**/generated'] }],
    },
    'vi.mock(`${base}/user-store`);',
    "vi.mock('/node_modules/axios');",
    "import path from 'node:path'; vi.mock(path.resolve(__dirname, '../node_modules/axios'));",
    "vi.mock(path.resolve(__dirname, './user-store'));",
    "vi.mock(new URL('https://example.com/user-store').pathname);",
    "const { mock } = helpers; mock('./user-store');",
    "vi.unmock('./user-store');",
    "vi.importActual('./user-store');",
    "vi.spyOn(store, 'save');",
    "const vi = { mock() {} }; vi.mock('./user-store');",
    "function run(vi: { mock(path: string): void }) { vi.mock('./user-store'); }",
    "import { jest } from '@jest/globals'; jest.mock('./user-store');",
    "import { vi } from 'some-library'; vi.mock('./user-store');",
    {
      code: "vi.mock('@acme/billing-legacy');",
      options: [{ deny: ['@acme/billing'] }],
    },
    {
      code: "vi.mock('./generated/client'); vi.mock('#env');",
      filename: shallow,
      options: [{ allow: ['./src/generated/', '#env'] }],
    },
    {
      code: "vi.mock('../../generated/client'); vi.mock('/src/generated/client');",
      filename: nested,
      options: [{ allow: ['src/generated/'] }],
    },
    {
      code: "vi.mock('../../env.ts'); vi.mock('../../env');",
      filename: nested,
      options: [{ allow: ['src/env'] }],
    },
    {
      code: 'vi.mock(`../../generated/${name}`);',
      filename: nested,
      options: [{ allow: ['src/generated/'] }],
    },
    {
      code: "import path from 'node:path'; vi.mock(path.join(__dirname, '../../generated/client'));",
      filename: nested,
      options: [{ allow: ['src/generated/'] }],
    },
    {
      code: "vi.mock('@acme/test-utils/fixtures');",
      options: [{ allow: ['@acme/test-utils'], deny: ['@acme/'] }],
    },
  ],
});
