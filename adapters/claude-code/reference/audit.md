# Audit (Evaluate)

Flagship conformance command. Runs the mechanical gate, then a judgment pass. Reports drift; makes no edits unless explicitly asked.

## Inherit first

- Load the SKILL.md law layer before doing anything else.
- Read the consumer's `package.json` and lockfile; confirm the installed `@rocket.chat/fuselage*` version. State it.
- Resolve every component, prop, and token reference from the installed package (`node_modules/@rocket.chat/fuselage*` types, token JSON, exports). Never use memory.

## Flow

1. **Setup.** Confirm installed Fuselage version. Resolve the target globs or paths to audit.

2. **Mechanical pass.** Run the gate with snapshot:
   ```
   fuselage-gate <target> --snapshot
   ```
   This writes `.fuselage-craft/audit/<iso>.json` with lint findings and rule counts. Capture the gate output. Two categories:

   - **Lint drift** (rules: `no-raw-color`, `no-literal-dimension`, `no-literal-shadow`, `require-field-wrapper` [error], `prefer-box` [warn]):
     - Literal color values in product code (hex, rgb, hsl, named CSS colors)
     - Literal dimension values (px, rem, em used directly for spacing, font-size, border-radius, box-shadow)
     - Inputs not wrapped in a `Field` / `FieldLabel` / `FieldRow` structure
     - Raw styled DOM where a Fuselage component ships (`<button>`, `<div>` standing in for `<Button>`, `<Modal>`, etc.)
     - Inline `style=` props carrying design values

   - **Type drift** (tsc `--noEmit` against installed Fuselage types):
     - `fontScale=` value not in the installed union (typo, stale name, invented value)
     - Nonexistent component imported from `@rocket.chat/fuselage*`
     - `color=` or `bg=` token name not in the installed type
     - `Button` used with a `variant=` string prop instead of boolean flags (`primary`, `secondary`, `danger`, `success`, `warning`)
     - Any other JSX prop that fails the installed type contract

   After the gate runs, **read the snapshot** from `.fuselage-craft/audit/<iso>.json`. Extract `lintRulesCount` to compute the rubric score (see Section below).

3. **Judgment pass.** What the gate cannot see -- requires reading the code and context:

   - **Wrong component choice.** Hand-rolled component where Fuselage ships one (e.g. a custom alert where `Callout` exists). Resolve the full component set with `resolve.mjs components` rather than recalling it.
   - **Weak hierarchy.** `fontScale` used in a way that inverts or collapses visual hierarchy (e.g., body text set to `h1`, labels set to `hero`).
   - **Color-only state.** State (error, selected, disabled, active) communicated by color alone with no icon, weight, or text reinforcement.
   - **Missing states.** Loading path lacks `Throbber`; error path lacks `Callout` or `FieldError`; empty path has no empty-state treatment.
   - **A11y gaps beyond Field.** Interactive elements missing accessible labels, focus management absent from modals or overlays, non-descriptive link/button text.
   - **Repeated composition.** The same multi-component pattern appears 3+ times and should be extracted into one shared component.
   - **Multiple primary actions.** More than one `<Button primary>` in the same view or modal, creating competing calls to action.

4. **Report.** Structured output in three sections:

   - **Section A -- Drift (mechanical).** Every gate finding, grouped by rule. Each entry: `file:line`, rule name, offending code snippet. Errors and warnings separated.
   - **Section B -- Judgment findings.** Each finding: severity (`high` / `med` / `low`), description, file reference, and the correct Fuselage pattern to replace it.
   - **Section C -- Prioritized fix list.** Ordered by severity. For each item, include the appropriate command to hand off to: `migrate` for raw-CSS / literal-value blocks, `polish` for missing states and empty-state gaps, `harden` for a11y and edge cases, `adapt` for literal breakpoints or media queries.

5. **Conformance summary line.** End the report with a single line, e.g.:
   ```
   Fuselage @X.Y.Z | literal values: N | type errors: N | missing Field: N | judgment findings: N (H high, M med, L low)
   ```

## Output

A structured conformance report (Sections A, B, C) plus the conformance summary line. No code changes. After the report, offer to:
- Fix all mechanical (Section A) drift -- hand off to `migrate`
- Fix state completeness gaps -- hand off to `polish`
- Hand the full report to the user for triage

## Close with the gate

Audit IS the mechanical gate pass. Step 2 runs `run-gate.mjs` as its primary instrument. There is no separate "close with gate" step: the gate output becomes Section A of the report, and the exit code (nonzero on lint errors or tsc failure) is the conformance verdict. Audit makes no edits; it does not need to re-run the gate at the end.

**Remember:** the gate is blind to component CHOICE and DEPRECATION — it proves existence + no literals, not "is this the API Fuselage wants now." So additionally: check for `*Legacy` imports (the `no-deprecated-fuselage-export` rule flags these when run via fuselage-gate), and for anything ambiguous about preferred component or variant, defer to the installed Fuselage's Storybook + docs rather than guessing.

## Fuselage specifics

Resolve the current vocabulary live, do not recall it: `fuselage-resolve all`. The type gate validates anything type-only (elevation, radius, spacing). Examples below are illustrative, not a catalog. This command reasons about Box (color, bg, fontScale, spacing, elevation props), Button (variants, sizes, states), Field family for form structure, Callout, Throbber, and hooks like useBreakpoints for responsive detection.

## Scoring rubric

After the mechanical pass, compute a conformance score using the snapshot's `lintRulesCount` field. Score across four dimensions, 0–4 each (total /16). For each dimension, count total findings across its rules:

- Score `0` if ≥10 findings
- Score `1` if 5–9 findings
- Score `2` if 2–4 findings
- Score `3` if 1 finding
- Score `4` if 0 findings

**Dimensions:**

1. **Literal density** — `fuselage-craft-gate/no-raw-color` + `fuselage-craft-gate/no-literal-dimension` + `fuselage-craft-gate/no-literal-shadow` + `fuselage-craft-gate/no-literal-media-query`
2. **Deprecated API** — `fuselage-craft-gate/no-deprecated-fuselage-export` + `fuselage-craft-gate/prefer-button` + `fuselage-craft-gate/prefer-box`
3. **Compositional completeness** — `fuselage-craft-gate/require-field-wrapper` + `fuselage-craft-gate/valid-color-token`
4. **Companion coverage** — `companions.missing.length` from the snapshot

**Total to severity:**

- **13–16** = **P3** (clean, minor polish only)
- **9–12** = **P2** (small drift, scoped fixes)
- **5–8** = **P1** (significant drift, plan a polish pass)
- **0–4** = **P0** (large drift, migrate / harden required)

## Close — re-run + delta

After applying any fixes flagged in the rubric / judgment pass, **re-run** `fuselage-gate <target> --snapshot`.
Read `.fuselage-craft/audit/latest.json` and the prior snapshot via `node src/audit-snapshot.mjs trend 2 --cwd <path>`.
Report to the user the per-rule delta for each `lintRulesCount` key that changed; flag any regressions (count went up).
If `findings[]` length is 0 and `companions.missing` is empty, close with: `audit clean. trend: <delta summary>`.
