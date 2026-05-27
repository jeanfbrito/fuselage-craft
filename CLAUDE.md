# fuselage-craft — Agent Guide

Conformance toolkit for products that **consume** `@rocket.chat/fuselage`. Not
the design system itself. See [README.md](./README.md) for full usage.

## Core invariant — never hardcode Fuselage values

The installed `@rocket.chat/fuselage*` packages are the **single source of
truth**, resolved live. Never copy, cache, or hardcode a token name, color,
dimension, fontScale, or component name into this repo's logic.

- Token/component/hook names → read live via the resolver (`src/resolve.mjs`).
- Token *values* → never checked here; `tsc` validates props against installed types.
- ESLint rules are **value-free**: they enforce structural patterns (no raw hex,
  no literal px, inputs inside `<Field>`), never specific Fuselage values.

The one manual surface is the structural access paths in `src/resolve.mjs`
(package specifiers, subpaths, `Palette` sub-object keys). A Fuselage packaging
restructure is the only thing that touches these; the failure mode is safe
(category reports `unavailable`, type gate still enforces correctness).

## Layout

| Path | What |
|------|------|
| `src/resolve.mjs` | Live resolver — token/component/hook introspection via TS types |
| `src/eslint-plugin/` | Six value-free lint rules + `index.mjs` |
| `src/run-gate.mjs` | Gate driver — injects live palette into `valid-color-token` |
| `src/typecheck.mjs` | `tsc --noEmit` wrapper against consumer tsconfig |
| `bin/` | `fuselage-resolve`, `fuselage-gate` CLIs |
| `test/run-tests.mjs` | Runs all RuleTester suites |
| `adapters/claude-code/` | Claude Code skill adapter (audit/migrate/polish/...) |

## Working rules

- **Run tests after any rule change:** `node test/run-tests.mjs`. Every rule in
  `src/eslint-plugin/` must have a matching `test/<rule>.test.mjs`.
- **`valid-color-token` is a NO-OP without an injected `palette` option.** It
  must never false-positive on standalone eslint runs — only `run-gate.mjs`
  feeds it the live palette. Preserve that guard.
- **Box prop forms:** `color=` takes the text token WITHOUT `font-` prefix
  (`'default'`, `'hint'`); `bg=` takes the full surface/status name
  (`'surface-tint'`). `valid-color-token` enforces the correct prop form.
- ES modules only (`"type": "module"`), Node `>=20` (volta pins 22.20.0).
