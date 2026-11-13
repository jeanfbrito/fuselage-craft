---
name: craft-evolve
description: Feed real-world UI learnings back into fuselage-craft (~/Github/fuselage-craft) — when a Fuselage UI work arc surfaces something the craft's gates/knowledge/resolver don't cover yet, classify the gap and implement it in the right layer. Trigger when the user says "harden the craft", "feed this back to fuselage-craft", "craft doesn't cover this", "evolve the craft", or at the end of a Fuselage UI arc where a design bug passed the craft's gates.
---

# craft-evolve — turn UI lessons into fuselage-craft upgrades

fuselage-craft's gates prove token NAMES exist (type gate) and no LITERALS
snuck in (lint gate). Real work keeps finding the third class: things that
pass both gates and are still wrong. This skill is the repeatable loop that
moves each such finding into the craft so it never bites again.

This skill lives in the fuselage-craft repo itself (`skills/craft-evolve/`)
so the contribution contract below evolves in the same PRs that change the
engine — engine in `src/`, Claude adapter in `adapters/claude-code/`. For
global discovery on a dev machine, symlink it:
`ln -s <clone>/skills/craft-evolve ~/.claude/skills/craft-evolve`.

## Step 1 — inventory the gaps

Scan the just-finished arc (review comments, debug cycles, reverted
commits) for anything where the craft was silent:

- A token that typechecked/linted but was semantically wrong for its intent
- A component that passed gates but broke at runtime (a11y warnings,
  react-aria contracts, icon/font quirks)
- A value class with no Fuselage token (durations, custom-chrome geometry)
  where a literal was unavoidable
- Something the resolver couldn't answer (theme-specific values, geometry,
  new vocabulary)
- Escape-hatch work (custom SVG/chrome) that lacked a conformance recipe

## Step 2 — classify each gap to its layer

| Gap type                                        | Target                                                                             | Notes                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Intent→token semantics, theme rules             | `adapters/claude-code/reference/semantics.md` (intent table / theme rules section) | Knowledge layer — the gates can't infer intent                              |
| Component gotcha (passes gates, breaks live)    | `semantics.md` gotchas section                                                     |                                                                             |
| Custom-chrome / escape-hatch recipe             | `semantics.md` recipes section                                                     |                                                                             |
| Data agents keep resolving by hand              | New resolver category in `src/resolve.mjs`                                         | See contribution contract below                                             |
| Mechanically detectable ban, low false-positive | New rule in `src/eslint-plugin/` + `index.mjs` + `docs/eslint-plugin.md`           | Only if the pattern is crisp — heuristic rules that cry wolf get suppressed |
| A command's workflow missed a step              | That command's `adapters/claude-code/reference/<command>.md`                       |                                                                             |
| Real limitation, not fixable here               | `docs/KNOWN_ISSUES.md`                                                             |                                                                             |

When in doubt between knowledge and lint rule: ship knowledge first (cheap,
no false positives); promote to a rule only after the same mistake recurs
with a mechanically crisp signature.

## Step 3 — the contribution contract (violating any of these fails review/tests)

- **Prime directive: ZERO Fuselage values stored in the skill.** Token
  names + semantics are fine; hex/px/durations are not. Teach values as
  verify-at-use-time lookups (name the file/command to resolve from the
  installed package) — e.g. motion durations cite `.rcx-box--animated` in
  the compiled CSS rather than recording `0.18s` as truth.
- **Never mutate an existing resolver category's shape.** `valid-color-token`
  consumes `semantic`'s exact `{groupName, meta, keys}` array; other rules
  pin other shapes. Add NEW categories (e.g. `theme-colors` added
  `{name, groupName, light, dark}`) and wire them into `resolveCategory`,
  `resolveAll`, and the CLI's category list + printing.
- **Resolve live, from the installed package.** Theme values come from
  `@rocket.chat/fuselage-tokens/dist/*.json` (what `PaletteStyleTag`
  injects), vocabulary from installed `.d.ts`/exports — never from copies.
- **Shared (non-command) reference files** must be added to
  `SHARED_REFERENCE_FILES` in `test/command-table-sync.test.mjs`, or the
  orphan-file test fails on their mere presence. Do NOT add them to
  `command-metadata.json` — that file is strictly command→file mappings.
- **Wire knowledge into `adapters/claude-code/SKILL.md`** when it's a
  "gates can't catch this" class: a Setup step (read before deciding), a
  Laws row (the ban phrasing), and/or the escape-hatch pointer. Match the
  file's voice.
- **Tests**: `test/<name>.test.mjs` following existing patterns, registered
  in `test/run-tests.mjs`; resolver tests spawn the bin against
  `fixtures/consumer` (a real installed Fuselage). `npm test` must be fully
  green. Demo new categories with
  `node bin/fuselage-resolve.mjs <category>` from `fixtures/consumer`.

## Step 4 — ship

1. Branch off `main` (`feat/<gap-name>`); never commit to `main` directly.
2. Implement (knowledge files are usually written by the orchestrating
   agent — the lesson lives in its context; engine changes suit a builder
   subagent with this contract in the brief).
3. `npm test` green + resolver demo output in the report.
4. Commit with a body explaining which real-world failure motivated each
   change (the PR reads as "this bug will never recur"), push, open PR to
   `main`, merge on the user's word.
