/**
 * Tests for src/eslint-plugin/no-deprecated-fuselage-export.mjs
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const req = createRequire(resolve(repoRoot, 'package.json'));
const { RuleTester } = req('eslint');
const tseslint = req('typescript-eslint');

import rule from '../src/eslint-plugin/no-deprecated-fuselage-export.mjs';
import { findDeprecatedPairs } from '../src/resolve.mjs';

// ─── Unit tests for findDeprecatedPairs ───────────────────────────────────────

{
  // SelectLegacy + Select → pair detected
  const result = findDeprecatedPairs(['Box', 'Select', 'SelectLegacy', 'Menu']);
  assert.deepStrictEqual(result, [
    { name: 'SelectLegacy', replacement: 'Select', reason: 'legacy alias — prefer the base component' },
  ]);
}

{
  // TopBarV2 without a base TopBar → not flagged (V2 has no Legacy suffix)
  const result = findDeprecatedPairs(['TopBarV2', 'Box']);
  assert.deepStrictEqual(result, []);
}

{
  // TopBar + TopBarV2 → not flagged (V2 suffix, not Legacy)
  const result = findDeprecatedPairs(['TopBar', 'TopBarV2']);
  assert.deepStrictEqual(result, []);
}

{
  // Multiple Legacy pairs — both detected, sorted
  const result = findDeprecatedPairs(['A', 'ALegacy', 'B', 'BLegacy', 'C']);
  assert.deepStrictEqual(result, [
    { name: 'ALegacy', replacement: 'A', reason: 'legacy alias — prefer the base component' },
    { name: 'BLegacy', replacement: 'B', reason: 'legacy alias — prefer the base component' },
  ]);
}

{
  // Legacy with no matching base → not flagged
  const result = findDeprecatedPairs(['SelectLegacy']);
  assert.deepStrictEqual(result, []);
}

{
  // Empty input → empty output
  const result = findDeprecatedPairs([]);
  assert.deepStrictEqual(result, []);
}

// ─── RuleTester ───────────────────────────────────────────────────────────────

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      project: false,
    },
  },
});

tester.run('no-deprecated-fuselage-export', rule, {
  valid: [
    // Non-deprecated import — no error
    {
      code: `import { Select } from '@rocket.chat/fuselage';`,
      filename: 'comp.tsx',
      options: [{ deprecated: [{ name: 'SelectLegacy', replacement: 'Select', reason: 'legacy alias — prefer the base component' }] }],
    },
    // NO-OP without injected options: deprecated import must not flag
    {
      code: `import { SelectLegacy } from '@rocket.chat/fuselage';`,
      filename: 'comp.tsx',
      // no options at all
    },
    // NO-OP with empty deprecated array
    {
      code: `import { SelectLegacy } from '@rocket.chat/fuselage';`,
      filename: 'comp.tsx',
      options: [{ deprecated: [] }],
    },
    // Import from a non-fuselage package — not flagged
    {
      code: `import { SelectLegacy } from 'some-other-package';`,
      filename: 'comp.tsx',
      options: [{ deprecated: [{ name: 'SelectLegacy', replacement: 'Select' }] }],
    },
    // Default import from fuselage — not flagged (only named specifiers)
    {
      code: `import Fuselage from '@rocket.chat/fuselage';`,
      filename: 'comp.tsx',
      options: [{ deprecated: [{ name: 'SelectLegacy', replacement: 'Select' }] }],
    },
    // Namespace import — not flagged
    {
      code: `import * as F from '@rocket.chat/fuselage';`,
      filename: 'comp.tsx',
      options: [{ deprecated: [{ name: 'SelectLegacy', replacement: 'Select' }] }],
    },
  ],

  invalid: [
    // Named deprecated import → error with replacement
    {
      code: `import { SelectLegacy } from '@rocket.chat/fuselage';`,
      filename: 'comp.tsx',
      options: [{ deprecated: [{ name: 'SelectLegacy', replacement: 'Select', reason: 'legacy alias — prefer the base component' }] }],
      errors: [{ messageId: 'deprecatedExport', data: { name: 'SelectLegacy', replacement: 'Select' } }],
    },
    // Deprecated import alongside non-deprecated — only the deprecated one flagged
    {
      code: `import { Select, SelectLegacy, Box } from '@rocket.chat/fuselage';`,
      filename: 'comp.tsx',
      options: [{ deprecated: [{ name: 'SelectLegacy', replacement: 'Select' }] }],
      errors: [{ messageId: 'deprecatedExport', data: { name: 'SelectLegacy', replacement: 'Select' } }],
    },
    // Deprecated import with null replacement → deprecatedExportUnknown message
    {
      code: `import { OldComponent } from '@rocket.chat/fuselage';`,
      filename: 'comp.tsx',
      options: [{ deprecated: [{ name: 'OldComponent', replacement: null }] }],
      errors: [{ messageId: 'deprecatedExportUnknown', data: { name: 'OldComponent' } }],
    },
    // Import from a fuselage sub-path also flagged
    {
      code: `import { SelectLegacy } from '@rocket.chat/fuselage/some-sub-path';`,
      filename: 'comp.tsx',
      options: [{ deprecated: [{ name: 'SelectLegacy', replacement: 'Select' }] }],
      errors: [{ messageId: 'deprecatedExport', data: { name: 'SelectLegacy', replacement: 'Select' } }],
    },
  ],
});

console.log('no-deprecated-fuselage-export: all tests passed');
