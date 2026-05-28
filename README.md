# fuselage-craft

An **agent skill** for designing and refining UI in products that consume
`@rocket.chat/fuselage` — without ever drifting from the design system. You point it at a
screen, a component, or a feature idea; it works in Fuselage components and token references,
proves conformance with a hard gate, and refuses to invent design values.

> Today the skill ships as a Claude Code adapter ([`adapters/claude-code/`](adapters/claude-code/)).
> The skill contract is agent-agnostic; more adapters can wrap the same engine.

## Prime directive: reference, never replicate

**Fuselage is the source of truth — resolved live from the installed package.**

- No token snapshot, no manifest, no hardcoded value — not in the skill, not in the code it
  produces.
- Anything it needs about a component, prop, or token, it resolves from the **installed
  package** at use-time. The package is always more current than any copy.
- Correctness comes from pointing at the real thing, not from remembering it.

How that holds up in practice — three live mechanisms, all reading the installed package:

1. **Resolve, don't recall.** Component / token / hook names come from the live resolver, read
   from the installed packages. The skill bakes in zero Fuselage vocabulary.
2. **The type gate enforces.** Emitted JSX must typecheck against the installed Fuselage
   types, so a wrong prop or token is a compile error, not a guess.
3. **The lint gate kills literals.** Raw hex, px, shadows, and hand-rolled inputs are banned
   by value-free rules.

So product code references token names (`color='default'`, `p='x16'`, `<Button primary>`), the
value resolves inside Fuselage at runtime, and a token change propagates everywhere with no
consumer edit.

## Commands

Invoke as `/fuselage-craft <command> <target>`. Everything after the command is the target;
if the first word isn't a command, the whole input is handled as a general request under the
laws. Every command pins the installed Fuselage version, resolves vocabulary live, and (where
it writes code) closes by running the gate.

| Command | Group | What it does | Edits | Gate |
|---|---|---|:---:|:---:|
| `audit` | Evaluate | **Flagship.** Type + lint gate against the installed package, then a judgment pass; reports drift with file:line | no | yes |
| `critique` | Evaluate | UX heuristic review — hierarchy, cognitive load, IA, a11y posture | no | no |
| `shape` | Build | Plan a feature as a Fuselage component composition tree | no | no |
| `craft` | Build | Shape, confirm, then build the feature end to end under the laws | yes | yes |
| `migrate` | Fix | Convert legacy / raw-CSS / hand-rolled UI into Fuselage + token refs (map by role, never by value) | yes | yes |
| `upgrade` | Fix | Upgrade the installed Fuselage version across releases, fixing breaking changes hop-by-hop (type gate detects, resolver diff maps renames) | yes | yes |
| `clarify` | Fix | Fix UX copy, labels, error and helper messages — words only, never values | yes | yes |
| `adapt` | Fix | Make it responsive via `fuselage-hooks`, not media-query literals | yes | yes |
| `polish` | Refine | Complete the states: loading, empty, error, hover, focus | yes | yes |
| `harden` | Refine | Edge cases, i18n, RTL, a11y, error / disabled / loading paths | yes | yes |

```sh
/fuselage-craft audit src/**
/fuselage-craft migrate src/components/LegacyToolbar.tsx
/fuselage-craft craft "invite-members dialog"
/fuselage-craft polish src/views/Channel
```

The agent contract — the full laws, the output guarantees, the anti-drift test, and what to
do when Fuselage lacks something — lives in [`adapters/claude-code/SKILL.md`](adapters/claude-code/SKILL.md).
Per-command flows are in [`adapters/claude-code/reference/`](adapters/claude-code/reference/).

## The laws (in brief)

Generated or modified product code carries **no literal design values** and reaches for the
real component first:

| Forbidden | Use instead |
|---|---|
| Literal hex / rgb | `color=` / `bg=` semantic token name |
| Literal px spacing / margin / padding | `p` / `m` / `pi` / `pb` on the `x*` scale |
| `font-size` / `font-weight` / `line-height` | `fontScale=` name |
| Literal `box-shadow` | `elevation=` name |
| Literal `border-radius` px | `borderRadius=` scale name |
| Hand-rolled `<button>` / `<a>`-as-button / styled `<div>` button | `<Button primary\|secondary\|danger>` |
| Hand-wired `<label>` + `<input>` | `<Field>` + `<FieldLabel>` + `<FieldRow>` |
| Literal media query / breakpoint px | `useBreakpoints` / `useMediaQuery` |
| Component / prop not in the installed types | surface as a Fuselage extension, don't hand-roll |
| State conveyed by color alone | color + weight / icon / text |

The **anti-drift test**: *would a Fuselage maintainer say "that is not how you use Fuselage"?*
If yes, it failed.

## Install

Two pieces: the **skill** (the agent loads it) and the **engine** (the bins the skill shells
out to, installed in the product repo you're working on).

**Requirements:** Node `>=20`; a product repo with `@rocket.chat/fuselage*` installed.

### 1. The skill

Clone once and link the adapter into your agent's skills directory:

```sh
git clone https://github.com/jeanfbrito/fuselage-craft ~/tools/fuselage-craft
cd ~/tools/fuselage-craft && npm install

# Claude Code:
ln -s ~/tools/fuselage-craft/adapters/claude-code ~/.claude/skills/fuselage-craft
```

### 2. The engine

The skill calls `fuselage-resolve` and `fuselage-gate`. Make them reachable from the product
repo — install straight from GitHub (no publish step; plain ESM, no build):

```sh
# in your product repo
npm i -D github:jeanfbrito/fuselage-craft
# the skill then calls the bins via npx
```

Or link the clone globally so the bins are on PATH everywhere:

```sh
cd ~/tools/fuselage-craft && npm link
```

`eslint`, `typescript`, and `typescript-eslint` are **peer dependencies** — the engine uses the
copies already in your project, so the gate runs against your exact versions. npm 7+ installs
missing peers automatically.

## How "done" is proven

Every command that writes code closes with the gate, run against the installed package — never
a copy:

- **Type gate (authoritative).** `tsc --noEmit` validates emitted JSX against the installed
  Fuselage types. A wrong prop, token, or component is a compile error. Drift is impossible if
  it typechecks.
- **Lint gate.** Catches what types can't: raw hex, literal px, styled `<div>` over `<Box>`,
  inputs outside `<Field>`. Value-free rules — they ban patterns, not specific Fuselage values.
- **Companion gate.** Reconciles the symbols fuselage's own bundle imports from companion
  packages (`fuselage-hooks`, `css-in-js`, …) against each installed companion's exports —
  catches a missing companion symbol (a runtime crash the type gate can't see under
  `skipLibCheck`) before it ships. Mostly relevant after a version bump; see `upgrade`.

You can also run the gate standalone (CI, pre-commit, non-agent workflows) — it doesn't need
the skill. See **[docs/cli.md](docs/cli.md)** for `fuselage-resolve` / `fuselage-gate` /
type-gate usage, and **[docs/eslint-plugin.md](docs/eslint-plugin.md)** for wiring the rules
into your own ESLint config.

## Keeping in sync with Fuselage

The skill tracks Fuselage **automatically** — it holds no copy, so most releases need no action.

**Auto-tracked (do nothing):**

- New / renamed / removed tokens, components, hooks — resolved live on the next run.
- New / changed prop or token types — the type gate validates against the installed types.
- Literal-value rules — value-free, so Fuselage releases never affect them.

**The one manual surface:** `src/resolve.mjs` hardcodes *structural access paths* — the package
specifiers, the `colors.mjs` / `typography.mjs` subpaths, and the `Palette` sub-object keys
(`surface`, `text`, `stroke`, `status`, …). Only a Fuselage **packaging restructure** touches
these, and the failure mode is safe: a broken path makes that resolver category report
`unavailable`, and the type gate still enforces correctness — the skill degrades, it never
silently produces wrong output.

**Verify after a Fuselage major bump:**

```sh
fuselage-resolve all          # every category resolves (no "unavailable")
node test/run-tests.mjs       # lint rules still green
```

## Repo layout

| Path | What |
|------|------|
| [`adapters/claude-code/`](adapters/claude-code/) | The skill — `SKILL.md` (laws + router), `reference/` (per-command flows) |
| `src/` | The engine — `resolve.mjs`, `eslint-plugin/`, `run-gate.mjs`, `typecheck.mjs` |
| `bin/` | The `fuselage-resolve` / `fuselage-gate` CLIs |
| [`docs/`](docs/) | Engine reference — [CLI](docs/cli.md), [ESLint plugin](docs/eslint-plugin.md) |
| `test/`, `fixtures/` | Rule test suites and a sample Fuselage-consuming fixture |

## License

MIT — see [LICENSE](LICENSE).
