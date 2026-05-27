/**
 * Tests for findMissingSymbols() and collectNamedImportsFromSource() in src/resolve.mjs
 *
 * Pure-function tests — no I/O, no installed packages required.
 * Run via: node test/run-tests.mjs (from repo root)
 */

import assert from 'node:assert/strict';
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findMissingSymbols, collectNamedImportsFromSource, extractCompanionSymbolsFromBundle } from '../src/resolve.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load TypeScript the same way the resolver does: from the repo's own node_modules
const _require = createRequire(import.meta.url);
let ts;
try {
  ts = _require('typescript');
} catch {
  ts = null;
}

// ── Case 1: one symbol missing, one present ───────────────────────────────────
{
  const imports = { '@rocket.chat/fuselage-hooks': ['useStableCallback', 'useToggle'] };
  const exports = { '@rocket.chat/fuselage-hooks': ['useToggle'] };
  const result = findMissingSymbols(imports, exports);
  assert.deepEqual(result, [
    { companion: '@rocket.chat/fuselage-hooks', symbol: 'useStableCallback' },
  ]);
}

// ── Case 2: companion entirely absent from exports map ────────────────────────
{
  const imports = { '@rocket.chat/fuselage-hooks': ['useStableCallback', 'useResizeObserver'] };
  const exports = {}; // companion not installed
  const result = findMissingSymbols(imports, exports);
  assert.deepEqual(result, [
    { companion: '@rocket.chat/fuselage-hooks', symbol: 'useResizeObserver' },
    { companion: '@rocket.chat/fuselage-hooks', symbol: 'useStableCallback' },
  ]);
}

// ── Case 3: all imports present — empty result ────────────────────────────────
{
  const imports = { '@rocket.chat/fuselage-hooks': ['useToggle', 'useAutoFocus'] };
  const exports = { '@rocket.chat/fuselage-hooks': ['useToggle', 'useAutoFocus', 'useResizeObserver'] };
  const result = findMissingSymbols(imports, exports);
  assert.deepEqual(result, []);
}

// ── Case 4: multiple companions, mix of ok and missing ────────────────────────
{
  const imports = {
    '@rocket.chat/fuselage-hooks': ['useStableCallback', 'useToggle'],
    '@rocket.chat/icons': ['CircleIcon', 'StarIcon'],
    '@rocket.chat/css': ['css'],
  };
  const exports = {
    '@rocket.chat/fuselage-hooks': ['useToggle', 'useAutoFocus'], // missing useStableCallback
    '@rocket.chat/icons': ['CircleIcon', 'StarIcon', 'HeartIcon'],  // all present
    // @rocket.chat/css absent → css is missing
  };
  const result = findMissingSymbols(imports, exports);
  assert.deepEqual(result, [
    { companion: '@rocket.chat/css', symbol: 'css' },
    { companion: '@rocket.chat/fuselage-hooks', symbol: 'useStableCallback' },
  ]);
}

// ── Case 5: empty imports map ─────────────────────────────────────────────────
{
  const result = findMissingSymbols({}, { '@rocket.chat/fuselage-hooks': ['useToggle'] });
  assert.deepEqual(result, []);
}

// ── Case 6: output is sorted (companion then symbol) ─────────────────────────
{
  const imports = {
    '@rocket.chat/b-pkg': ['zSym', 'aSym'],
    '@rocket.chat/a-pkg': ['mSym', 'aSym'],
  };
  const exports = {}; // all missing
  const result = findMissingSymbols(imports, exports);
  assert.deepEqual(result, [
    { companion: '@rocket.chat/a-pkg', symbol: 'aSym' },
    { companion: '@rocket.chat/a-pkg', symbol: 'mSym' },
    { companion: '@rocket.chat/b-pkg', symbol: 'aSym' },
    { companion: '@rocket.chat/b-pkg', symbol: 'zSym' },
  ]);
}

// ── collectNamedImportsFromSource unit tests ──────────────────────────────────
if (ts) {
  // Synthetic ESM source with named imports, re-exports, and a namespace import
  const syntheticSource = [
    `import { useStableCallback, useToggle } from '@rocket.chat/fuselage-hooks';`,
    `export { Something } from '@rocket.chat/css';`,
    `import * as x from '@rocket.chat/icons';`,
    `import type { Foo } from '@rocket.chat/fuselage-hooks';`,
    `import { Bar as Baz } from '@rocket.chat/fuselage-hooks';`,
  ].join('\n');

  const result = collectNamedImportsFromSource(syntheticSource, ts);

  // fuselage-hooks: useStableCallback, useToggle, Bar (exported name of Bar as Baz)
  assert.ok(
    Array.isArray(result['@rocket.chat/fuselage-hooks']),
    'fuselage-hooks should be present',
  );
  const hooks = result['@rocket.chat/fuselage-hooks'];
  assert.ok(hooks.includes('useStableCallback'), 'should include useStableCallback');
  assert.ok(hooks.includes('useToggle'), 'should include useToggle');
  assert.ok(hooks.includes('Bar'), 'should include exported name Bar (from Bar as Baz)');
  assert.ok(!hooks.includes('Foo'), 'should NOT include type-only import Foo');

  // @rocket.chat/css: Something
  assert.ok(
    Array.isArray(result['@rocket.chat/css']),
    '@rocket.chat/css should be present',
  );
  assert.deepEqual(result['@rocket.chat/css'], ['Something']);

  // namespace import (import * as x) must NOT be collected
  assert.ok(
    !result['@rocket.chat/icons'],
    'namespace import @rocket.chat/icons should NOT appear in result',
  );
} else {
  process.stdout.write('  (skipping collectNamedImportsFromSource tests — typescript not available)\n');
}

// ── extractCompanionSymbolsFromBundle: synthetic bundle unit test ─────────────
// Verifies: bracket notation captured, dot notation captured,
//           RESERVED_MEMBERS (__esModule, default) excluded.
{
  const syntheticBundle = [
    // webpack require binding for fuselage-hooks
    `var h = __webpack_require__(/*! @rocket.chat/fuselage-hooks */ "@rocket.chat/fuselage-hooks");`,
    // reserved — must NOT appear in result
    `if (h.__esModule) { var x = h.default; }`,
    // bracket notation — must be captured
    `(0, h["useBracket"])();`,
    // dot notation — must be captured
    `h.useDot();`,
  ].join('\n');

  const result = extractCompanionSymbolsFromBundle(syntheticBundle, 'test-bundle.js');
  const hooksMap = result['@rocket.chat/fuselage-hooks'];

  assert.ok(
    hooksMap instanceof Map,
    'synthetic bundle: @rocket.chat/fuselage-hooks must be a Map',
  );
  assert.ok(
    hooksMap.has('useBracket'),
    'synthetic bundle: bracket-notation access h["useBracket"] must be captured',
  );
  assert.ok(
    hooksMap.has('useDot'),
    'synthetic bundle: dot-notation access h.useDot must be captured',
  );
  assert.ok(
    !hooksMap.has('__esModule'),
    'synthetic bundle: __esModule must NOT be captured (reserved member)',
  );
  assert.ok(
    !hooksMap.has('default'),
    'synthetic bundle: default must NOT be captured (reserved member)',
  );
  // Exact captured set should be exactly {useBracket, useDot}
  assert.deepEqual(
    [...hooksMap.keys()].sort(),
    ['useBracket', 'useDot'],
    'synthetic bundle: captured set must be exactly {useBracket, useDot}',
  );
}

// ── Integration guard: extractCompanionSymbolsFromBundle against real dev bundle ──
{
  const devBundlePath = join(__dirname, '../fixtures/consumer/node_modules/@rocket.chat/fuselage/dist/fuselage.development.js');
  if (!existsSync(devBundlePath)) {
    console.log('  (skipping bundle integration guard — dev bundle not present at fixture path)');
  } else {
    const bundleText = readFileSync(devBundlePath, 'utf8');
    const result = extractCompanionSymbolsFromBundle(bundleText, 'fuselage.development.js');

    // result['@rocket.chat/fuselage-hooks'] must be a Set containing useStableCallback
    const hooksSymbols = result['@rocket.chat/fuselage-hooks'];
    assert.ok(
      hooksSymbols instanceof Map,
      '@rocket.chat/fuselage-hooks must be a Map in the bundle extraction result',
    );
    assert.ok(
      hooksSymbols.has('useStableCallback'),
      'bundle extraction must detect useStableCallback in @rocket.chat/fuselage-hooks',
    );
  }
}

console.log('reconcile-companions: all tests passed');
