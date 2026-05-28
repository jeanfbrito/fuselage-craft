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

## `fuselage-resolve check-companions`

Reconciles the installed `@rocket.chat/fuselage`'s companion imports against the installed
companions' exported symbols. Specifically: it reads what fuselage's own source imports from
each companion package (`@rocket.chat/fuselage-hooks`, `@rocket.chat/css`,
`@rocket.chat/icons`, `@rocket.chat/fuselage-tokens`, etc.), and verifies those symbols are
present in the companion's installed `.d.ts`. Any symbol fuselage imports but the companion
does not export is reported as a missing symbol and the command exits nonzero.

This matters because consumers compile with `skipLibCheck`, so companion type files are not
checked during `tsc --noEmit` — a stale companion can export nothing of what fuselage calls and
the type gate stays green right up until runtime crashes. `check-companions` catches the
statically-visible cases before the app runs.

Note: `peerDependencies` cannot be used to select companion versions — fuselage declares all
companions as `"*"` (wildcard), which encodes no version contract. Version selection must be
done by co-bumping companions to releases published contemporaneously with the target fuselage
version.

```sh
fuselage-resolve check-companions
```

Exits zero when all companion symbols resolve. Exits nonzero and reports the missing symbols
and their source companions when any symbol is absent.

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

Runs three checks in sequence: **lint rules**, **`tsc --noEmit`** against your installed
Fuselage types, and **companion reconciliation** (`fuselage-resolve check-companions`). Exits
nonzero if lint errors > 0, tsc fails, OR a companion symbol is missing. All three must pass
for the gate to report clean.

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

## Snapshots

Write a timestamped snapshot of the gate's raw findings (lint, type, companions) to `.fuselage-craft/audit/` for historical tracking and trend analysis.

```sh
fuselage-gate 'src/**/*.tsx' --snapshot
# or
FUSELAGE_CRAFT_SNAPSHOT=1 fuselage-gate 'src/**/*.tsx'
```

Output directory: `.fuselage-craft/audit/`

Files written:
- `<ISO>.json` — immutable timestamped snapshot (e.g. `2026-05-28T14:32:10Z.json`), kept indefinitely
- `latest.json` — copy of the most recent snapshot, overwritten on each run

### Snapshot schema (v1)

```json
{
  "version": 1,
  "timestamp": "2026-05-28T14:32:10Z",
  "fuselageVersion": "0.32.0",
  "lintRulesCount": {
    "fuselage-craft-gate/no-raw-color": 3,
    "fuselage-craft-gate/prefer-button": 1
  },
  "findings": [
    {
      "rule": "fuselage-craft-gate/no-raw-color",
      "file": "src/legacy/old-banner.tsx",
      "line": 42,
      "column": 8,
      "messageId": "literal-hex",
      "severity": "error"
    }
  ],
  "typecheck": {
    "errorCount": 0,
    "files": []
  },
  "companions": {
    "missing": []
  },
  "totals": {
    "errors": 3,
    "warnings": 1,
    "filesScanned": 12
  }
}
```

**Field reference:**
- `version` — schema version (frozen to v1)
- `timestamp` — ISO 8601 run timestamp
- `fuselageVersion` — installed `@rocket.chat/fuselage` package version
- `lintRulesCount` — count of findings per rule ID
- `findings` — full ESLint message details (rule, file, line, column, messageId, severity)
- `typecheck` — TypeScript `tsc --noEmit` result (errorCount, files with errors)
- `companions` — companion reconciliation result (missing symbols)
- `totals` — aggregate error/warning/file counts (pre-ignore filter)

**Important:** snapshots store the **raw result** before the `--no-ignore` suppression filter is applied. This preserves ground truth for historical analysis.

### Inspecting snapshots

```sh
node src/audit-snapshot.mjs latest          # read latest.json
node src/audit-snapshot.mjs trend 5         # aggregate last 5 snapshots
```

## Suppression

Suppress individual findings or file globs without modifying code. Create `.fuselage-craft/ignore.md` in your project root.

```sh
fuselage-gate 'src/**/*.tsx'              # respect ignore.md by default
fuselage-gate 'src/**/*.tsx' --no-ignore  # skip ignore.md, report all findings
```

### Ignore file format

```markdown
# .fuselage-craft/ignore.md

## fuselage-craft-gate/no-raw-color
- path: src/legacy/old-banner.tsx
  line: 42
  reason: pinned surface until v25 upgrade

## fuselage-craft-gate/prefer-button
- path: src/legacy/*.tsx
  reason: full legacy folder; tracked by ticket FOO-123
```

**Rules:**
- Section header `## <rule-id>` — one rule per section (e.g. `fuselage-craft-gate/no-raw-color`)
- `path` — file or glob pattern (`*` matches any single path segment, `**` matches any depth including `/`)
- `line` — optional line number; if omitted, matches any line in the file
- `reason` — required; explains why the finding is suppressed. Missing reason → entry skipped + warning to stderr

**Example patterns:**
- `src/legacy/old-banner.tsx` — exact file match
- `src/legacy/*.tsx` — all `.tsx` files in `src/legacy/` (single depth)
- `src/legacy/**/*.tsx` — all `.tsx` files in `src/legacy/` and subdirectories
- `**/*.deprecated.tsx` — all `.deprecated.tsx` files anywhere

When suppressions apply, the gate logs:

```
[ignore] suppressed 5 finding(s) via .fuselage-craft/ignore.md
```

Exit code reflects **effective** findings (post-filter). Snapshot always stores **raw** findings (pre-filter) for audit trail.
