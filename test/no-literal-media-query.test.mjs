/**
 * Tests for src/eslint-plugin/no-literal-media-query.mjs
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

import rule from '../src/eslint-plugin/no-literal-media-query.mjs';

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

tester.run('no-literal-media-query', rule, {
  valid: [
    // Hook usage — not flagged
    {
      code: `const w = useBreakpoints();`,
      filename: 'comp.tsx',
    },
    // matchMedia with a variable arg — not flagged
    {
      code: `const m = matchMedia(query);`,
      filename: 'comp.tsx',
    },
    // css template with no @media — not flagged
    {
      code: `const S = styled.div\`color: red;\`;`,
      filename: 'comp.tsx',
    },
    // matchMedia with a non-breakpoint string — not flagged
    {
      code: `const m = window.matchMedia('print');`,
      filename: 'comp.tsx',
    },
    // plain object (not a style/css context) — not flagged
    {
      code: `const o = { '@media (min-width: 600px)': 1 };`,
      filename: 'comp.tsx',
    },
    // css object with no @media key — not flagged
    {
      code: `const C = () => <div css={{ color: 'red' }} />;`,
      filename: 'comp.tsx',
    },
    // computed key in css object — must not crash or flag
    {
      code: `const C = () => <div css={{ [bp]: { color: 'red' } }} />;`,
      filename: 'comp.tsx',
    },
    // @media inside a CSS block comment — must not flag
    {
      code: `const S = styled.div\`/* @media (min-width: 600px) */ color: red;\`;`,
      filename: 'comp.tsx',
    },
  ],

  invalid: [
    // @media in styled tagged template
    {
      code: `const S = styled.div\`@media (min-width: 600px) { color: red; }\`;`,
      filename: 'comp.tsx',
      errors: [{ messageId: 'noLiteralMediaQuery' }],
    },
    // @media in css tagged template
    {
      code: `const c = css\`@media screen and (max-width: 480px) { display: none; }\`;`,
      filename: 'comp.tsx',
      errors: [{ messageId: 'noLiteralMediaQuery' }],
    },
    // window.matchMedia with breakpoint literal
    {
      code: `const m = window.matchMedia('(min-width: 1024px)');`,
      filename: 'comp.tsx',
      errors: [{ messageId: 'noLiteralMediaQuery' }],
    },
    // matchMedia with breakpoint literal
    {
      code: `const m = matchMedia('(max-width: 480px)');`,
      filename: 'comp.tsx',
      errors: [{ messageId: 'noLiteralMediaQuery' }],
    },
    // @media key in JSX css={} object
    {
      code: `const C = () => <div css={{ '@media (min-width: 600px)': { color: 'red' } }} />;`,
      filename: 'comp.tsx',
      errors: [{ messageId: 'noLiteralMediaQuery' }],
    },
    // @media key in styled.div({}) object-css call
    {
      code: `const S = styled.div({ '@media screen and (max-width: 480px)': { display: 'none' } });`,
      filename: 'comp.tsx',
      errors: [{ messageId: 'noLiteralMediaQuery' }],
    },
  ],
});

console.log('no-literal-media-query: all tests passed');
