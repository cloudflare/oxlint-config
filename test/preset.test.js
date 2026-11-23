// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const oxlint = fileURLToPath(new URL('bin/oxlint', import.meta.resolve('oxlint/package.json')));

test('a consumer can load the preset with its lint rules and file overrides', async ({
  onTestFinished,
}) => {
  const project = await mkdtemp(join(root, '.consumer-'));
  onTestFinished(() => rm(project, { force: true, recursive: true }));
  await mkdir(join(project, 'server', 'src'), { recursive: true });

  const detachedMethod = `
    class Counter {
      value = 0;
      read() {
        return this.value;
      }
    }
    export const read = new Counter().read;
  `;
  const fixtures = {
    'assertion.ts': `
      export function read(value: unknown): string {
        return (value as { text: string }).text;
      }
    `,
    'eval.js': 'eval("1 + 2");',
    'globals.js': 'export const location = window.location.href + process.cwd();',
    'method.test.ts': detachedMethod,
    'method.ts': detachedMethod,
    'nullish.ts': `
      export const loose = (value: number | null | undefined) => value == null;
      export const strict = (value: number | null | undefined) =>
        value === null || value === undefined;
    `,
    'oxlint.config.ts': `
      import cloudflare from '@cloudflare/oxlint-config';
      import { defineConfig } from 'oxlint';

      export default defineConfig({
        env: cloudflare.env,
        extends: [cloudflare],
        ignorePatterns: cloudflare.ignorePatterns,
      });
    `,
    'promises.ts': `
      declare function load(): Promise<string>;
      declare function onClick(handler: () => void): void;
      onClick(async () => {
        await load();
      });
      export async function plainReturn() {
        return await load();
      }
      export async function catchRejection() {
        try {
          return load();
        } catch (error: unknown) {
          return String(error);
        }
      }
      export function forgotAwait() {
        load();
      }
    `,
    'self.ts': `
      import { value as importedValue } from './self';

      export const value = 42;
      export function read() {
        return importedValue;
      }
    `,
    'server/src/app.tsx': 'console.log("debug");',
    'throw.js': 'export function fail() { throw "failure"; }',
    'throw.test.ts': 'export function fail(): never { throw "fixture"; }',
    'throw.ts': 'export function fail(): never { throw "failure"; }',
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noEmit: true, strict: true, types: [] },
      include: ['*.ts', 'server/src/*.tsx'],
    }),
  };
  await Promise.all(
    Object.entries(fixtures).map(([name, source]) => writeFile(join(project, name), source)),
  );

  const sourceFiles = Object.keys(fixtures).filter(
    (name) => name !== 'oxlint.config.ts' && name !== 'tsconfig.json',
  );
  // Test standalone Oxlint config discovery outside Vite+ mode.
  const result = spawnSync(
    process.execPath,
    [oxlint, '--format=json', '--no-ignore', ...sourceFiles],
    { cwd: project, encoding: 'utf8', env: { ...process.env, VP_VERSION: undefined } },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(1);
  expect(result.stdout, result.stderr || result.stdout).toMatch(/^\s*\{/);

  const { diagnostics } = JSON.parse(result.stdout);
  const findings = diagnostics.map(({ code, filename, severity }) =>
    [filename, code, severity].join(' '),
  );
  expect(findings.sort()).toEqual([
    'assertion.ts typescript(no-unsafe-type-assertion) error',
    'eval.js eslint(no-eval) error',
    'method.ts typescript(unbound-method) error',
    'nullish.ts eslint(eqeqeq) error',
    'promises.ts typescript(no-floating-promises) error',
    'promises.ts typescript(no-misused-promises) error',
    'promises.ts typescript(return-await) error',
    'self.ts import(no-self-import) error',
    'server/src/app.tsx eslint(no-console) error',
    'throw.js eslint(no-throw-literal) error',
    'throw.ts typescript(only-throw-error) error',
  ]);
});
