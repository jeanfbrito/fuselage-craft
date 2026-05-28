/**
 * Tests for src/eslint-plugin/prefer-button.mjs
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

import rule from '../src/eslint-plugin/prefer-button.mjs';

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

tester.run('prefer-button', rule, {
  valid: [
    // Real navigation link — not flagged
    {
      code: `const C = () => <a href="/settings">Settings</a>;`,
      filename: 'comp.tsx',
    },
    // Real/dynamic href with onClick — legitimate navigation with analytics handler
    {
      code: `const C = () => <a href={url} onClick={track}>Open</a>;`,
      filename: 'comp.tsx',
    },
    // Fuselage Button — not flagged
    {
      code: `const C = () => <Button primary>Save</Button>;`,
      filename: 'comp.tsx',
    },
  ],

  invalid: [
    // Raw <button> — always a hand-rolled button
    {
      code: `const C = () => <button onClick={save}>Save</button>;`,
      filename: 'comp.tsx',
      errors: [{ messageId: 'preferButton' }],
    },
    // <a href="#"> — fake link
    {
      code: `const C = () => <a href="#" onClick={remove}>Remove</a>;`,
      filename: 'comp.tsx',
      errors: [{ messageId: 'preferButton' }],
    },
    // onClick with no href — clickable non-link
    {
      code: `const C = () => <a onClick={pause}>Pause</a>;`,
      filename: 'comp.tsx',
      errors: [{ messageId: 'preferButton' }],
    },
    // role="button"
    {
      code: `const C = () => <a role="button" onClick={x}>Go</a>;`,
      filename: 'comp.tsx',
      errors: [{ messageId: 'preferButton' }],
    },
    // javascript: href
    {
      code: `const C = () => <a href="javascript:void(0)" onClick={x}>X</a>;`,
      filename: 'comp.tsx',
      errors: [{ messageId: 'preferButton' }],
    },
  ],
});

console.log('prefer-button: all tests passed');
