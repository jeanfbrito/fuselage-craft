# ESLint plugin reference

The lint half of the [gate](cli.md). Seven **value-free** rules: they ban literal design-value
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
      'fuselage-craft-gate/require-field-wrapper': 'warn',
      'fuselage-craft-gate/prefer-box': 'warn',
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
| `no-literal-media-query` | error | Literal `@media` queries in css/styled templates and `matchMedia()` breakpoint string literals |
| `require-field-wrapper` | warn | Input controls not inside a `<Field>` ancestor |
| `prefer-box` | warn | Raw DOM elements (`div`, `span`, …) with inline `style={{}}` |
| `valid-color-token` | error | Invalid / double-prefixed Fuselage color token names — **needs the live palette via [`fuselage-gate`](cli.md)** |

## `valid-color-token` and the live palette

`valid-color-token` is the one rule that needs Fuselage data: the live color palette, which
`fuselage-gate` injects from `resolve.mjs` at run-time. Without an injected palette it is a
complete **no-op** — it never false-positives on a standalone `eslint` run. That's why the
config above leaves it `off` and you rely on `fuselage-gate` to enforce it.

It catches two mistakes the type gate can miss in string positions:

- **Double-prefix** — `color='font-default'` when the Box transform already adds `font-`
  (use the bare `color='default'`); likewise `borderColor='stroke-…'`.
- **Unknown token** — a color/bg/borderColor string that isn't in the installed palette.

## Why value-free

The structural rules never read a Fuselage value, so a Fuselage release can't break them and
can't make them stale — they ban literal *patterns* (any hex, any px), not specific values.
Token correctness is the type gate's job; these rules just keep literals out of the code in the
first place.
