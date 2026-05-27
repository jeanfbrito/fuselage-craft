# fuselage-craft

A conformance toolkit for products that **consume** `@rocket.chat/fuselage`. It keeps
consumer UI faithful to the design system: it treats the installed Fuselage packages as the
single source of truth and never copies a Fuselage value or name into your code.

Not for authoring Fuselage itself — that work happens in the Fuselage repo with its own
tokens and components.

## Mental model

Three live mechanisms, all reading the installed package, none holding a copy:

1. **Resolve, don't recall.** Token / component / hook names come from the resolver
   (`fuselage-resolve <category>`), read live from the installed packages via TypeScript type
   introspection. The toolkit bakes in zero Fuselage vocabulary.
2. **The type gate enforces.** Emitted JSX must typecheck against the installed Fuselage
   types, so a wrong prop or token value is a compile error, not a guess.
3. **The lint gate kills literals.** Raw hex, px, shadows, and hand-rolled inputs are banned
   by value-free ESLint rules — they enforce structural patterns and know no Fuselage values.

So product code references token names (`color='default'`, `p='x16'`, `<Button primary>`), the
value resolves inside Fuselage at runtime, and a token change propagates everywhere with no
consumer edit.

## Requirements

- Node `>=20` (the toolkit pins 22.20.0 via volta, matching the Fuselage monorepo).
- A consumer project with `@rocket.chat/fuselage*` installed in its `node_modules`.

## Install

No publish step is required — install straight from the repo. The toolkit is plain ES
modules with no build step, so any of these work in your product repo:

```sh
# from GitHub (default branch)
npm i -D github:jeanfbrito/fuselage-craft

# pin a branch or tag
npm i -D github:jeanfbrito/fuselage-craft#main

# once published to npm
npm i -D fuselage-craft
```

This installs the `fuselage-resolve` and `fuselage-gate` bins and exposes the ESLint plugin
at `fuselage-craft/eslint-plugin`. Run the bins from your product repo root (via
`npx fuselage-gate …` or a package script) so the resolver can walk up to find
`@rocket.chat/fuselage` in your `node_modules`.

`eslint`, `typescript`, and `typescript-eslint` are **peer dependencies** — the toolkit uses
the copies already installed in your project (so the gate runs against your exact versions).
npm 7+ installs missing peers automatically; otherwise add them yourself.

For local development on the toolkit itself, clone and link instead:

```sh
git clone https://github.com/jeanfbrito/fuselage-craft
cd fuselage-craft && npm install && npm link
# then, from your product repo:
npm link fuselage-craft
```

## Usage

### Resolve — read the live vocabulary

```sh
fuselage-resolve all          # every category (components, tokens, hooks, forms, inputs...)
fuselage-resolve semantic     # color tokens grouped by prop (color=, bg=, borderColor=)
fuselage-resolve components
fuselage-resolve inputs
```

Each category is read live from the installed packages. A category that can't be resolved
reports `unavailable` rather than guessing — the type gate still enforces correctness.

### Gate — lint + type check

`fuselage-gate` runs the lint rules **and** `tsc --noEmit` against your installed Fuselage
types. A change is not done until both pass.

```sh
fuselage-gate 'src/**/*.tsx'
fuselage-gate 'src/**/*.{ts,tsx}' 'app/**/*.tsx'
```

Running from source instead of a linked install:

```sh
node /path/to/fuselage-craft/bin/fuselage-resolve.mjs all
node /path/to/fuselage-craft/bin/fuselage-gate.mjs 'src/**/*.tsx'
```

### ESLint plugin — wire into your config

```js
// eslint.config.mjs
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
      // valid-color-token needs the live palette — leave off here, run it via fuselage-gate
      'fuselage-craft-gate/valid-color-token': 'off',
    },
  },
];
```

| Rule | Severity | What it flags |
|---|---|---|
| `no-raw-color` | error | Hex/rgb/rgba/hsl literals in JSX color attrs, `style={{}}`, `css`/`styled` templates |
| `no-literal-dimension` | error | Literal `px`/`rem` spacing/sizing values in `style={{}}` and `css`/`styled` |
| `no-literal-shadow` | error | Literal `boxShadow` / `box-shadow` values |
| `require-field-wrapper` | warn | Input controls not inside a `<Field>` ancestor |
| `prefer-box` | warn | Raw DOM elements (`div`, `span`, …) with inline `style={{}}` |
| `valid-color-token` | error | Invalid / double-prefixed Fuselage color token names — needs the live palette via `fuselage-gate` |

> `valid-color-token` is a no-op unless `fuselage-gate` injects the live palette. It never
> false-positives on a standalone `eslint` run.

### Type gate

The type gate runs `tsc --noEmit` against your `tsconfig.json`, so TypeScript validates every
`color=`, `fontScale=`, `elevation=` prop against the installed Fuselage declarations — wrong
prop names and invalid token values become compile errors automatically.

Box `color=` takes the text token **without** the `font-` prefix (`color='default'`, `'hint'`,
`'danger'`); `bg=` takes the full surface/status name (`bg='surface-tint'`). The resolver lists
canonical names (e.g. `font-default`); `valid-color-token` enforces the correct prop form.

```sh
node /path/to/fuselage-craft/src/typecheck.mjs
node /path/to/fuselage-craft/src/typecheck.mjs -p tsconfig.app.json
```

## Adapters

### Claude Code

`adapters/claude-code/` exposes the toolkit as a Claude Code skill. Each command resolves
vocabulary live and closes by running the gate — the adapter holds no Fuselage vocabulary of
its own. Install via symlink so the repo stays the source of truth:

```sh
ln -s /path/to/fuselage-craft/adapters/claude-code ~/.claude/skills/fuselage-craft
```

Invoke as `/fuselage-craft <command> <target>` from a product repo that consumes Fuselage:

| Command | Category | What it does | Edits code | Runs gate |
|---|---|---|:---:|:---:|
| `audit` | Evaluate | Conformance scan: gate drift + a judgment pass | no | yes |
| `critique` | Evaluate | UX heuristic review (hierarchy, load, IA) | no | no |
| `shape` | Build | Plan the feature as a Fuselage component tree | no | no |
| `craft` | Build | Shape, then build the feature end to end | yes | yes |
| `migrate` | Fix | Convert legacy / raw-CSS UI to Fuselage + tokens | yes | yes |
| `clarify` | Fix | Fix UX copy, labels, error messages | yes | yes |
| `adapt` | Fix | Make it responsive via `fuselage-hooks` | yes | yes |
| `polish` | Refine | Complete states: loading, empty, error, focus | yes | yes |
| `harden` | Refine | Edge cases, i18n, RTL, a11y, error paths | yes | yes |

```sh
/fuselage-craft audit src/**
/fuselage-craft migrate src/components/LegacyToolbar.tsx
/fuselage-craft craft "invite-members dialog"
```

See [`adapters/claude-code/README.md`](adapters/claude-code/README.md) for the per-command flows.

## Keeping in sync with Fuselage

The toolkit tracks Fuselage **automatically** — it holds no copy of the design system, so most
releases need no action here.

**Auto-tracked (do nothing):**

- New / renamed / removed tokens, components, hooks — the resolver reads them live on the next run.
- New / changed prop or token types — the type gate (`tsc`) validates against the installed types.
- Literal-value lint rules — value-free, so Fuselage releases never affect them.

**The one manual surface:** `src/resolve.mjs` hardcodes *structural access paths* — the package
specifiers, the `colors.mjs` / `typography.mjs` subpaths, and the `Palette` sub-object keys
(`surface`, `text`, `stroke`, `status`, …). Only a Fuselage **packaging restructure** touches
these. The failure mode is safe: a broken path makes that resolver category report
`unavailable`, and the type gate still enforces correctness — the toolkit degrades, it never
silently produces wrong output.

**Verify after a Fuselage major bump:**

```sh
fuselage-resolve all          # every category resolves (no "unavailable")
node test/run-tests.mjs       # lint rules still green
```

If a category reports `unavailable`, update its access path in `src/resolve.mjs` to match the
new package structure. That is the only maintenance this toolkit needs.

## License

MIT — see [LICENSE](LICENSE).
