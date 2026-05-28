# fuselage-craft — maintainer guide

For working **on** this repo. To understand the product, read [README.md](./README.md);
for the skill's runtime behavior read [`adapters/claude-code/SKILL.md`](./adapters/claude-code/SKILL.md);
for engine usage read [`docs/`](./docs/). This file holds the non-obvious constraints for
changing the repo safely.

## What it is

The product is an **agent skill**: the Fuselage design skill for products that *consume*
`@rocket.chat/fuselage` (audit / migrate / polish / craft / …). It is two halves:

- **The skill** — [`adapters/claude-code/`](./adapters/claude-code/): `SKILL.md` (laws +
  command router) and `reference/<cmd>.md` (per-command flows). This is the product. Not
  shipped in the npm package; installed by symlink.
- **The engine** — `src/` + `bin/`: the resolver and the gate the skill shells out to (and a
  standalone CI gate). This is what `npm i` ships.

Keep the skill and the engine in lockstep: a command the skill promises must be backed by what
the engine enforces.

## Prime directive — never violate

**Reference, never replicate.** The installed `@rocket.chat/fuselage*` packages are the single
source of truth, resolved live. Never copy, cache, or hardcode a token name, color, dimension,
fontScale, or component name into this repo's logic or output.

- Names → read live via the resolver (`src/resolve.mjs`).
- Values → never checked here; the type gate validates props against the installed types.
- Lint rules stay **value-free**: they ban literal *patterns* (any hex, any px, styled `<div>`,
  inputs outside `<Field>`), never specific Fuselage values.

## Invariants

1. **Every lint rule needs a test.** `src/eslint-plugin/<rule>.mjs` ⇒ `test/<rule>.test.mjs`,
   registered in `test/run-tests.mjs`. `node test/run-tests.mjs` must stay green.
2. **`valid-color-token` is a NO-OP without an injected `palette`.** Standalone `eslint` runs
   have no palette; only `run-gate.mjs` feeds the live one. It must never false-positive
   without data. Preserve that guard.
3. **Runtime externals are peer dependencies.** `eslint`, `typescript`, `typescript-eslint` are
   resolved from the *host* repo (`resolve.mjs` anchors `typescript`; `eslint.config.mjs`
   anchors `typescript-eslint`; `run-gate.mjs` imports `eslint`). They are declared as
   `peerDependencies` so the gate uses the host project's copies.
4. **Box prop forms:** `color=` takes the bare text token (no `font-`: `'default'`, `'hint'`);
   `borderColor=` prepends `stroke-`; `bg=` takes the full `surface-*` name (or bare).
   `valid-color-token` enforces these.
5. **`resolve.mjs` access paths are the one manual surface** — package specifiers, `colors.mjs`
   / `typography.mjs` subpaths, `Palette` sub-object keys. If a category reports `unavailable`
   after a Fuselage bump, fix its access path; never hardcode the data.
6. **ESM only** (`"type": "module"`), Node `>=20` (volta pins 22.20.0).
7. **Laws and rules stay in lockstep.** Every enforceable law in the SKILL.md / README
   forbidden→use table MUST have a backing lint rule + test, or be explicitly marked
   agent-only / type-gate-enforced. When you add a law, add the rule in the same change.
   Silent gaps ship drift past the gate (media-query and fake-link-button both slipped
   through this way).

## When you change X, also touch Y (doc fan-out)

- **A lint rule** → rule file + its test + `run-tests.mjs` + the rule table in
  [`docs/eslint-plugin.md`](./docs/eslint-plugin.md) + the laws in `README.md` and `SKILL.md`.
- **A command** → `SKILL.md` router table + `adapters/claude-code/reference/<cmd>.md` + the
  command table in `README.md`.
- **A CLI flag or behavior** → [`docs/cli.md`](./docs/cli.md).
- **A shipped file or runtime dep** → `package.json` `files` / `peerDependencies`.

## Layout

| Path | What |
|------|------|
| `adapters/claude-code/` | The skill — `SKILL.md` (laws + router), `reference/` (per-command flows) |
| `src/resolve.mjs` | Live resolver — token/component/hook introspection via TS types |
| `src/eslint-plugin/` | Nine value-free lint rules + `index.mjs` |
| `src/run-gate.mjs` | Gate driver — injects the live palette into `valid-color-token`; runs lint, type, and companion checks |
| `src/typecheck.mjs` | `tsc --noEmit` wrapper against the consumer tsconfig |
| `bin/` | `fuselage-resolve`, `fuselage-gate` CLIs |
| `docs/` | Engine reference — `cli.md`, `eslint-plugin.md` |
| `test/`, `fixtures/consumer/` | Rule suites + a real Fuselage-consuming fixture |

## Smoke tests

```sh
node test/run-tests.mjs                                   # rule suites (must be green)
cd fixtures/consumer && node ../../bin/fuselage-resolve.mjs all              # resolver vs real Fuselage
cd fixtures/consumer && node ../../bin/fuselage-resolve.mjs check-companions # companion imports vs installed exports
cd fixtures/consumer && node ../../bin/fuselage-gate.mjs 'src/good.tsx'     # PASS
cd fixtures/consumer && node ../../bin/fuselage-gate.mjs 'src/bad.tsx'      # FAIL (gate catches drift)
```
