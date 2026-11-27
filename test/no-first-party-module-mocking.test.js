import { fileURLToPath } from 'node:url';
import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';
import { noFirstPartyModuleMockingRule } from '../plugin/rules/no-first-party-module-mocking.js';

RuleTester.describe = describe;
RuleTester.it = it;

const cwd = fileURLToPath(new URL('fixture-project', import.meta.url));
const tester = new RuleTester({ cwd, languageOptions: { parserOptions: { lang: 'ts' } } });
const error = (specifier) => ({ data: { specifier }, messageId: 'firstPartyModuleMock' });
const withVi = (code) => "import { vi } from 'vitest';\n" + code;
const nested = `${cwd}/src/deep/nested/user.test.ts`;
const shallow = `${cwd}/src/user.test.ts`;

tester.run('cloudflare/no-first-party-module-mocking', noFirstPartyModuleMockingRule, {
  invalid: [
    {
      code: "import * as v from 'vitest'; const ns = v; const { vitest: api } = ns; const { doMock } = api; const call = doMock; call('./owned');",
      errors: [error('./owned')],
    },
    {
      code: withVi("vi.mock('@/generated/../private');"),
      errors: [error('@/generated/../private')],
      options: [{ allow: ['**/generated/'] }],
    },
    {
      code: withVi(
        "import { fileURLToPath } from 'node:url'; vi.doMock(fileURLToPath(import.meta.resolve('./owned.js')));",
      ),
      errors: [error("fileURLToPath(import.meta.resolve('./owned.js'))")],
    },
    {
      code: "import { vitest as api } from 'vitest'; api.doMock('./owned');",
      errors: [error('./owned')],
    },
    {
      code: "import * as tools from 'vite-plus/test'; tools.vitest.mock('./owned');",
      errors: [error('./owned')],
    },
    {
      code: "vi.mock('./owned');",
      errors: [error('./owned')],
      options: [{ vitestGlobals: true }],
    },
    {
      code: withVi(
        "import { fileURLToPath } from 'node:url'; vi.doMock(fileURLToPath(new URL('./owned.js', import.meta.url)));",
      ),
      errors: [error("fileURLToPath(new URL('./owned.js', import.meta.url))")],
    },
    { code: withVi("vi.mock('./user-store');"), errors: [error('./user-store')] },
    { code: withVi("vi.doMock('../user-store.ts');"), errors: [error('../user-store.ts')] },
    { code: withVi("vi['mock']('/src/user-store');"), errors: [error('/src/user-store')] },
    { code: withVi('vi.mock(`./user-store`);'), errors: [error('./user-store')] },
    {
      code: withVi("vi.mock(import('./user-store'), () => ({}));"),
      errors: [error('./user-store')],
    },
    { code: withVi("vi.mock('#db/client');"), errors: [error('#db/client')] },
    { code: withVi("vi.mock('@/services/user-store');"), errors: [error('@/services/user-store')] },
    { code: withVi("vi.mock('~/services/user-store');"), errors: [error('~/services/user-store')] },
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
      code: withVi("vi.mock('@acme/billing'); vi.mock('@acme/billing/client');"),
      errors: [error('@acme/billing'), error('@acme/billing/client')],
      options: [{ deny: ['@acme/billing'] }],
    },
    {
      code: withVi("vi.mock('@acme/billing'); vi.mock('src/user-store');"),
      errors: [error('@acme/billing'), error('src/user-store')],
      options: [{ deny: ['@acme/', 'src'] }],
    },
    {
      code: withVi("vi.mock('axios');"),
      errors: [error('axios')],
      options: [{ deny: ['axios'] }],
    },
    {
      code: withVi("vi.mock('@acme/billing'); vi.mock('@acme/test-utils');"),
      errors: [error('@acme/billing')],
      options: [{ allow: ['@acme/test-utils'], deny: ['@acme/'] }],
    },
    {
      code: withVi("vi.mock('./generated-client'); vi.mock('./user-store');"),
      errors: [error('./generated-client'), error('./user-store')],
      filename: shallow,
      options: [{ allow: ['src/generated/'] }],
    },
    {
      code: withVi("vi.mock('./generated/client');"),
      errors: [error('./generated/client')],
      filename: nested,
      options: [{ allow: ['src/generated/'] }],
    },
    {
      code: withVi("vi.mock('../env.ts');"),
      errors: [error('../env.ts')],
      filename: nested,
      options: [{ allow: ['src/env'] }],
    },
    {
      code: "import { vi } from './test-utils'; vi.mock('./user-store');",
      errors: [error('./user-store')],
      filename: shallow,
      options: [{ vitestModules: ['./src/test-utils'] }],
    },
    {
      code: "import { vi } from '@acme/test-utils'; vi.mock('./user-store');",
      errors: [error('./user-store')],
      options: [{ vitestModules: ['@acme/test-utils'] }],
    },
    {
      code: "import * as helpers from '#test/helpers'; helpers.vi.mock('./user-store');",
      errors: [error('./user-store')],
      options: [{ vitestModules: ['#test/helpers'] }],
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
      code: withVi("const { doMock: register } = vi; register('./user-store');"),
      errors: [error('./user-store')],
    },
    {
      code: withVi("const mock = vi.mock; mock('./user-store');"),
      errors: [error('./user-store')],
    },
    {
      code: "import * as vitest from 'vitest'; const { vi } = vitest; vi.mock('./user-store');",
      errors: [error('./user-store')],
    },
    {
      code: "globalThis.vi.mock('./user-store');",
      errors: [error('./user-store')],
      options: [{ vitestGlobals: true }],
    },
    { code: withVi("(vi as any).mock('./user-store');"), errors: [error('./user-store')] },
    { code: withVi("vi!.doMock('./user-store' as string);"), errors: [error('./user-store')] },
    {
      code: withVi("(vi satisfies object).mock(import.meta.resolve('./user-store'));"),
      errors: [error("import.meta.resolve('./user-store')")],
    },
    {
      code: withVi("vi.mock('./generated/client'); vi.mock('../user-store');"),
      errors: [error('../user-store')],
      filename: nested,
      options: [{ allow: ['**/generated/'] }],
    },
    {
      code: withVi("vi.mock('../../generated/client');"),
      errors: [error('../../generated/client')],
      filename: nested,
      options: [{ allow: ['**/deep/generated/'] }],
    },
    {
      code: withVi("vi.mock('file:///repo/src/user-store.ts');"),
      errors: [error('file:///repo/src/user-store.ts')],
    },
    {
      code: withVi(String.raw`vi.mock('C:\\repo\\src\\user-store');`),
      errors: [error(String.raw`C:\repo\src\user-store`)],
    },
    {
      code: withVi(
        "import path from 'node:path'; vi.mock(path.resolve(__dirname, './user-store'));",
      ),
      errors: [error("path.resolve(__dirname, './user-store')")],
    },
    {
      code: withVi(
        "import { join } from 'path'; vi.mock(join(import.meta.dirname, '../user-store'));",
      ),
      errors: [error("join(import.meta.dirname, '../user-store')")],
    },
    {
      code: withVi("vi.mock(new URL('./user-store', import.meta.url).pathname);"),
      errors: [error("new URL('./user-store', import.meta.url).pathname")],
    },
    {
      code: withVi(
        "import { fileURLToPath } from 'node:url'; vi.mock(fileURLToPath(new URL('./user-store', import.meta.url).href));",
      ),
      errors: [error("fileURLToPath(new URL('./user-store', import.meta.url).href)")],
    },
  ],
  valid: [
    withVi("let a = b; const b = a; b.mock('./owned');"),
    "import type { vi } from 'vitest'; vi.mock('./owned');",
    withVi(String.raw`vi.mock('C:\\repo\\node_modules\\axios');`),
    {
      code: "import { vi } from 'vitest'; function use(vi) { vi.mock('./owned'); }",
      options: [{ vitestGlobals: true }],
    },
    {
      code: "import { vi as recorder } from './test-utils'; recorder.mock('./owned');",
      filename: nested,
      options: [{ vitestModules: ['./src/test-utils'] }],
    },
    withVi("import { fileURLToPath } from 'node:url'; vi.mock(fileURLToPath('invalid'));"),
    "vi.mock('./owned');",
    "globalThis.vi.mock('./owned');",
    "declare const vi: { mock(path: string): void }; vi.mock('./owned');",
    "import { vi as recorder } from './recorder'; recorder.mock('./owned');",
    {
      code: "import { vi as recorder } from '@acme/recorder'; recorder.mock('./owned');",
      options: [{ deny: ['@acme/'] }],
    },
    withVi("let api = vi; api = recorder; api.mock('./owned');"),
    withVi("let { mock } = vi; mock = recorder.mock; mock('./owned');"),
    withVi('vi.doMock(`./${name}`);'),
    {
      code: withVi(
        "vi.doMock('@/generated/client'); vi.mock('~/generated/client'); vi.mock('#build/generated/client');",
      ),
      options: [{ allow: ['**/generated/'] }],
    },
    {
      code: withVi(
        "import { fileURLToPath } from 'node:url'; vi.doMock(fileURLToPath(new URL('./generated/client', import.meta.url)));",
      ),
      options: [{ allow: ['**/generated/'] }],
    },
    withVi("vi.mock('node:fs');"),
    withVi("vi.mock('axios', () => ({ default: { get: vi.fn() } }));"),
    withVi("vi.mock('@cloudflare/workers-types');"),
    withVi("vi.mock(import('nanoid'));"),
    withVi("vi.mock('@acme/billing');"),
    withVi('vi.mock(moduleName);'),
    "mock('./user-store');",
    withVi("vi.mock(import.meta.resolve('axios'));"),
    withVi("vi.mock(new URL('file://server/share/user-store', import.meta.url).pathname);"),
    withVi("vi.mock(new URL('http://[', import.meta.url).pathname);"),
    withVi("vi.mock(fileURLToPath('file://server/share/user-store'));"),
    {
      code: withVi("vi.mock('./generated/client'); vi.mock('../../generated/client');"),
      filename: nested,
      options: [{ allow: ['**/generated/'] }],
    },
    {
      code: withVi("vi.mock('@acme/generated');"),
      options: [{ deny: ['**/generated'] }],
    },
    withVi('vi.mock(`${base}/user-store`);'),
    withVi("vi.mock('/node_modules/axios');"),
    withVi(
      "import path from 'node:path'; vi.mock(path.resolve(__dirname, '../node_modules/axios'));",
    ),
    withVi("vi.mock(path.resolve(__dirname, './user-store'));"),
    withVi("vi.mock(new URL('https://example.com/user-store').pathname);"),
    "const { mock } = helpers; mock('./user-store');",
    withVi("vi.unmock('./user-store');"),
    withVi("vi.importActual('./user-store');"),
    withVi("vi.spyOn(store, 'save');"),
    "const vi = { mock() {} }; vi.mock('./user-store');",
    "function run(vi: { mock(path: string): void }) { vi.mock('./user-store'); }",
    "import { jest } from '@jest/globals'; jest.mock('./user-store');",
    "import { vi } from 'some-library'; vi.mock('./user-store');",
    {
      code: withVi("vi.mock('@acme/billing-legacy');"),
      options: [{ deny: ['@acme/billing'] }],
    },
    {
      code: withVi("vi.mock('./generated/client'); vi.mock('#env');"),
      filename: shallow,
      options: [{ allow: ['./src/generated/', '#env'] }],
    },
    {
      code: withVi("vi.mock('../../generated/client'); vi.mock('/src/generated/client');"),
      filename: nested,
      options: [{ allow: ['src/generated/'] }],
    },
    {
      code: withVi("vi.mock('../../env.ts'); vi.mock('../../env');"),
      filename: nested,
      options: [{ allow: ['src/env'] }],
    },
    {
      code: withVi('vi.mock(`../../generated/${name}`);'),
      filename: nested,
      options: [{ allow: ['src/generated/'] }],
    },
    {
      code: withVi(
        "import path from 'node:path'; vi.mock(path.join(__dirname, '../../generated/client'));",
      ),
      filename: nested,
      options: [{ allow: ['src/generated/'] }],
    },
    {
      code: withVi("vi.mock('@acme/test-utils/fixtures');"),
      options: [{ allow: ['@acme/test-utils'], deny: ['@acme/'] }],
    },
  ],
});
