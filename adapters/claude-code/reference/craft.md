# craft (Build)

Build a feature end to end under the laws. Shape first, then code using Fuselage components. Cover all states.

## Shape confirmation is not code green

A confirmed shape brief lets you **plan**, not **type**.
Before writing code, confirm separately:
- The **token + state plan** — which Fuselage tokens for color/spacing/elevation, which state coverage (idle/loading/error/empty/success)
- The **component composition** — exact Fuselage component names per surface, verified against installed types via `fuselage-resolve`

Treat any ambiguity in either as a second STOP. Ask the user; do not guess.

## Inherit first

- Load the SKILL.md law layer. Confirm the installed @rocket.chat/fuselage version. Resolve every component, prop, and token from the package.

## Flow

1. **Shape or load.** Run shape first (or load an existing shape plan). Confirm the component tree, token strategy, state coverage, and a11y approach with the user. Do not skip this. Shape is the contract.

2. **Build the component tree.** Use Fuselage components first: Button, Field/FieldLabel/FieldRow/FieldError, Callout, Modal, Tabs, Table, Avatar, Tile, Throbber. Never hand-roll a button, label, error message, or modal. Then Box with semantic props. Never raw HTML.

3. **Apply tokens.** Every design value comes from the installed package as a token name, never a literal hex/px/size:
   - Colors: `color=` / `bg=` with semantic names (font-default, surface-tint, stroke-light, status-background-danger, etc.).
   - Spacing: `p` / `m` / `pi` / `pb` / `mi` / `mb` on x* scale only (x4, x8, x12, x16, x24, x32).
   - Type: `fontScale=` name (h1, h2, h3, h4, h5, p1, p1m, p1b, p2, c1, c2, micro).
   - Shadows: `elevation=` name (0, 1, 2) not literal `box-shadow`.
   - Corners: `borderRadius=` name (small, medium, large, extra-large, full) not px.

4. **Cover all states.** Implement loading (Button `loading`, `Throbber`, or state machine). Implement empty (custom UI with icon and copy, or `Callout`). Implement error (`Callout` or `FieldError` on inputs). Implement disabled (component `disabled` prop). Implement success (check icon, `Callout type='success'`). Nothing silently disappears.

5. **Responsive via hooks.** Use `useBreakpoints()` or `useMediaQuery()` for adaptive layouts. No hardcoded media query px. Honor `usePrefersReducedMotion()` for animation.

6. **Accessibility wired.** Inputs inside `Field` + `FieldLabel`. Labels have clear `htmlFor`. Focus order is logical. Keyboard shortcuts (Tab, Enter, Escape) work. Error messages are crisp (`FieldError`). Icons have `aria-label`. Test with a screen reader briefly.

7. **Resolve from the package.** If a prop or token is not in the installed types, STOP. Do not invent it. Surface as a blocker - the extension belongs in the Fuselage repo, not product code.

8. **Dark mode and themes.** All colors are semantic tokens that resolve correctly across light, dark, and high-contrast themes. The code has no conditional logic for theming (no "if dark mode then use this hex"). The tokens handle it.

## Output

A complete, state-rich feature built entirely with Fuselage components and token references. Code passes the type gate and lint gate. Feature is production-ready.

## Close with the gate

Run `fuselage-gate <target>`. Type gate (`tsc --noEmit`) must pass (no type errors). Lint gate must pass (no raw hex, no literal px, no hand-rolled components, no missing Field wrappers). Warnings are OK; errors stop the build. Repeat until green. Then deploy.

## Visual iteration loop

Lint/type gate green is necessary, not sufficient. After gate passes:
- Use the `verify` or `run` skill to launch the consumer app and navigate to the feature
- Take a screenshot or browser snapshot of each state (idle / loading / error / empty / success)
- Compare each shot to the shape plan: do component vocab, state coverage, and spacing rhythm match?
- For any divergence, patch and re-gate. Repeat until shape and rendered surface agree

If the consumer app cannot be launched in this environment, document the gap and flag for manual verification.

## Fuselage specifics

Resolve the current vocabulary live: `fuselage-resolve all`. Type gate is authoritative for spacing, elevation, radius. This build uses Box for layout, Button for actions (illustrative: primary, secondary, danger variants), Field family for form structure, Callout for messages, Throbber for loading, and containers like Modal, Tabs, Table. Responsive behavior via hooks (illustrative: useBreakpoints, useMediaQuery, usePrefersReducedMotion). Semantic tokens (resolve the full set with resolve.mjs) for color, spacing on x* scale, fontScale, elevation, and borderRadius.

## Close — present to user

End with a structured walkthrough:
- **What was built** — composition tree + state list (1-line each)
- **What's covered** — gate green + states verified
- **What's deferred** — anything outside scope; quote the shape brief's "out of scope" line if present
- **Open question** — "Anything not working as you expected?"

Do not close silently. The user is the final reviewer.
