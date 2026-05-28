# critique (Evaluate)

UX design review via heuristics. Does not write code or run the gate. Produce findings and recommendations grounded in Fuselage components and tokens.

## Inherit first

- Load the SKILL.md law layer. Confirm the installed @rocket.chat/fuselage version. Understand the feature intent and user flow.

## Flow

1. **Visual hierarchy.** Are the most important actions most prominent? Is `fontScale=` used correctly (h1 for page title, h3 for sections, p1/p2 for body)? Do color tokens distinguish primary from secondary? Check against Fuselage stories to confirm the idiom.

2. **Cognitive load.** Is the page overwhelming? Too many options, too much text, confusing grouping? Suggest consolidation, progressive disclosure via Tabs or Modal, or clearer affordances via icon + label on Buttons.

3. **Information architecture.** Can a user understand what to do first? Is the call-to-action clear? Use Fuselage components to re-order: primary `<Button primary>` at eye level, secondary actions smaller or in a Sidebar menu, less common options in an overflow menu.

4. **Affordances.** Do interactive elements look clickable? Are disabled states visually different (use `<Button disabled>`; gray, not color-only)? Do inputs have clear labels (`FieldLabel`) and hints (`FieldHint`)?

5. **Consistency with Fuselage.** Are you using Fuselage components (Button, Field, Callout, Modal, Tabs, etc.) or hand-rolling? Hand-rolled means potential for drift and inconsistency. Recommend using the system component.

6. **Accessibility posture.** Are labels paired with inputs (via `Field`)? Can keyboard users navigate (Tab, Enter, arrow keys work)? Are error messages clear (`FieldError`)? Does the design reduce motion where possible (honor `usePrefersReducedMotion`)?

## Output

Scored findings:
- HIGH: blocks shipping (e.g., no error state, disabled state is invisible, no labels on inputs)
- MED: polish opportunity (e.g., hierarchy weak, spacing off, cognitive load high)
- LOW: nice-to-have (e.g., could add icon to button, could improve loading feedback)

Each finding includes a recommendation that cites the Fuselage component or token by name. For example: "Use `<Callout type='danger'>` instead of a red alert box." or "Apply `fontScale='h2'` to section headers to strengthen hierarchy."

Optionally recommend running polish, harden, migrate, or clarify afterward depending on what you found.

## Snapshot — persist findings

After the heuristics scan, write a snapshot:

```
node src/audit-snapshot.mjs write --kind critique --slug <feature-slug> --input <findings.json>
```

Findings envelope:

```json
{ "lint": { "findings": [{ "ruleId": "<category>", "filePath": "<slug>", "line": 0, "messageId": "<short>", "severity": "warn" }] } }
```

Categories: `hierarchy`, `cognitive-load`, `ia`, `affordances`, `consistency`, `a11y`.

Output: `.fuselage-craft/critique/<slug>/<ISO>.json` + `latest.json`.

## Suppression

Accepted findings live in `.fuselage-craft/critique-ignore.md` (format mirrors `ignore.md` but per slug+category, with optional `contains:` substring match):

```markdown
## <slug>
- category: hierarchy
  contains: "specific phrase from finding message"
  reason: accepted — stylistic choice on this surface
```

Run `node src/critique-ignore.mjs .` to inspect entries. Suppression is applied before reporting; suppressed count is logged. `reason:` is required per entry — entries without it are skipped with a warning.

## No code, no gate

This command writes nothing and runs no gate. Hand off findings to the product team or to craft/polish/harden for implementation.

## Fuselage specifics

Resolve the current vocabulary live: `fuselage-resolve components semantic fontscale`. This review reasons about Button for action hierarchy (illustrative: primary, secondary, danger), Field family for label pairing, Callout for alerts, Modal and Tabs for structure, fontScale for hierarchy, semantic color tokens, and hooks like useBreakpoints for responsiveness.

## Close — re-run + trend

Re-run critique after addressing findings.

```
node src/audit-snapshot.mjs trend 5 --kind critique --slug <slug>
```

Shows trajectory across the last 5 runs. Report per-category delta to the user; flag any category whose count went up (regression).
