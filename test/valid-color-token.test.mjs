/**
 * Tests for src/eslint-plugin/valid-color-token.mjs
 *
 * Run via: node test/run-tests.mjs (from repo root)
 *
 * The rule is a NO-OP unless a `palette` option is injected (run-gate.mjs does
 * this with the live resolver output). All cases below pass a synthetic palette
 * that mirrors the shape of resolveCategory("semantic").
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const req = createRequire(resolve(repoRoot, 'package.json'));
const { RuleTester } = req('eslint');
const tseslint = req('typescript-eslint');

import rule from '../src/eslint-plugin/valid-color-token.mjs';

// Synthetic palette mirroring resolveCategory("semantic") output.
//   text       → color=        (bare names)
//   surface    → bg=           (bare + surface- prefixed)
//   stroke     → borderColor=  (bare names)
//   statusColor→ color=        (full names)
//   status     → bg=           (full status-background-* names)
const palette = [
  { groupName: 'text', meta: { prop: 'color=' }, keys: ['default', 'hint'] },
  { groupName: 'surface', meta: { prop: 'bg= / backgroundColor=' }, keys: ['light', 'tint'] },
  { groupName: 'stroke', meta: { prop: 'borderColor=' }, keys: ['light', 'medium'] },
  { groupName: 'statusColor', meta: { prop: 'color=' }, keys: ['success', 'danger'] },
  { groupName: 'status', meta: { prop: 'bg=' }, keys: ['status-background-success'] },
  // unmapped groups must be ignored by buildSets
  { groupName: 'badge', meta: null, keys: ['primary'] },
  { groupName: 'shadow', meta: null, keys: ['elevation-1'] },
];

const opts = [{ palette }];

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

tester.run('valid-color-token', rule, {
  valid: [
    // --- NO-OP guard: no palette option at all ---
    {
      code: `const C = () => <Box color="font-default" bg="totally-made-up" />;`,
      filename: 'comp.tsx',
    },
    // --- NO-OP guard: empty palette array ---
    {
      code: `const C = () => <Box color="garbage" />;`,
      filename: 'comp.tsx',
      options: [{ palette: [] }],
    },
    // valid bare color name
    {
      code: `const C = () => <Box color="default" />;`,
      filename: 'comp.tsx',
      options: opts,
    },
    // statusColor full name valid for color=
    {
      code: `const C = () => <Box color="success" />;`,
      filename: 'comp.tsx',
      options: opts,
    },
    // bg= accepts bare form
    {
      code: `const C = () => <Box bg="light" />;`,
      filename: 'comp.tsx',
      options: opts,
    },
    // bg= accepts full surface- form
    {
      code: `const C = () => <Box bg="surface-tint" />;`,
      filename: 'comp.tsx',
      options: opts,
    },
    // backgroundColor= behaves like bg=
    {
      code: `const C = () => <Box backgroundColor="surface-light" />;`,
      filename: 'comp.tsx',
      options: opts,
    },
    // bg= accepts status-background-* full name
    {
      code: `const C = () => <Box bg="status-background-success" />;`,
      filename: 'comp.tsx',
      options: opts,
    },
    // valid bare borderColor name
    {
      code: `const C = () => <Box borderColor="medium" />;`,
      filename: 'comp.tsx',
      options: opts,
    },
    // raw CSS literal is no-raw-color's job — skip here
    {
      code: `const C = () => <Box color="var(--rcx-color-font-default)" />;`,
      filename: 'comp.tsx',
      options: opts,
    },
    // hex literal skipped (raw)
    {
      code: `const C = () => <Box color="#156FF5" />;`,
      filename: 'comp.tsx',
      options: opts,
    },
    // dynamic expression (variable) — skipped
    {
      code: `const C = ({ c }) => <Box color={c} />;`,
      filename: 'comp.tsx',
      options: opts,
    },
    // non-target prop ignored
    {
      code: `const C = () => <Box fontScale="font-default" />;`,
      filename: 'comp.tsx',
      options: opts,
    },
    // valid string literal in braces
    {
      code: `const C = () => <Box color={"hint"} />;`,
      filename: 'comp.tsx',
      options: opts,
    },
    // conditional with both branches valid
    {
      code: `const C = ({ on }) => <Box color={on ? "default" : "hint"} />;`,
      filename: 'comp.tsx',
      options: opts,
    },
  ],

  invalid: [
    // double-prefix on color=
    {
      code: `const C = () => <Box color="font-default" />;`,
      filename: 'comp.tsx',
      options: opts,
      errors: [{ messageId: 'doublePrefix' }],
    },
    // double-prefix on borderColor=
    {
      code: `const C = () => <Box borderColor="stroke-light" />;`,
      filename: 'comp.tsx',
      options: opts,
      errors: [{ messageId: 'doublePrefix' }],
    },
    // unknown color token
    {
      code: `const C = () => <Box color="nope" />;`,
      filename: 'comp.tsx',
      options: opts,
      errors: [{ messageId: 'unknownToken' }],
    },
    // unknown bg token
    {
      code: `const C = () => <Box bg="nope" />;`,
      filename: 'comp.tsx',
      options: opts,
      errors: [{ messageId: 'unknownToken' }],
    },
    // unknown borderColor token
    {
      code: `const C = () => <Box borderColor="nope" />;`,
      filename: 'comp.tsx',
      options: opts,
      errors: [{ messageId: 'unknownToken' }],
    },
    // unknown token inside braces
    {
      code: `const C = () => <Box color={"nope"} />;`,
      filename: 'comp.tsx',
      options: opts,
      errors: [{ messageId: 'unknownToken' }],
    },
    // conditional with one bad branch
    {
      code: `const C = ({ on }) => <Box color={on ? "default" : "bogus"} />;`,
      filename: 'comp.tsx',
      options: opts,
      errors: [{ messageId: 'unknownToken' }],
    },
    // both conditional branches bad → two reports
    {
      code: `const C = ({ on }) => <Box color={on ? "font-default" : "bogus"} />;`,
      filename: 'comp.tsx',
      options: opts,
      errors: [{ messageId: 'doublePrefix' }, { messageId: 'unknownToken' }],
    },
  ],
});

console.log('valid-color-token: all tests passed');
