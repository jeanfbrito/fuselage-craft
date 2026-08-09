# Token semantics, component gotchas, and system-gap recipes

The type gate proves a token name exists; the lint gate proves no literal
snuck in. **Neither gate can prove the token means what you think it means.**
A pale badge-background token used as a solid status dot typechecks, lints
clean, and looks broken in light theme. This file is the semantic layer the
gates cannot enforce — consult it whenever picking tokens for status
artwork, badges, custom chrome, or motion.

Names below are Fuselage semantic token names — verify they still exist via
the resolver (`fuselage-resolve semantic`) before use; never trust this file
over the installed package.

## Intent → token family

| Intent                                               | Token family                                                                                     | Why                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Accent, progress fill, links                         | `font-info`                                                                                      | The accent blue; theme-resolved                                                                                              |
| Small solid status dot                               | `status-bullet-*` (e.g. `status-bullet-online`)                                                  | Designed as solid dots readable on any surface                                                                               |
| Solid badge (unread-style)                           | `badge-background-level-*`                                                                       | Designed as solid badge fills                                                                                                |
| **Never as a solid dot/fill**: `status-background-*` | —                                                                                                | These are pale _badge backgrounds_ meant to sit behind darker text; as a solid dot they wash out on light surfaces           |
| Subtle track/stroke behind an accent                 | `currentColor` + `stroke-opacity`/`opacity` ≈ 0.2                                                | Theme-proof; any explicit "light" token reads wrong in one theme                                                             |
| Custom button glyph color                            | The chain Fuselage's own `.rcx-button--icon` uses (`button-icon-color` → button-secondary chain) | Copy the resolved chain so custom controls match sibling `IconButton`s; `color: inherit` resolves to raw black in dark theme |

Two theme rules that bite:

- **A `var()` fallback hex is not the themed value.** Tokens resolve
  differently per theme; the fallback only shows when the palette failed to
  inject. Never eyeball-verify a color from its fallback.
- **Tokens are injected at runtime** (`PaletteStyleTag`), not present in the
  static compiled CSS. To verify a token's real per-theme values, resolve
  from the installed package (token JSON + theme maps), not from grep-ing
  `fuselage.css`.

## Motion policy

Fuselage exposes **no duration token**, so durations are the one place a
literal is unavoidable. The rule: use Fuselage's own standards, verified at
use-time from the installed compiled CSS — do not invent durations.

- Micro-interactions (size/opacity/state changes): the duration
  `.rcx-box--animated` uses (`transition: all …` — currently 0.18s; verify:
  `grep -o 'rcx-box--animated{[^}]*' node_modules/@rocket.chat/fuselage/dist/fuselage.css`).
- Overlay enter/exit (dropdown, tooltip): the duration the dropdown
  enter/exit classes use (currently 0.3s; verify the same way).
- Every transition/animation ships with the guard Fuselage itself applies:
  `@media (prefers-reduced-motion) { transition: none; }` (see also the
  `usePrefersReducedMotion` hook for JS-driven motion).

## Component gotchas (pass both gates, still break)

- **`Select` and other react-aria-backed inputs require a visible label,
  `aria-label`, or `aria-labelledby`** — react-aria's `useSelect` recognizes
  only those props; a labeled wrapper element does not satisfy it and it
  throws the accessibility warning at runtime.
- **Icons render as font glyphs**: `<Icon name='download' />` emits an `<i>`
  with class `rcx-icon--name-download` — a CSS class, not a DOM attribute.
  Tests and queries must target the class.
- **Icon source of truth** for geometry/custom artwork:
  `node_modules/@rocket.chat/icons/dist/svg/*.svg` (the font is built from
  these). When custom artwork must align with a glyph's internal geometry,
  derive coordinates from the SVG source, not from screenshots.
- **`IconButton` square sizes** come from `rcx-button--<size>-square` rules
  in the compiled CSS (`medium`/`small`/`tiny`) — resolve the actual pixel
  values there when custom chrome must match; do not assume.

## When Fuselage genuinely lacks it (custom-chrome recipes)

Custom artwork (progress rings, window-chrome buttons, indicator glyphs) is
the legitimate escape hatch — these recipes keep it conformant:

- Color always flows through a token chain: `var(--rcx-color-<token>, …)`
  with the token first; treat the fallback as a failure display, not the
  design value.
- Tracks/strokes that must read in both themes: `currentColor` at low
  opacity, never a hardcoded "light gray".
- Custom buttons copy the resolved color chain of the nearest Fuselage
  equivalent (see intent table) so they can't drift from real controls.
- SVG progress arcs: `stroke-dasharray = circumference`,
  `stroke-dashoffset = circumference × (1 − progress)`, dashoffset
  transition at the micro-interaction duration; indeterminate = fixed
  quarter arc + 1s linear spin. Beware: the SVG `transform` attribute maps
  to the CSS `transform` property, so a CSS `transform-origin` stacks onto
  an origin already baked into `rotate(a cx cy)` and silently displaces the
  artwork out of the viewBox — keep start-angle rotation as an attribute on
  the shape, and scope `transform-box: fill-box; transform-origin: center`
  to the animating state only.
- State conveyed by the artwork (e.g. a filling ring) still needs a
  non-color channel (label, percent text, tooltip) — Law 11 applies to
  custom chrome too.
