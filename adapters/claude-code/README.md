# fuselage-craft — Claude Code adapter

Claude Code skill adapter for the [fuselage-craft toolkit](../../README.md).

This adapter wires the toolkit's CLI tools into Claude Code commands (`audit`, `migrate`,
`craft`, `polish`, etc.) so Claude can resolve Fuselage tokens, run the lint gate, and
run the type gate when working on a consumer product repo.

## What this adapter does

- Defines the command router and laws in [`SKILL.md`](./SKILL.md).
- Provides per-command flow files in [`reference/`](./reference/).
- Shells out to the toolkit CLIs:
  - `fuselage-resolve <category>` — live resolver
  - `fuselage-gate <globs>` — lint + type gate

The adapter holds **no Fuselage vocabulary** of its own. All token/component/hook names
come from the resolver at run-time.

The `fuselage-resolve` and `fuselage-gate` commands must be reachable. Add the toolkit as a project devDep (`npm i -D github:jeanfbrito/fuselage-craft`) and call the bins via `npx`/package scripts, or `npm link` it globally from a clone. The Claude Code adapter shells out to these commands.

## Install into Claude Code (symlink)

```sh
# Clone the toolkit
git clone https://github.com/jeanfbrito/fuselage-craft ~/tools/fuselage-craft
cd ~/tools/fuselage-craft && npm install

# Symlink this adapter into your Claude Code skills directory
mkdir -p ~/.claude/skills
ln -s ~/tools/fuselage-craft/adapters/claude-code ~/.claude/skills/fuselage-craft
```

Claude Code will automatically discover the skill from `~/.claude/skills/fuselage-craft/SKILL.md`.

## Usage

Invoke from within a product repo that depends on `@rocket.chat/fuselage`:

```
/fuselage-craft audit src/**
/fuselage-craft migrate src/components/LegacyToolbar.tsx
/fuselage-craft craft "invite-members dialog"
/fuselage-craft polish src/views/Channel
```

If the first word is not a command, the whole input is treated as a general
Fuselage-craft request under the laws defined in `SKILL.md`.

## Commands

| Command | Category | What it does |
|---|---|---|
| `audit` | Evaluate | Run gate with snapshot; 4-dim 0-4 rubric; re-run trend |
| `critique` | Evaluate | UX heuristic snapshot + suppression + trend; no gate, no edits |
| `shape` | Build | Discovery interview + composition tree; STOP after output |
| `craft` | Build | Shape-confirm ≠ code-green; visual iteration loop; user close |
| `migrate` | Fix | Convert legacy raw-CSS / hex / hand-rolled UI |
| `clarify` | Fix | Fix UX copy and labels; handoff to polish on green |
| `adapt` | Fix | Make it responsive via fuselage-hooks; handoff to polish on green |
| `polish` | Refine | Drain audit backlog (top-3 rules) + code hygiene |
| `harden` | Refine | Edge cases, i18n, RTL, a11y, input validation; handoff to polish |

## Snapshots, suppression, and trend

Snapshot storage enables trend-aware polish and audit replay. Ignore files let accepted drift survive without `eslint-disable` clutter. Critique snapshots are per-feature-slug.

- **Snapshots:** The gate writes timestamped findings (raw, pre-suppression) to `.fuselage-craft/audit/` and `.fuselage-craft/critique/<slug>/` for historical analysis and regression detection.
- **Suppression:** `.fuselage-craft/ignore.md` (audit) and `.fuselage-craft/critique-ignore.md` (critique) suppress findings by rule + path glob + optional line number, with required reason. Gate reports effective (post-suppress) count; snapshots store raw (pre-suppress) for audit trail.
- **Trend:** Re-run commands after fixes to capture deltas. `audit` and `critique` both report per-rule/per-category delta and flag regressions (count went up).

See [`docs/cli.md`](../../docs/cli.md) for the engine reference (snapshot schema, ignore format, CLI flags).

## Stop points

The skill halts for user confirmation at these gates:

1. **After `shape` output (never auto-proceed to `craft`)** — the composition tree is a plan, not a green light. User must confirm or modify before craft builds.
2. **Before `craft` writes code** — shape-confirm ≠ code-green. Confirm token + state plan and component vocabulary separately from shape acceptance.
3. **End of `craft`** — user-facing close with open question. No silent handoff to next command.

## Toolkit CLIs (what Claude shells out to)

| CLI | Source | What it does |
|---|---|---|
| `fuselage-resolve [category]` | `src/resolve.mjs` | Resolve token/component names from installed packages |
| `fuselage-gate [globs]` | `src/run-gate.mjs` | Run lint + type gate; support `--snapshot` and `--no-ignore` flags |

When running from source (not npm-linked):

```sh
node ~/tools/fuselage-craft/bin/fuselage-resolve.mjs all
node ~/tools/fuselage-craft/bin/fuselage-gate.mjs 'src/**/*.tsx' --snapshot
FUSELAGE_CRAFT_SNAPSHOT=1 node ~/tools/fuselage-craft/bin/fuselage-gate.mjs 'src/**/*.tsx'
```
