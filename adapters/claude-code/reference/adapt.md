# adapt (Fix)

Responsive behavior via Fuselage hooks, not literal media queries. Replace hardcoded breakpoint px with `useBreakpoints` / `useMediaQuery`. Logical spacing. Mobile vs desktop composition.

## Inherit first

- Setup per SKILL.md has run: version pinned, vocabulary resolved live from the installed package — never memory.
- Examine the installed `@rocket.chat/fuselage-hooks` export and breakpoint schema.

## Source-context audit

Identify what the existing design assumed:
- Screen size baseline (mobile-first? desktop-first?)
- Input method (touch / mouse / keyboard / mixed)
- Connection assumption (online-always? offline-capable?)
- Density assumption (sparse / dense / dashboard-grade)

Write the inferred assumption set as a one-liner. If the *adapt target* (e.g. mobile) contradicts an assumption, that assumption is the cut line — restructure, do not just resize.

## Flow

1. **Replace media query px.** Any `@media (min-width: 768px)` or hardcoded breakpoint becomes `useBreakpoints()` or `useMediaQuery()`. Read the hook signature from the installed package. Never hardcode breakpoint values.

2. **useBreakpoints hook.** Read its actual signature and return shape from the installed `.d.ts` before using it — run `fuselage-resolve hooks breakpoints` and check the installed types. Do not assume a shape from memory. Use the result to conditionally render or drive Box props.

3. **useMediaQuery hook.** For custom media queries that don't fit standard breakpoints (e.g., aspect ratio, pointer-hover). Pass a media query string; get a boolean.

4. **Responsive Box props.** Box props are plain CSS-typed, not responsive arrays. Check the installed Box types for how each prop accepts values, and drive layout differences across breakpoints via hook-conditional props (e.g. compute the prop value from `useBreakpoints()` / `useMediaQuery()` before passing it to Box).

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
