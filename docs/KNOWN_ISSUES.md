# Known Issues

Permanent platform/dependency constraints for fuselage-craft. Each entry: status, workaround,
affected files, reference.

## Companion check has no coverage on minified-only fuselage installs

- Status: WONTFIX (inherent to webpack minification). Fail-safe, not a false-positive risk.
- Detail: `reconcileCompanions` (`src/resolve.mjs`) reconciles the companion symbols fuselage
  imports against the companion's installed exports by scanning fuselage's compiled bundle. It
  reads symbols from the webpack DEV bundle (`dist/fuselage.development.js`), where
  `__webpack_require__(/*! @rocket.chat/pkg */ "...")` binds a readable namespace var
  (`fuselage_hooks_1`) and symbols appear as `fuselage_hooks_1.useStableCallback` /
  `(0, fuselage_hooks_1.useStableCallback)`. In the PRODUCTION bundle
  (`dist/fuselage.production.js`) those names are minified and the `/*! pkg */` comments are
  stripped, so the extractor returns zero symbols.
- Why it is safe: `fuselageJsFiles()` prefers the dev bundle and stops at the first hit, so the
  dev bundle is scanned whenever shipped (the standard `@rocket.chat/fuselage` tarball ships
  both). A prod-only install yields zero extracted symbols -> no false positives. The check must
  emit a "no coverage — rely on runtime launch" note in that case, never a confident pass.
- Workaround: the companion check is a complement, not a guarantee. The load-bearing guarantee
  is co-bumping the whole @rocket.chat/fuselage* + css-in-js + icons + memo family to
  contemporaneous versions PLUS a mandatory runtime app launch (required upgrade done-criterion).
- Affected files: `src/resolve.mjs` (`fuselageJsFiles`, `extractCompanionSymbolsFromBundle`,
  `reconcileCompanions`), `src/run-gate.mjs`, `adapters/claude-code/reference/upgrade.md`.
- Reference: verified May 2026 against @rocket.chat/fuselage 0.78.0 dist bundles.

## Companions without a types entry cannot be reconciled (e.g. @rocket.chat/icons)

- Status: WONTFIX (no type surface to read exports from).
- Detail: reconciliation needs the companion's exported-symbol set, read from its `.d.ts` via
  `resolveTypesEntry` + TS `getExportsOfModule`. `@rocket.chat/icons` ships no `types`/`typings`
  field, so it is recorded under `skipped` rather than false-positived. In practice fuselage only
  uses `icons_1.default` (a default import, no named symbols), so there is nothing to reconcile.
- Why it is safe: skipping a companion with no readable exports avoids reporting every imported
  symbol as "missing". Default-export and dynamic-access usage are invisible to the static check
  by design.
- Workaround: same as above — runtime launch covers default exports and dynamic access.
- Affected files: `src/resolve.mjs` (`resolveTypesEntry`, `reconcileCompanions` skip path).
- Reference: verified May 2026 against @rocket.chat/icons (no types entry) + fuselage 0.78.0.
