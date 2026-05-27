# fuselage-craft — Claude Code adapter

Claude Code skill adapter for the [fuselage-craft toolkit](../../README.md).

This adapter wires the toolkit's CLI tools into Claude Code commands (`audit`, `migrate`,
`craft`, `polish`, etc.) so Claude can resolve Fuselage tokens, run the lint gate, and
run the type gate when working on a consumer product repo.

## What this adapter does

- Defines the command router and laws in [`SKILL.md`](./SKILL.md).
- Provides per-command flow files in [`reference/`](./reference/).
- Shells out to the toolkit CLIs:
  - `npx fuselage-resolve <category>` — live resolver
  - `npx fuselage-gate <globs>` — lint + type gate

The adapter holds **no Fuselage vocabulary** of its own. All token/component/hook names
come from the resolver at run-time.

## Install into Claude Code (symlink)

```sh
# Clone the toolkit
git clone https://github.com/RocketChat/fuselage-craft ~/tools/fuselage-craft
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
| `audit` | Evaluate | Run the gate + judgment pass; report drift, no edits |
| `critique` | Evaluate | UX heuristic review; no gate, no edits |
| `shape` | Build | Plan as a Fuselage component tree; no code |
| `craft` | Build | Shape then build end to end; runs gate |
| `migrate` | Fix | Convert legacy raw-CSS / hex / hand-rolled UI |
| `clarify` | Fix | Fix UX copy and labels |
| `adapt` | Fix | Make it responsive via fuselage-hooks |
| `polish` | Refine | Complete loading/error/empty states |
| `harden` | Refine | Edge cases, i18n, RTL, a11y |

## Toolkit CLIs (what Claude shells out to)

| CLI | Source | What it does |
|---|---|---|
| `npx fuselage-resolve [category]` | `src/resolve.mjs` | Resolve token/component names from installed packages |
| `npx fuselage-gate [globs]` | `src/run-gate.mjs` | Run lint + type gate |

When running from source (not npm-linked):

```sh
node ~/tools/fuselage-craft/bin/fuselage-resolve.mjs all
node ~/tools/fuselage-craft/bin/fuselage-gate.mjs 'src/**/*.tsx'
```
