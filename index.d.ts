// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { OxlintConfig } from 'oxlint';

declare const config: OxlintConfig & Required<Pick<OxlintConfig, 'env' | 'ignorePatterns'>>;

export default config;
