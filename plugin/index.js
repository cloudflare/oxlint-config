import { noFirstPartyModuleMockingRule } from './rules/no-first-party-module-mocking.js';

export default {
  meta: { name: 'cloudflare' },
  rules: {
    'no-first-party-module-mocking': noFirstPartyModuleMockingRule,
  },
};
