# Upgrade (Fix)

Bump `@rocket.chat/fuselage` to a target version by walking the version ladder with adaptive
stride, using the type gate as the breaking-change detector and the resolver vocab diff as the
rename oracle, committing a green checkpoint per hop.

## Inherit first

- Load the SKILL.md law layer. Confirm the installed `@rocket.chat/fuselage` version. Resolve
  every component, prop, and token from the installed package, never memory.

## Core insight

The type gate (`fuselage-gate`) run against a *bumped* install turns every removed or renamed
component, prop, or token the project uses into a compile error with `file:line` — that is the
work list, produced for free from the real package, not from a stored migration map. The resolver
vocab diff (`fuselage-resolve diff before.json after.json`) names what disappeared and what
appeared in the same hop, narrowing the rename search. No migration map is stored anywhere in
this skill. Prime directive: reference, never replicate.

## Preconditions

Before bumping anything:

1. **Baseline must be green.** Run `fuselage-gate 'src/**/*.{ts,tsx}'` on the current installed
   version. If it fails, STOP — fix the baseline first. Errors after a bump cannot be attributed
   to the bump if the baseline was already broken.
2. **Record current version.** Note the exact `@rocket.chat/fuselage` version from `package.json`
   (or lockfile). This is the ladder's start point.
3. **Clean working tree.** Confirm `git status` shows no uncommitted changes. Every hop commits
   a checkpoint; a dirty tree makes rollback ambiguous.

## Target and version ladder

```sh
npm view @rocket.chat/fuselage versions --json
```

Filter the result to stable releases: exclude any entry containing `-rc`, `-next`, `-alpha`,
`-beta`, or any other prerelease tag. From the filtered list, find the slice from current to
target (inclusive). These are the MINOR versions that define the ladder steps. In the `0.x`
line, minors carry breaking changes; patches within a minor are safe to skip.

Note: Fuselage packages are NOT co-versioned. `@rocket.chat/fuselage-hooks`,
`@rocket.chat/fuselage-tokens`, and related packages have independent version lines. At each
hop, resolve the correct peer versions for that hop's `@rocket.chat/fuselage` by reading the
target version's `peerDependencies` from the registry — do not assume matching numbers.

```sh
npm view @rocket.chat/fuselage@<target-version> peerDependencies
```

## Adaptive stride loop

The loop runs until the ladder's target is reached. Start with an aggressive stride (several
minors). Each iteration:

### 1. Snapshot vocabulary before the bump

```sh
fuselage-resolve all --json > before.json
```

### 2. Bump

Update `@rocket.chat/fuselage` in `package.json` to `current + stride`. Resolve peer package
versions from the target's `peerDependencies`; update those entries too. Then:

```sh
npm install
```

If `npm install` exits with a peer-dependency conflict that cannot be resolved cleanly, treat
this the same as an error storm (see step 5 below): roll back and halve the stride.

### 3. Snapshot vocabulary after the bump and diff

```sh
fuselage-resolve all --json > after.json
fuselage-resolve diff before.json after.json
```

The diff output lists vocabulary items that were removed and items that were added in this hop.
Keep it — it is the rename oracle for step 4.

### 4. Run the gate

```sh
fuselage-gate 'src/**/*.{ts,tsx}'
```

Capture full output. Every type error and lint error is a broken site caused by this hop.

### 5. Branch on error volume

**Tractable (small, understandable errors):** Fix them using the fix-knowledge priority order
(below). Re-run `fuselage-gate` after each fix pass and iterate until the gate exits zero. Then
commit a checkpoint:

```sh
git add package.json package-lock.json src   # the bump + the migrated call sites
git commit -m "chore(deps): fuselage <from>→<to> + migrate breaking changes"
```

Keep or grow the stride for the next iteration.

**Error storm / install conflict / unintelligible:** Roll back to the last checkpoint:

```sh
git checkout package.json package-lock.json   # or git reset --hard HEAD if nothing committed yet
npm install
```

Halve the stride. Retry from step 1. Reduce to a stride of one (single minor) when the errors
remain dense — this is expected in regions of high churn.

### Termination

Loop until the current version equals the target. The final state: all hops committed as
checkpoints, `fuselage-gate` green on the target version.

## Fix-knowledge priority

Apply in this order when resolving errors from a hop. Every fix must itself pass the gate — no
raw hex, no literal px, no styled div, no bare input outside Field. The gate enforces this
automatically on re-run.

1. **Resolver vocab diff first.** A name that appears in the "removed" list paired with a name in
   the "added" list with an overlapping role is a rename candidate. Confirm the shape against the
   new type before applying (the new Fuselage type is the authority, not the diff alone).

2. **Changelog / changeset BREAKING prose.** Fetch the hop's changelog from GitHub for the
   affected package:

   ```
   https://raw.githubusercontent.com/RocketChat/fuselage/main/packages/<pkg>/CHANGELOG.md
   ```

   Read the entries covering the hop's version range. BREAKING sections state the intended
   migration. There is no official codemod — apply the migration manually based on what the prose
   describes.

3. **Type-driven fix.** When the diff and changelog are ambiguous, the new Fuselage type
   declaration is the ground truth. The expected prop name, its union, its required shape — satisfy
   it. Read the installed `.d.ts`; do not guess.

4. **`@deprecated` hint, if present.** The JSDoc `@deprecated` tag is stripped at build and is
   effectively absent from the shipped `.d.ts`. Treat it as opportunistic only: if it happens to
   survive in the installed types, use it; never rely on it as the primary migration oracle.

## What the gate cannot catch

Be explicit and honest here. The type gate turns GREEN and lint passes GREEN when:

- A token keeps its name but its meaning or rendered value changes between versions.
- A component keeps its prop but its default value or render behavior changes.
- A visual composition that was correct at the old version looks wrong at the new one.

These are **behavioral breaks** that require human review. For each hop, extract the
changelog's BREAKING and behavioral-change notes into a checklist and hand it to the user:

```
Behavioral review checklist — hop <from>→<to>
[ ] <note from changelog about changed default / behavior / visual shift>
[ ] <...>
```

Recommend a visual check (Storybook, screenshot diffing, or manual review of affected
surfaces) for hops with behavioral notes. Do not claim the gate covers behavior.

## Done criteria

The upgrade is complete when:

- `fuselage-gate 'src/**/*.{ts,tsx}'` exits zero on the target version (type + lint clean).
- Every hop from start to target exists as a `git commit` checkpoint in the branch history.
- The behavioral-flag checklist covering all changelog BREAKING and behavioral notes across
  the full hop range has been handed to the user for review.

## Output

Per hop: the resolver diff (removed / added vocabulary), the gate result (error count or
"clean"), and the git checkpoint commit. At completion: the full behavioral-flag checklist for
the user.

## Close with the gate

Run `fuselage-gate [globs]` on the target version and confirm exit zero before declaring the
upgrade done. If it exits nonzero, the ladder is not finished — continue the loop.
