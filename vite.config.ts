// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import nkzw from '@nkzw/oxlint-config/vite-plus/with-sorting';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    ignorePatterns: ['pnpm-lock.yaml', '.consumer-*'],
    singleQuote: true,
    sortImports: {
      newlinesBetween: false,
    },
    sortPackageJson: {
      sortScripts: true,
    },
  },
  lint: {
    env: { node: true },
    extends: [nkzw],
    ignorePatterns: ['.consumer-*/'],
    options: { typeAware: true, typeCheck: true },
  },
  staged: {
    '*': 'vp check --fix',
  },
});
