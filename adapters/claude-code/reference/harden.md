# harden (Refine)

Production-readiness. Cover edge cases, i18n, RTL, error paths, all through Fuselage. No hand-rolled fallbacks or shortcuts.

## Inherit first

- Load the SKILL.md law layer. Confirm the installed @rocket.chat/fuselage version. Resolve every component/prop/token from the installed package, never memory.

## Flow

1. **Edge cases.** Long text (truncate with `Box` or Typography component wrapping, not hard `max-width`). Zero items (show empty state with `Callout` or well-formed empty placeholder). Many items (pagination or virtualization). Overflow (clip or scroll via logical Box props, never hardcoded values).

2. **Internationalization.** No concatenated strings. Use proper i18n keys. Numbers, dates, currency: use `Intl` or the app's i18n library. No hardcoded locale assumptions. Test with RTL locale (Arabic, Hebrew) to catch right-to-left regressions.

3. **Logical spacing (RTL-safe).** Use `pi` (padding-inline-start), `pb` (padding-block-start), `mi` (margin-inline-start), `mb` (margin-block-start). Never `paddingLeft`, `marginRight`, or literal left/right. The layout flips automatically in RTL.

4. **Performance resilience.** Event listeners (incl. `window`/`document`) cleaned up in `useEffect` return. Long-running operations (fetch, debounce, intervals) accept `AbortSignal` and abort on unmount. Rapid user input debounced (search field) or throttled (scroll/resize handlers). Optimistic updates have an explicit rollback path on failure. Concurrent submits prevented (button disabled while pending, or idempotent backend keys).

5. **Input validation.** Use Fuselage `<Field>` family's existing validation props (`error`, `state`) for visual signal — do not invent error styling. Validation runs client-side for UX feedback AND server-side for trust. Bound inputs to safe ranges via Fuselage component props (`maxLength`, `step`, `min`, `max` on the underlying control — confirm via `fuselage-resolve forms`). Sanitize before rendering user content (never raw HTML interpolation). Surface validation errors via `<FieldError>` — never inline ad-hoc red text.

6. **Error and disabled paths.** Every input, button, field has an error state (via `FieldError`), a disabled state, and a loading state. Test them. Error messages are specific and actionable.

7. **Failure and empty states.** Network errors, permission denied, no results: show `Callout` or custom empty state. Never silently hide content or show a blank screen.

8. **Accessibility.** Keyboard navigation (Tab, Enter, arrow keys, Escape) works. Focus order is logical. All labels use `FieldLabel` paired with inputs in `Field`. Honor `usePrefersReducedMotion` (no auto-play, no flashing, no parallax). Test with a screen reader (even a quick scan).

## Output

Hardening passes make the feature robust. It survives edge cases, works globally, is accessible, and degrades gracefully when things break.

## Close with the gate

Run `fuselage-gate <target>`. Type gate and lint gate must pass. Warnings OK. Done when green.

## Fuselage specifics

Resolve the current vocabulary live: `fuselage-resolve components forms hooks semantic`. The type gate is authoritative. This pass hardens through Field family for a11y, Callout for edge-case messages, hooks like useBreakpoints and usePrefersReducedMotion for responsive and preference-aware behavior, logical spacing, and semantic color tokens.

## Close

When edge cases covered and gate green, hand off to `/polish` for state + visual rhythm pass.
