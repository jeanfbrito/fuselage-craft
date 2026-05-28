/**
 * Tests for src/critique-ignore.mjs
 *
 * Run via: node test/run-tests.mjs (from repo root)
 */

import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { promises as fsp } from 'fs';
import { join, resolve } from 'path';

import { loadCritiqueIgnore, filterCritiqueFindings } from '../src/critique-ignore.mjs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmpTestDir() {
  return resolve(tmpdir(), `fuselage-craft-ci-test-${randomBytes(8).toString('hex')}`);
}

async function cleanupDir(dir) {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testLoadCritiqueIgnoreMissingFile() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const result = loadCritiqueIgnore(cwd);
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

async function testLoadCritiqueIgnoreTwoSlugs() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });
  await fsp.mkdir(join(cwd, '.fuselage-craft'), { recursive: true });

  const content = `
## admin-rooms
- category: hierarchy
  reason: accepted — stylistic choice on this surface

- category: cognitive-load
  contains: "too many options"
  reason: product decision, revisit in Q3

## user-profile
- category: a11y
  reason: tracked in accessibility backlog
`;

  try {
    await fsp.writeFile(join(cwd, '.fuselage-craft', 'critique-ignore.md'), content, 'utf-8');
    const result = loadCritiqueIgnore(cwd);

    if (result.entries.length !== 3) {
      throw new Error(`Expected 3 entries, got ${result.entries.length}`);
    }

    const adminEntries = result.entries.filter((e) => e.slug === 'admin-rooms');
    if (adminEntries.length !== 2) {
      throw new Error(`Expected 2 admin-rooms entries, got ${adminEntries.length}`);
    }

    const profileEntries = result.entries.filter((e) => e.slug === 'user-profile');
    if (profileEntries.length !== 1) {
      throw new Error(`Expected 1 user-profile entry, got ${profileEntries.length}`);
    }

    if (result.warnings.length !== 0) {
      throw new Error(`Expected no warnings, got ${result.warnings.length}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testLoadCritiqueIgnoreMissingReason() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });
  await fsp.mkdir(join(cwd, '.fuselage-craft'), { recursive: true });

  const content = `
## my-feature
- category: hierarchy
  reason: This one has a reason

- category: ia
  contains: "missing label"

- category: consistency
  reason: Also has a reason
`;

  try {
    await fsp.writeFile(join(cwd, '.fuselage-craft', 'critique-ignore.md'), content, 'utf-8');
    const result = loadCritiqueIgnore(cwd);

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

async function testFilterCritiqueFindingsExactSlugCategory() {
  const findings = [
    { slug: 'admin-rooms', category: 'hierarchy', message: 'Primary action not prominent' },
    { slug: 'admin-rooms', category: 'cognitive-load', message: 'Page has too many options' },
    { slug: 'user-profile', category: 'hierarchy', message: 'Primary action not prominent' },
  ];

  const ignore = {
    entries: [
      { slug: 'admin-rooms', category: 'hierarchy', reason: 'accepted' },
    ],
  };

  const { kept, suppressed } = filterCritiqueFindings(findings, ignore);

  if (suppressed.length !== 1) {
    throw new Error(`Expected 1 suppressed, got ${suppressed.length}`);
  }
  if (suppressed[0].slug !== 'admin-rooms' || suppressed[0].category !== 'hierarchy') {
    throw new Error(`Expected suppressed to be admin-rooms/hierarchy`);
  }
  if (kept.length !== 2) {
    throw new Error(`Expected 2 kept, got ${kept.length}`);
  }
}

async function testFilterCritiqueFindingsContainsMatch() {
  const findings = [
    { slug: 'feat-x', category: 'ia', message: 'Call-to-action is unclear to users' },
    { slug: 'feat-x', category: 'ia', message: 'Navigation path too deep' },
  ];

  const ignore = {
    entries: [
      { slug: 'feat-x', category: 'ia', contains: 'unclear to users', reason: 'accepted' },
    ],
  };

  const { kept, suppressed } = filterCritiqueFindings(findings, ignore);

  if (suppressed.length !== 1) {
    throw new Error(`Expected 1 suppressed (contains match), got ${suppressed.length}`);
  }
  if (!suppressed[0].message.includes('unclear to users')) {
    throw new Error('Expected suppressed finding to contain "unclear to users"');
  }
  if (kept.length !== 1) {
    throw new Error(`Expected 1 kept (non-matching contains), got ${kept.length}`);
  }
}

async function testFilterCritiqueFindingsContainsNoMatch() {
  const findings = [
    { slug: 'feat-y', category: 'affordances', message: 'Disabled state not visually distinct' },
  ];

  const ignore = {
    entries: [
      { slug: 'feat-y', category: 'affordances', contains: 'missing icon', reason: 'wontfix' },
    ],
  };

  const { kept, suppressed } = filterCritiqueFindings(findings, ignore);

  if (suppressed.length !== 0) {
    throw new Error(`Expected 0 suppressed (contains mismatch), got ${suppressed.length}`);
  }
  if (kept.length !== 1) {
    throw new Error(`Expected 1 kept, got ${kept.length}`);
  }
}

async function testFilterCritiqueFindingsContainsOmittedIsWildcard() {
  const findings = [
    { slug: 'feat-z', category: 'consistency', message: 'Using hand-rolled div instead of Box' },
    { slug: 'feat-z', category: 'consistency', message: 'Custom button not from Fuselage' },
    { slug: 'feat-z', category: 'hierarchy', message: 'H1 used for section header' },
  ];

  const ignore = {
    entries: [
      // No contains → matches all findings with this slug+category
      { slug: 'feat-z', category: 'consistency', reason: 'legacy surface, tracked' },
    ],
  };

  const { kept, suppressed } = filterCritiqueFindings(findings, ignore);

  if (suppressed.length !== 2) {
    throw new Error(`Expected 2 suppressed (wildcard within slug+category), got ${suppressed.length}`);
  }
  if (kept.length !== 1) {
    throw new Error(`Expected 1 kept (different category), got ${kept.length}`);
  }
  if (kept[0].category !== 'hierarchy') {
    throw new Error(`Expected kept finding to be hierarchy, got ${kept[0].category}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const tests = [
  { name: 'loadCritiqueIgnoreMissingFile', fn: testLoadCritiqueIgnoreMissingFile },
  { name: 'loadCritiqueIgnoreTwoSlugs', fn: testLoadCritiqueIgnoreTwoSlugs },
  { name: 'loadCritiqueIgnoreMissingReason', fn: testLoadCritiqueIgnoreMissingReason },
  { name: 'filterCritiqueFindingsExactSlugCategory', fn: testFilterCritiqueFindingsExactSlugCategory },
  { name: 'filterCritiqueFindingsContainsMatch', fn: testFilterCritiqueFindingsContainsMatch },
  { name: 'filterCritiqueFindingsContainsNoMatch', fn: testFilterCritiqueFindingsContainsNoMatch },
  { name: 'filterCritiqueFindingsContainsOmittedIsWildcard', fn: testFilterCritiqueFindingsContainsOmittedIsWildcard },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    await test.fn();
    passed++;
  } catch (err) {
    failed++;
    throw new Error(`critique-ignore: ${test.name} failed: ${err.message}`);
  }
}

console.log(`critique-ignore: all ${passed} tests passed`);
