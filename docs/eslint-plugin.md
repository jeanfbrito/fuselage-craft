# ESLint plugin reference

The lint half of the [gate](cli.md). Nine **value-free** rules: they ban literal design-value
patterns and enforce structural conventions — they hold no Fuselage values of their own.

Wire them into your own flat config to get the structural rules in your editor and CI; run the
full set (including the live-palette `valid-color-token`) via [`fuselage-gate`](cli.md).

## Wiring into your config

```js
// eslint.config.mjs
import fuselageCraftGate from 'fuselage-craft/eslint-plugin';

export default [
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'fuselage-craft-gate': fuselageCraftGate },
    rules: {
      'fuselage-craft-gate/no-raw-color': 'error',
      'fuselage-craft-gate/no-literal-dimension': 'error',
      'fuselage-craft-gate/no-literal-shadow': 'error',
      'fuselage-craft-gate/no-literal-media-query': 'error',
      'fuselage-craft-gate/require-field-wrapper': 'warn',
      'fuselage-craft-gate/prefer-box': 'warn',
      'fuselage-craft-gate/prefer-button': 'warn',
      // valid-color-token needs the live palette — leave off here, run it via fuselage-gate
      'fuselage-craft-gate/valid-color-token': 'off',
    },
  },
];
```

## Rules

| Rule | Severity | What it flags |
|---|---|---|
| `no-raw-color` | error | Hex / rgb / rgba / hsl literals in JSX color attrs, `style={{}}`, `css` / `styled` templates |
| `no-literal-dimension` | error | Literal px / rem in style/css/styled — spacing, sizing, `borderRadius`, `fontSize`/`fontWeight`/`lineHeight`, `gap` |
| `no-literal-shadow` | error | Literal `boxShadow` / `box-shadow` values |
| `no-literal-media-query` | error | Literal `@media` queries in css/styled templates, `@media` string keys in emotion object-css (`css={{…}}`, `styled.x({…})`), and `matchMedia()` breakpoint string literals |
| `require-field-wrapper` | warn | Input controls not inside a `<Field>` ancestor |
| `prefer-box` | warn | Raw DOM elements (`div`, `span`, …) with inline `style={{}}` |
| `prefer-button` | warn | Raw `<button>` or `<a>`-as-button (`href="#"`/`javascript:`, `onClick` without `href`, `role="button"`) — use Fuselage `<Button>` |
| `valid-color-token` | error | Invalid / double-prefixed Fuselage color token names — **needs the live palette via [`fuselage-gate`](cli.md)** |
| `no-deprecated-fuselage-export` | warn | A deprecated Fuselage import (`*Legacy` when the base exists) — **needs the live deprecated set via [`fuselage-gate`](cli.md)** |

## Resolver-injected rules (`valid-color-token` and `no-deprecated-fuselage-export`)

Both `valid-color-token` and `no-deprecated-fuselage-export` need live data from the installed
Fuselage package, which `fuselage-gate` injects from `resolve.mjs` at run-time. Without their
respective injected options they are complete **no-ops** — they never false-positive on a
standalone `eslint` run.

## `valid-color-token` and the live palette

`valid-color-token` needs the live color palette injected as the `palette` option.
Without it, it is a complete **no-op** — it never false-positives on a standalone `eslint` run.
That's why the config above leaves it `off` and you rely on `fuselage-gate` to enforce it.

It catches two mistakes the type gate can miss in string positions:

- **Double-prefix** — `color='font-default'` when the Box transform already adds `font-`
  (use the bare `color='default'`); likewise `borderColor='stroke-…'`.
- **Unknown token** — a color/bg/borderColor string that isn't in the installed palette.

## Suppression

Individual findings can be suppressed via `.fuselage-craft/ignore.md` without modifying code or adding inline `eslint-disable` comments. Suppression is applied at the gate layer (post-lint, pre-report), and the effective finding count drives the exit code. Raw findings (pre-suppression) are always captured in the snapshot for audit trail.

See [`docs/cli.md`](cli.md) for the ignore format and `--no-ignore` flag to bypass suppression.

## Why value-free

The structural rules never read a Fuselage value, so a Fuselage release can't break them and
can't make them stale — they ban literal *patterns* (any hex, any px), not specific values.
Token correctness is the type gate's job; these rules just keep literals out of the code in the
first place.
