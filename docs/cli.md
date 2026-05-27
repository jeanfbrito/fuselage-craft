# CLI reference

The engine behind the [fuselage-craft skill](../README.md): two bins plus a standalone type
checker. The skill shells out to these, but they also stand alone for CI, pre-commit, and
non-agent workflows.

Install the engine in your product repo (`npm i -D github:jeanfbrito/fuselage-craft`) or link a
clone globally (`npm link`). `eslint`, `typescript`, and `typescript-eslint` are peer
dependencies — the engine uses your project's copies.

Run the bins from your product repo root so the resolver can walk up to find
`@rocket.chat/fuselage` in your `node_modules`.

## `fuselage-resolve [category]`

Reads the current token / component / hook / fontScale vocabulary live from the installed
`@rocket.chat/fuselage*` packages via TypeScript type introspection. Holds zero hardcoded
Fuselage vocabulary.

```sh
fuselage-resolve all          # every category (components, tokens, hooks, forms, inputs...)
fuselage-resolve semantic     # color tokens grouped by prop (color=, bg=, borderColor=)
fuselage-resolve components
fuselage-resolve inputs
```

A category that can't be resolved reports `unavailable` rather than guessing — the type gate
still enforces correctness, so the failure mode is safe.

## `fuselage-resolve diff <old.json> <new.json>`

Diffs two `fuselage-resolve --json` snapshots to surface what Fuselage vocabulary
disappeared or appeared between versions — the breaking-change surface for an upgrade.

Typical workflow:

```sh
# 1. Capture before upgrading
fuselage-resolve all --json > before.json

# 2. Bump @rocket.chat/fuselage in package.json, then:
npm install

# 3. Capture after
fuselage-resolve all --json > after.json

# 4. See what changed
fuselage-resolve diff before.json after.json
```

The output groups changes by category (components, tokens, hooks, …):

```
═══ fuselage-craft vocab diff ════════════════════════
old: 0.31.0  →  new: 0.32.0
──────────────────────────────────────────────────────
components:
  removed:  Tile
  added:    Chip
semantic:
  (no change)
skipped (not comparable): spacing (old rule, new rule), radius (old rule, new rule)
```

Add `--json` after the paths to get a machine-readable object instead of human output.
Categories that were not resolvable on either side are reported as `skipped` (not
counted as changes) so noise from unavailable introspection paths does not pollute the
diff.

## `fuselage-gate [globs]`

Runs the lint rules **and** `tsc --noEmit` against your installed Fuselage types. A change is
not done until both pass; exits nonzero if lint errors > 0 OR tsc fails.

```sh
fuselage-gate 'src/**/*.tsx'
fuselage-gate 'src/**/*.{ts,tsx}' 'app/**/*.tsx'
```

The gate injects the live palette into the `valid-color-token` rule (which is otherwise a
no-op), so running the rules via `fuselage-gate` is stricter than a plain ESLint run. See
[docs/eslint-plugin.md](eslint-plugin.md) for the rule set.

## Type gate

`src/typecheck.mjs` spawns `tsc --noEmit` against your `tsconfig.json`, so TypeScript validates
every `color=`, `fontScale=`, `elevation=` prop against the installed Fuselage declarations —
wrong prop names and invalid token values become compile errors automatically.

```sh
node /path/to/fuselage-craft/src/typecheck.mjs
node /path/to/fuselage-craft/src/typecheck.mjs -p tsconfig.app.json
```

**Prop forms:** Box `color=` takes the text token **without** the `font-` prefix
(`color='default'`, `'hint'`, `'danger'`); `borderColor=` prepends `stroke-`; `bg=` prepends
`surface-` but also accepts the full `surface-*` name. The resolver lists canonical names
(e.g. `font-default`); the `valid-color-token` rule enforces the correct prop form.

## Running from source

Without a linked install, call the bins by path:

```sh
node /path/to/fuselage-craft/bin/fuselage-resolve.mjs all
node /path/to/fuselage-craft/bin/fuselage-gate.mjs 'src/**/*.tsx'
```

## In CI / pre-commit

`fuselage-gate` is the whole check — add it as a step or hook:

```sh
# package.json script
"scripts": { "gate": "fuselage-gate 'src/**/*.{ts,tsx}'" }
```

It exits nonzero on any lint error or type error, so it fails the job without extra wiring.
