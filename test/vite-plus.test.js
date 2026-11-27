// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { findPackageJSON } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import manifest from '../package.json' with { type: 'json' };

test(
  'a Vite+ project can extend the packed preset without standalone Oxlint',
  {
    timeout: 120_000,
  },
  async ({ onTestFinished }) => {
    const cwd = await mkdtemp(join(tmpdir(), 'cloudflare-vite-plus-'));
    onTestFinished(() => rm(cwd, { force: true, recursive: true }));
    execFileSync('vp', ['pm', 'pack', '--out', join(cwd, 'preset.tgz')], {
      cwd: new URL('..', import.meta.url),
    });

    const fixtures = {
      'globals.js': 'export const globals = [window.location.href, process.version];',
      'input.ts': `
      declare const value: string | null;
      export const missing = value == null;
      export const positive = [1, 2].filter((n) => n > 0).map((n) => n + 1);
      Promise.resolve(1);
    `,
      'mocking.test.ts': `
      import { vitest as api } from 'vite-plus/test';
      api.doMock('./input');
      api.doMock('@/generated/client');
    `,
      'package.json': JSON.stringify({
        devDependencies: {
          '@cloudflare/oxlint-config': 'file:./preset.tgz',
          typescript: '6.0.3',
          'vite-plus': '1.7.0',
        },
        packageManager: manifest.packageManager,
        private: true,
        type: 'module',
      }),
      'pnpm-workspace.yaml': [
        'autoInstallPeers: false',
        'dedupePeerDependents: false',
        'hoist: false',
        'strictPeerDependencies: true',
      ].join('\n'),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          exactOptionalPropertyTypes: true,
          module: 'nodenext',
          noEmit: true,
          strict: true,
          target: 'esnext',
        },
        files: ['input.ts', 'types.ts'],
      }),
      'types.ts': `
      import cloudflare from '@cloudflare/oxlint-config/vite-plus';
      import type { OxlintConfig } from 'vite-plus/lint';
      export const lint = {
        env: cloudflare.env,
        extends: [cloudflare],
        ignorePatterns: cloudflare.ignorePatterns,
      } satisfies OxlintConfig;
      if (cloudflare.rules) {
        cloudflare.rules['no-console'] = 'warn';
        // @ts-expect-error Oxlint rejects unknown severities.
        cloudflare.rules['no-console'] = 'fatal';
      }
    `,
      'vite.config.ts': `
      import cloudflare from '@cloudflare/oxlint-config/vite-plus';
      import { defineConfig } from 'vite-plus';
      export default defineConfig({
        lint: {
          env: cloudflare.env,
          extends: [cloudflare],
          ignorePatterns: cloudflare.ignorePatterns,
          rules: {
            'cloudflare/no-first-party-module-mocking': ['error', { allow: ['**/generated/'] }],
          },
        },
      });
    `,
    };
    await Promise.all(
      Object.entries(fixtures).map(([name, source]) => writeFile(join(cwd, name), source)),
    );
    execFileSync('vp', ['install', '--no-frozen-lockfile'], { cwd, stdio: 'inherit' });
    const project = join(cwd, 'package.json');
    const preset = await realpath(findPackageJSON('@cloudflare/oxlint-config', project));
    const upstream = await realpath(findPackageJSON('@nkzw/oxlint-config', preset));
    for (const consumer of [project, preset, upstream]) {
      for (const peer of ['oxlint', 'tsrs']) {
        expect(() => findPackageJSON(peer, consumer)).toThrow(
          expect.objectContaining({ code: 'ERR_MODULE_NOT_FOUND' }),
        );
      }
    }

    const env = { ...process.env, NODE_PATH: undefined };
    execFileSync(process.execPath, ['node_modules/typescript/bin/tsc'], {
      cwd,
      env,
      stdio: 'inherit',
    });
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/vite-plus/bin/vp',
        'lint',
        '--format=json',
        'input.ts',
        'globals.js',
        'mocking.test.ts',
      ],
      { cwd, encoding: 'utf8', env },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr || result.stdout).toBe(1);
    const { diagnostics } = JSON.parse(result.stdout);
    expect(diagnostics.map(({ code }) => code).sort()).toEqual([
      'cloudflare(no-first-party-module-mocking)',
      'eslint(eqeqeq)',
      'quality(no-array-filter-map)',
      'typescript(no-floating-promises)',
    ]);
  },
);
