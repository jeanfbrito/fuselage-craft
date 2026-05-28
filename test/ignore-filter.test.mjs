/**
 * Tests for src/ignore-filter.mjs
 *
 * Run via: node test/run-tests.mjs (from repo root)
 */

import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { promises as fsp } from 'fs';
import { join, resolve } from 'path';

import { loadIgnore, filterFindings } from '../src/ignore-filter.mjs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmpTestDir() {
  return resolve(tmpdir(), `fuselage-craft-test-${randomBytes(8).toString('hex')}`);
}

async function cleanupDir(dir) {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testLoadIgnoreMissingFile() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const result = loadIgnore(cwd);
    if (!Array.isArray(result.entries) || result.entries.length !== 0) {
      throw new Error(`Expected empty entries, got ${JSON.stringify(result.entries)}`);
    }
    if (!Array.isArray(result.warnings) || result.warnings.length !== 0) {
      throw new Error(`Expected empty warnings, got ${JSON.stringify(result.warnings)}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testLoadIgnoreTwoRules() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });
  await fsp.mkdir(join(cwd, '.fuselage-craft'), { recursive: true });

  const content = `
## fuselage-craft-gate/no-raw-color
- path: src/bad.tsx
  line: 10
  reason: Legacy component, scheduled for refactor

- path: src/old/*.tsx
  reason: Pre-migration code

## fuselage-craft-gate/prefer-button
- path: src/links.tsx
  reason: Temporary workaround for external links
`;

  try {
    await fsp.writeFile(join(cwd, '.fuselage-craft', 'ignore.md'), content, 'utf-8');
    const result = loadIgnore(cwd);

    if (result.entries.length !== 3) {
      throw new Error(`Expected 3 entries, got ${result.entries.length}`);
    }

    // Verify first rule entries
    const colorEntries = result.entries.filter((e) => e.rule === 'fuselage-craft-gate/no-raw-color');
    if (colorEntries.length !== 2) {
      throw new Error(`Expected 2 no-raw-color entries, got ${colorEntries.length}`);
    }

    // Verify second rule entries
    const buttonEntries = result.entries.filter((e) => e.rule === 'fuselage-craft-gate/prefer-button');
    if (buttonEntries.length !== 1) {
      throw new Error(`Expected 1 prefer-button entry, got ${buttonEntries.length}`);
    }

    if (result.warnings.length !== 0) {
      throw new Error(`Expected no warnings, got ${result.warnings.length}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testLoadIgnoreMissingReason() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });
  await fsp.mkdir(join(cwd, '.fuselage-craft'), { recursive: true });

  const content = `
## some-rule
- path: src/good.tsx
  reason: This one is OK

- path: src/bad.tsx
  line: 5

- path: src/another.tsx
  reason: This is also fine
`;

  try {
    await fsp.writeFile(join(cwd, '.fuselage-craft', 'ignore.md'), content, 'utf-8');
    const result = loadIgnore(cwd);

    // Only entries with reason should be included
    if (result.entries.length !== 2) {
      throw new Error(`Expected 2 valid entries, got ${result.entries.length}`);
    }

    // One warning for the missing reason
    if (result.warnings.length !== 1) {
      throw new Error(`Expected 1 warning, got ${result.warnings.length}`);
    }
    if (!result.warnings[0].includes('missing a reason')) {
      throw new Error(`Expected warning about missing reason, got: ${result.warnings[0]}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testFilterFindingsExactPathAndRule() {
  const findings = [
    { ruleId: 'no-raw-color', filePath: 'src/comp.tsx', line: 5 },
    { ruleId: 'prefer-button', filePath: 'src/comp.tsx', line: 10 },
    { ruleId: 'no-raw-color', filePath: 'src/other.tsx', line: 15 },
  ];

  const ignore = {
    entries: [
      { rule: 'no-raw-color', pathGlob: 'src/comp.tsx', line: 5, reason: 'test' },
    ],
  };

  const { kept, suppressed } = filterFindings(findings, ignore);

  if (suppressed.length !== 1) {
    throw new Error(`Expected 1 suppressed, got ${suppressed.length}`);
  }
  if (suppressed[0].filePath !== 'src/comp.tsx') {
    throw new Error(`Expected suppressed finding to be src/comp.tsx, got ${suppressed[0].filePath}`);
  }
  if (kept.length !== 2) {
    throw new Error(`Expected 2 kept, got ${kept.length}`);
  }
}

async function testFilterFindingsGlobSingleSegment() {
  const findings = [
    { ruleId: 'test', filePath: 'src/a.tsx', line: 1 },
    { ruleId: 'test', filePath: 'src/b.tsx', line: 1 },
    { ruleId: 'test', filePath: 'src/nested/c.tsx', line: 1 },
  ];

  const ignore = {
    entries: [
      { rule: 'test', pathGlob: 'src/*.tsx', reason: 'glob' },
    ],
  };

  const { kept, suppressed } = filterFindings(findings, ignore);

  // * matches single segment, not nested
  if (suppressed.length !== 2) {
    throw new Error(`Expected 2 suppressed by *, got ${suppressed.length}`);
  }
  if (kept.length !== 1) {
    throw new Error(`Expected 1 kept, got ${kept.length}`);
  }
  if (kept[0].filePath !== 'src/nested/c.tsx') {
    throw new Error(`Expected kept to be src/nested/c.tsx, got ${kept[0].filePath}`);
  }
}

async function testFilterFindingsGlobDoubleSegment() {
  const findings = [
    { ruleId: 'test', filePath: 'src/a.tsx', line: 1 },
    { ruleId: 'test', filePath: 'src/nested/b.tsx', line: 1 },
    { ruleId: 'src/deep/nested/c.tsx', line: 1 },
  ];

  const ignore = {
    entries: [
      { rule: 'test', pathGlob: '**/*.tsx', reason: 'glob' },
    ],
  };

  const { suppressed } = filterFindings(findings, ignore);

  // ** matches any depth, including no nesting
  if (suppressed.length !== 2) {
    throw new Error(`Expected 2 suppressed by **/*.tsx, got ${suppressed.length}`);
  }
}

async function testFilterFindingsLineMatching() {
  const findings = [
    { rule: 'r1', file: 'x.tsx', line: 10 },
    { rule: 'r1', file: 'x.tsx', line: 20 },
    { rule: 'r1', file: 'x.tsx', line: 30 },
  ];

  const ignore = {
    entries: [
      { rule: 'r1', pathGlob: 'x.tsx', line: 20, reason: 'specific line' },
    ],
  };

  const { kept, suppressed } = filterFindings(findings, ignore);

  // Only line 20 should be suppressed
  if (suppressed.length !== 1 || suppressed[0].line !== 20) {
    throw new Error(`Expected only line 20 suppressed, got ${suppressed.map((f) => f.line).join(',')}`);
  }
  if (kept.length !== 2) {
    throw new Error(`Expected 2 kept, got ${kept.length}`);
  }
}

async function testFilterFindingsLineOmittedMatchesAny() {
  const findings = [
    { rule: 'r1', file: 'x.tsx', line: 5 },
    { rule: 'r1', file: 'x.tsx', line: 10 },
    { rule: 'r1', file: 'x.tsx', line: 15 },
  ];

  const ignore = {
    entries: [
      { rule: 'r1', pathGlob: 'x.tsx', reason: 'any line' }, // no line field
    ],
  };

  const { kept, suppressed } = filterFindings(findings, ignore);

  // All should be suppressed since line is not specified
  if (suppressed.length !== 3) {
    throw new Error(`Expected all 3 suppressed, got ${suppressed.length}`);
  }
  if (kept.length !== 0) {
    throw new Error(`Expected 0 kept, got ${kept.length}`);
  }
}

async function testFilterFindingsFieldAliases() {
  const findings = [
    { rule: 'r1', file: 'a.tsx' }, // new alias names
    { ruleId: 'r2', filePath: 'b.tsx' }, // old alias names
  ];

  const ignore = {
    entries: [
      { rule: 'r1', pathGlob: 'a.tsx', reason: 'test' },
      { rule: 'r2', pathGlob: 'b.tsx', reason: 'test' },
    ],
  };

  const { kept, suppressed } = filterFindings(findings, ignore);

  // Both aliases should work
  if (suppressed.length !== 2) {
    throw new Error(`Expected 2 suppressed with both aliases, got ${suppressed.length}`);
  }
  if (kept.length !== 0) {
    throw new Error(`Expected 0 kept, got ${kept.length}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const tests = [
  { name: 'loadIgnoreMissingFile', fn: testLoadIgnoreMissingFile },
  { name: 'loadIgnoreTwoRules', fn: testLoadIgnoreTwoRules },
  { name: 'loadIgnoreMissingReason', fn: testLoadIgnoreMissingReason },
  { name: 'filterFindingsExactPathAndRule', fn: testFilterFindingsExactPathAndRule },
  { name: 'filterFindingsGlobSingleSegment', fn: testFilterFindingsGlobSingleSegment },
  { name: 'filterFindingsGlobDoubleSegment', fn: testFilterFindingsGlobDoubleSegment },
  { name: 'filterFindingsLineMatching', fn: testFilterFindingsLineMatching },
  { name: 'filterFindingsLineOmittedMatchesAny', fn: testFilterFindingsLineOmittedMatchesAny },
  { name: 'filterFindingsFieldAliases', fn: testFilterFindingsFieldAliases },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    await test.fn();
    passed++;
  } catch (err) {
    failed++;
    throw new Error(`ignore-filter: ${test.name} failed: ${err.message}`);
  }
}

console.log(`ignore-filter: all ${passed} tests passed`);
