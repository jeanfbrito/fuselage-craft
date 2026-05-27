# fuselage-craft

Conformance toolkit for products that consume `@rocket.chat/fuselage`.

## What it is

Three live mechanisms, all reading the **installed** `@rocket.chat/fuselage*` packages — no copy of the design system is held here:

1. **Resolver** — `fuselage-resolve [category]` extracts the current token names, component names, hook names, and fontScale values from the installed packages via TypeScript type introspection. Zero Fuselage vocabulary is hardcoded.
2. **ESLint plugin** — six value-free lint rules that ban raw design values (hex colors, px dimensions, literal shadows, bare inputs outside Field). The rules enforce structural patterns; they do not know or check Fuselage token values.
3. **Type gate** — `fuselage-gate [globs]` runs the lint rules plus `tsc --noEmit` against the consumer's installed Fuselage types, giving an objective conformance check.

The installed `@rocket.chat/fuselage*` packages are the single source of truth, resolved live. Nothing is cached or copied from them.

## Install

For now, use git + link:

```sh
git clone https://github.com/RocketChat/fuselage-craft
cd fuselage-craft && npm install
# from your product repo:
npm link ../fuselage-craft
```

When published to npm:

```sh
npm i -D fuselage-craft
```

## CLI usage

Run from your product repo root so the resolver can walk up to find `@rocket.chat/fuselage` in your `node_modules`.

The `fuselage-resolve` and `fuselage-gate` commands must be on PATH. Install the toolkit globally (`npm link` from the repo, or `npm i -g fuselage-craft` once published), or add it as a project devDep and call the bins via your package scripts.

```sh
# Resolve all categories (components, tokens, hooks, forms, inputs...)
fuselage-resolve all

# Resolve a specific category
fuselage-resolve semantic
fuselage-resolve components
fuselage-resolve inputs

# Run the full gate (lint + type check) against your src/
fuselage-gate 'src/**/*.tsx'

# Gate with explicit globs
fuselage-gate 'src/**/*.{ts,tsx}' 'app/**/*.tsx'
```

Or, when running from source:

```sh
cd your-product-repo
node /path/to/fuselage-craft/bin/fuselage-resolve.mjs all
node /path/to/fuselage-craft/bin/fuselage-gate.mjs 'src/**/*.tsx'
```

## ESLint plugin usage

Add the plugin to your `eslint.config.mjs`:

```js
import fuselageCraftGate from 'fuselage-craft/eslint-plugin';

export default [
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'fuselage-craft-gate': fuselageCraftGate },
    rules: {
      'fuselage-craft-gate/no-raw-color': 'error',
      'fuselage-craft-gate/no-literal-dimension': 'error',
      'fuselage-craft-gate/no-literal-shadow': 'error',
      'fuselage-craft-gate/require-field-wrapper': 'warn',
      'fuselage-craft-gate/prefer-box': 'warn',
      // valid-color-token requires the live palette — use fuselage-gate for this rule
      'fuselage-craft-gate/valid-color-token': 'off',
    },
  },
];
```

| Rule | Severity | What it flags |
|---|---|---|
| `no-raw-color` | error | Hex/rgb/rgba/hsl literals in JSX color attrs, `style={{}}`, `css`/`styled` templates |
| `no-literal-dimension` | error | Literal `px`/`rem` values for spacing/sizing props in `style={{}}` and `css`/`styled` |
| `no-literal-shadow` | error | Literal `boxShadow`/`box-shadow` values |
| `require-field-wrapper` | warn | Input controls not inside a `<Field>` ancestor |
| `prefer-box` | warn | Raw DOM elements (`div`, `span`, etc.) with inline `style={{}}` |
| `valid-color-token` | error | Invalid/double-prefixed Fuselage color token names (requires live palette via `fuselage-gate`) |

## Type gate

The type gate runs `tsc --noEmit` against the consumer's `tsconfig.json`. TypeScript validates every `color=`, `fontScale=`, `elevation=` prop against the installed Fuselage type declarations — wrong prop names and invalid token values become compile errors automatically.

Box `color=` takes the text token WITHOUT the `font-` prefix (`color='default'`, `'hint'`, `'danger'`); `bg=` takes the full surface/status name (`bg='surface-tint'`). The resolver lists canonical token names (e.g. `font-default`); the `valid-color-token` rule enforces the correct prop form.

```sh
# Type check only
node /path/to/fuselage-craft/src/typecheck.mjs
node /path/to/fuselage-craft/src/typecheck.mjs -p tsconfig.app.json
```

## Adapters

### Claude Code

The `adapters/claude-code/` directory contains a skill adapter that makes fuselage-craft available as a Claude Code skill. It defines commands (`audit`, `migrate`, `polish`, `craft`, etc.) that call the toolkit CLIs.

Install as a symlink into your Claude Code skills directory:

```sh
ln -s /path/to/fuselage-craft/adapters/claude-code ~/.claude/skills/fuselage-craft
```

See [`adapters/claude-code/README.md`](adapters/claude-code/README.md) for full installation and usage instructions.

## How it stays in sync with Fuselage

**Auto-tracked (no action needed):**

- New/renamed/removed tokens, components, hooks: the resolver reads them live from installed packages on the next run.
- New/changed prop types or token types: `tsc` validates against installed types automatically.
- Literal-value rules: value-free, so Fuselage releases never affect them.

**The one manual surface:** `src/resolve.mjs` hardcodes structural access paths — the package specifiers, `colors.mjs`/`typography.mjs` subpaths, and the `Palette` sub-object keys (`surface`, `text`, `stroke`, ...). Only a Fuselage packaging restructure touches these. The failure mode is safe: a broken path makes that resolver category report `unavailable`; the type gate still enforces correctness.

Verify after a Fuselage major bump:

```sh
cd your-product-repo && node /path/to/fuselage-craft/bin/fuselage-resolve.mjs all
node /path/to/fuselage-craft/test/run-tests.mjs
```

## License

MIT — see [LICENSE](LICENSE).
