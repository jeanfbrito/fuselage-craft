# polish (Refine)

Final quality pass before shipping. Complete all states, tighten spacing rhythm, verify hierarchy, ensure consistent elevation. Introduce no new literal values.

## Inherit first

- Load the SKILL.md law layer. Confirm the installed @rocket.chat/fuselage version. Resolve every component/prop/token from the installed package, never memory.

## Backlog from latest audit

Load `.fuselage-craft/audit/latest.json`. If missing, instruct the user to run `audit` first; do not proceed without a snapshot.

Sort `lintRulesCount` descending; the top-3 rules with count > 0 = P0 backlog.

Group findings by file. For each file in a P0 group, fix each violation via Fuselage primitives (no new literals; cross-check with the laws table in SKILL.md).

Re-run the gate with `--snapshot`. The new snapshot must show ≤ prior counts for every fixed rule.

Read trend across last 3 snapshots and report the per-rule delta to the user.

### When backlog is empty

If all `lintRulesCount` keys are 0, proceed straight to the existing polish steps below.

## Code hygiene

After backlog drained AND before visual polish:
- No `console.log` / `console.warn` / `console.debug` in production paths (tests/dev tools OK)
- No `any` / `unknown` casts added by this change (existing ones flagged but not required to fix here — link to a separate ticket)
- No unused imports / unused variables introduced by this change (leave pre-existing untouched per surgical-change rule)
- No commented-out code blocks dropped in by mistake
- No `TODO` / `FIXME` without a ticket reference

Hygiene gate runs via the existing lint pass — if your IDE-on-save adds debug statements, gate will fail.

## Flow

1. **States.** For every interactive element, add: loading state (`Button loading` or `Throbber`); empty state with contextual copy; error state (`Callout` or `FieldError` for inputs); disabled state; hover and focus-visible. Nothing should disappear or become broken when in a non-happy-path state.

2. **Spacing rhythm.** Walk the layout and verify all padding, margin, gap use the `x*` scale (x4, x8, x12, x16, x24, x32). Tighten any jagged gaps. Use logical props: `pi`, `pb`, `mi`, `mb` (never left/right/top/bottom). No literal px anywhere.

3. **Type hierarchy.** Check `fontScale=` names match weight and context: h1/h2/h3 for headers, p1/p2 for body, micro for footnotes. Use the Fuselage stories to confirm the idiom.

4. **Elevation.** Hover and focus states often use `elevation='1'` or `elevation='2'`. Modal, popover, dropdown: confirm they use the right elevation depth. No literal box-shadow.

5. **Icon and color pairing.** If color conveys state (danger red), pair it with an icon or text. Never state-by-color-alone.

6. **Dark mode and themes.** Render in light, dark, and high-contrast. All colors must be semantic token names passed as bare prop values: `color='default'`, `bg='surface-tint'` (or bare `bg='tint'`), `borderColor='error'`; the design system resolves them correctly. Never pass `color='font-default'` or `borderColor='stroke-error'` — the Box transforms prepend the prefix, so those forms double-prefix and produce invalid tokens.

## Output

Polish passes are zero-breaking refines. The feature is already functional; now it is complete and shipworthy.

## Close with the gate

Run `fuselage-gate <target>`. Type gate (tsc) and lint gate must both pass. Warnings are OK; errors are not. Done when green.

**Remember:** the gate proves symbols exist and that no literal values were used, but cannot prove the *preferred*, non-deprecated component was chosen. When polishing, additionally check for `*Legacy` imports (the `no-deprecated-fuselage-export` rule flags these via fuselage-gate), and for ambiguous component choices, consult the installed Fuselage's Storybook + docs.

## Fuselage specifics

Resolve the current vocabulary live: `fuselage-resolve components semantic fontscale spacing elevation radius`. Type gate is authoritative for spacing, elevation, radius. This pass polishes Button states (illustrative: loading, primary, disabled), Throbber, Callout, FieldError, and applies semantic color tokens and spacing rhythm.
