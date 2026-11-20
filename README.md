# @cloudflare/oxlint-config

Shared Oxlint rules for JavaScript and TypeScript projects. The preset uses
[@nkzw/oxlint-config](https://github.com/nkzw-tech/oxlint-config) for general
correctness and code quality, with Cloudflare rules for type safety, promises,
and type-only imports.

## Usage

Use Node.js 22.18+ on the 22.x line or Node.js 24+. The preset runs type-aware
rules. Keep your project's type-check command for compiler diagnostics. If your
previous lint configuration ran the compiler, keep that coverage in CI with
a separate type-check command or set `options.typeCheck` to `true`.

### Standalone Oxlint

Install the preset with Oxlint and its type-aware backend.

```sh
npm install -D @cloudflare/oxlint-config oxlint@^1.94.0 tsrs@0.25.0-ts7.1.0-beta
```

Create `oxlint.config.ts` at the project root.

```ts
import cloudflare from '@cloudflare/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [cloudflare],
  env: cloudflare.env,
  ignorePatterns: cloudflare.ignorePatterns,
});
```

Use `oxlint .` for local linting and CI.

### Vite+

In a Vite+ project using `vite-plus@1.7.0` or later, install the preset.
Vite+ supplies Oxlint and its type-aware backend.

```sh
pnpm add -D @cloudflare/oxlint-config
```

Import the Vite+ entry in the project's root `vite.config.ts`.

```ts
import cloudflare from '@cloudflare/oxlint-config/vite-plus';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    extends: [cloudflare],
    env: cloudflare.env,
    ignorePatterns: cloudflare.ignorePatterns,
  },
});
```

Use `vp lint` for local linting and CI. Both examples set `env` and
`ignorePatterns` explicitly because Oxlint 1.94 reads them from the root lint
config. Add project-specific `rules` and `overrides` alongside `extends`.

## Migrating an existing project

Adopt the preset in a passing commit with newly failing rules temporarily
disabled. When migrating an existing project, including from an internal
preset, decide case by case which new rules fit. It's acceptable to keep a
rule disabled in the project config when it doesn't fit.

Use one commit per rule to enable it with fixes or document why it should
stay off. Open one pull or merge request for the whole migration and squash
it after review.

Give your coding agent the [migration skill](skills/migrate-oxlint-config/SKILL.md)
for the full workflow. It also ships at `skills/migrate-oxlint-config/SKILL.md`
inside the npm package.

## Rule behavior

- Enabled rules are errors. Oxlint's whole-category defaults are disabled so
  upgrades to Oxlint cannot turn on new rules through category membership.
- Use strict equality, including for checks against `null`. To check for
  both nullish values, use `value === null || value === undefined`.
- Promise-returning callbacks used where `void` is expected are errors. React
  projects can set `checksVoidReturn: { attributes: false }` in a JSX file
  override for `typescript/no-misused-promises` and handle rejected promises
  in the handler.
- The preset keeps nkzw's choices for `return await`, empty interfaces, and
  TypeScript suppression comments.
- Direct `eval` and imports from the same module are errors.
- TypeScript source uses the type-aware check for throwing non-Error values.
  TypeScript tests relax that check, `typescript/unbound-method`, and selected
  type-safety checks. JavaScript uses the syntax-level throw check and skips the
  five unsafe-`any` rules.
- The preset applies `no-console` consistently across application paths.
  Projects can add a file override for entry points where logging is expected.

## Development

Install [Vite+](https://viteplus.dev/guide/) and use Node.js 24 LTS (24.11 or
later) to match CI. Run `vp install`, `vp check`, and `vp test`. Use
`vp pm pack` to build a tarball for testing in a consumer project.

Send changes in a pull request and include an example of the affected lint
behavior when changing a rule. Maintainers squash approved pull requests after
CI passes. See the [security policy](SECURITY.md) for vulnerability reports.

## Releases

Merge the version bump to `main`, then create and push a signed `v<version>`
tag for that commit. Run **Publish to npm** from `main` at the tagged commit.
The workflow verifies the tag, runs the tests, and publishes the package
with provenance using npm Trusted Publishing.
