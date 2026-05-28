# adapt (Fix)

Responsive behavior via Fuselage hooks, not literal media queries. Replace hardcoded breakpoint px with `useBreakpoints` / `useMediaQuery`. Logical spacing. Mobile vs desktop composition.

## Inherit first

- Load the SKILL.md law layer. Confirm the installed @rocket.chat/fuselage version. Examine the installed `@rocket.chat/fuselage-hooks` export and breakpoint schema.

## Source-context audit

Identify what the existing design assumed:
- Screen size baseline (mobile-first? desktop-first?)
- Input method (touch / mouse / keyboard / mixed)
- Connection assumption (online-always? offline-capable?)
- Density assumption (sparse / dense / dashboard-grade)

Write the inferred assumption set as a one-liner. If the *adapt target* (e.g. mobile) contradicts an assumption, that assumption is the cut line — restructure, do not just resize.

## Flow

1. **Replace media query px.** Any `@media (min-width: 768px)` or hardcoded breakpoint becomes `useBreakpoints()` or `useMediaQuery()`. Read the hook signature from the installed package. Never hardcode breakpoint values.

2. **useBreakpoints hook.** Returns an object with boolean flags for each breakpoint (xs, sm, md, lg, xl). Use it to conditionally render or apply Box props. Example: `const { lg } = useBreakpoints(); return <Box p={lg ? 'x24' : 'x16'}>...</Box>`.

3. **useMediaQuery hook.** For custom media queries that don't fit standard breakpoints (e.g., aspect ratio, pointer-hover). Pass a media query string; get a boolean.

4. **Responsive Box props.** Box accepts responsive arrays on certain props (p, m, gap, etc.). Use them instead of nested ternaries. Confirm syntax from the installed types.

5. **usePrefersReducedMotion.** If the design has motion (e.g., slide-in, fade, spin), honor `usePrefersReducedMotion()` and skip or soften the animation. Respect user preferences.

6. **Logical spacing.** Use `pi`, `pb`, `mi`, `mb` (inline and block) instead of `paddingLeft`, `marginRight`. This makes layouts RTL-safe automatically.

7. **Mobile vs desktop composition.** Sidebar menu becomes a hamburger menu on mobile (use `useBreakpoints()` to show/hide). List becomes a card grid on desktop. Confirm the layout shift with the design.

## Output

Responsive behavior driven entirely by hooks and token names. No literal media query syntax. No hardcoded breakpoint px. Layouts adapt smoothly.

## Verify on real surface

Gate green is necessary, not sufficient. Before closing:
- Open the feature on a real device of the target class (or browser devtools device emulation if no hardware available)
- Rotate (portrait / landscape) — layout must not break
- Confirm touch targets ≥ 44×44 dp via the Fuselage primitives in use
- Confirm `usePrefersReducedMotion` consumers respect the OS setting

Log a one-line confirmation per device tested before handing off.

## Close with the gate

Run `fuselage-gate <target>`. Type gate and lint gate must pass. Warnings OK. Confirm no literal media queries remain. Done when green.

## Fuselage specifics

Resolve the current vocabulary live: `fuselage-resolve hooks breakpoints`. This pass drives responsive behavior through hooks (illustrative: useBreakpoints for breakpoint flags, useMediaQuery for custom queries, usePrefersReducedMotion for motion preferences), Box responsive props, logical spacing, and semantic color tokens.

## Close

When adapt feels native per context AND gate is green, suggest `/polish` for state + rhythm pass. Do not run polish yourself.
