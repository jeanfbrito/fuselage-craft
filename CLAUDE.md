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
| `src/eslint-plugin/` | Eight value-free lint rules + `index.mjs` |
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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **fuselage-craft** (656 symbols, 949 relationships, 38 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/fuselage-craft/context` | Codebase overview, check index freshness |
| `gitnexus://repo/fuselage-craft/clusters` | All functional areas |
| `gitnexus://repo/fuselage-craft/processes` | All execution flows |
| `gitnexus://repo/fuselage-craft/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
