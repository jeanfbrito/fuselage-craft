/**
 * Tests for src/audit-snapshot.mjs
 *
 * Run via: node test/run-tests.mjs (from repo root)
 */

import { resolve } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { promises as fsp } from 'fs';

import { writeSnapshot, readLatest, readTrend } from '../src/audit-snapshot.mjs';

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

async function testWriteSnapshot() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const result = {
      lint: {
        findings: [
          { ruleId: 'no-raw-color', filePath: 'src/comp.tsx', line: 5, column: 12, severity: 2 },
          { ruleId: 'no-raw-color', filePath: 'src/other.tsx', line: 10, column: 8, severity: 1 },
          { ruleId: 'prefer-button', filePath: 'src/comp.tsx', line: 15, column: 2, severity: 2 },
        ],
        filesScanned: 3,
      },
    };

    const { path, snapshot } = await writeSnapshot(result, { cwd, fuselageVersion: '6.0.0' });

    // Verify path structure
    if (!path.includes('.fuselage-craft/audit/')) {
      throw new Error(`Expected path to contain .fuselage-craft/audit/, got ${path}`);
    }
    if (!path.endsWith('.json')) {
      throw new Error(`Expected .json extension, got ${path}`);
    }

    // Verify snapshot schema
    if (snapshot.version !== 1) {
      throw new Error(`Expected version 1, got ${snapshot.version}`);
    }
    if (!snapshot.timestamp) {
      throw new Error('Missing timestamp');
    }
    if (!snapshot.timestamp.match(/^\d{4}-\d{2}-\d{2}T/)) {
      throw new Error(`Invalid ISO timestamp: ${snapshot.timestamp}`);
    }

    // Verify lintRulesCount
    if (snapshot.lintRulesCount['no-raw-color'] !== 2) {
      throw new Error(`Expected lintRulesCount['no-raw-color'] = 2, got ${snapshot.lintRulesCount['no-raw-color']}`);
    }
    if (snapshot.lintRulesCount['prefer-button'] !== 1) {
      throw new Error(`Expected lintRulesCount['prefer-button'] = 1, got ${snapshot.lintRulesCount['prefer-button']}`);
    }

    // Verify findings schema
    if (snapshot.findings.length !== 3) {
      throw new Error(`Expected 3 findings, got ${snapshot.findings.length}`);
    }
    if (snapshot.findings[0].rule !== 'no-raw-color') {
      throw new Error(`Expected first finding rule to be 'no-raw-color', got ${snapshot.findings[0].rule}`);
    }
    if (snapshot.findings[0].severity !== 'error') {
      throw new Error(`Expected first finding severity 'error', got ${snapshot.findings[0].severity}`);
    }
    if (snapshot.findings[1].severity !== 'warn') {
      throw new Error(`Expected second finding severity 'warn', got ${snapshot.findings[1].severity}`);
    }

    // Verify totals
    if (snapshot.totals.errors !== 2) {
      throw new Error(`Expected totals.errors = 2, got ${snapshot.totals.errors}`);
    }
    if (snapshot.totals.warnings !== 1) {
      throw new Error(`Expected totals.warnings = 1, got ${snapshot.totals.warnings}`);
    }
    if (snapshot.totals.filesScanned !== 3) {
      throw new Error(`Expected totals.filesScanned = 3, got ${snapshot.totals.filesScanned}`);
    }

    // Verify latest.json was written as a copy (same content)
    const latest = await fsp.readFile(resolve(cwd, '.fuselage-craft/audit/latest.json'), 'utf-8');
    const latestSnapshot = JSON.parse(latest);
    if (latestSnapshot.version !== snapshot.version) {
      throw new Error('latest.json version does not match written snapshot');
    }
    if (latestSnapshot.timestamp !== snapshot.timestamp) {
      throw new Error('latest.json timestamp does not match written snapshot');
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testReadLatestOnEmptyDir() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const latest = readLatest(cwd);
    if (latest !== null) {
      throw new Error(`Expected null on empty dir, got ${JSON.stringify(latest)}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testReadLatestReturnsLatest() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    // Write three snapshots
    const result1 = { lint: { findings: [], filesScanned: 0 } };
    const result2 = { lint: { findings: [{ ruleId: 'test', filePath: 'a.tsx', line: 1, severity: 1 }], filesScanned: 1 } };
    const result3 = { lint: { findings: [{ ruleId: 'test', filePath: 'b.tsx', line: 2, severity: 2 }], filesScanned: 1 } };

    await writeSnapshot(result1, { cwd });
    await new Promise((resolve) => setTimeout(resolve, 10)); // tiny delay to ensure distinct timestamps
    await writeSnapshot(result2, { cwd });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeSnapshot(result3, { cwd });

    const latest = readLatest(cwd);
    if (!latest) {
      throw new Error('Expected latest snapshot, got null');
    }

    // Verify it's the third (most recent) snapshot
    if (latest.totals.errors !== 1 || latest.totals.warnings !== 0) {
      throw new Error(`Expected latest to be result3, but got errors=${latest.totals.errors}, warnings=${latest.totals.warnings}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testReadTrendReturnsDescending() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    // Write four snapshots
    const results = [
      { lint: { findings: [{ ruleId: 'a', filePath: 'x', line: 1, severity: 1 }], filesScanned: 1 } },
      { lint: { findings: [{ ruleId: 'b', filePath: 'y', line: 2, severity: 1 }], filesScanned: 1 } },
      { lint: { findings: [{ ruleId: 'c', filePath: 'z', line: 3, severity: 1 }], filesScanned: 1 } },
      { lint: { findings: [{ ruleId: 'd', filePath: 'w', line: 4, severity: 1 }], filesScanned: 1 } },
    ];

    for (const result of results) {
      await writeSnapshot(result, { cwd });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const trend = readTrend(cwd, 2); // Request last 2
    if (trend.length !== 2) {
      throw new Error(`Expected 2 snapshots, got ${trend.length}`);
    }

    // Verify descending order (newest first)
    const firstRule = trend[0].findings[0].rule;
    const secondRule = trend[1].findings[0].rule;
    if (firstRule !== 'd' || secondRule !== 'c') {
      throw new Error(`Expected descending order [d, c], got [${firstRule}, ${secondRule}]`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testReadTrendWithFewerSnapshotsThanRequested() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    // Write only 2 snapshots, request 5
    const result1 = { lint: { findings: [], filesScanned: 0 } };
    const result2 = { lint: { findings: [], filesScanned: 0 } };

    await writeSnapshot(result1, { cwd });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeSnapshot(result2, { cwd });

    const trend = readTrend(cwd, 5);
    if (trend.length !== 2) {
      throw new Error(`Expected 2 snapshots, got ${trend.length}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testReadTrendOnEmptyDir() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const trend = readTrend(cwd, 10);
    if (!Array.isArray(trend) || trend.length !== 0) {
      throw new Error(`Expected empty array, got ${JSON.stringify(trend)}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

// ─── Critique namespace tests ─────────────────────────────────────────────────

// Shared minimal critique result shape used across critique tests.
function critiqueResult(findings = []) {
  return {
    lint: {
      findings,
      filesScanned: 0,
    },
  };
}

async function testCritiqueWriteRequiresSlug() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    let threw = false;
    try {
      await writeSnapshot(critiqueResult(), { cwd, kind: 'critique' });
    } catch (err) {
      if (err.message === 'slug required for kind=critique') {
        threw = true;
      } else {
        throw new Error(`Expected "slug required for kind=critique", got: ${err.message}`);
      }
    }
    if (!threw) {
      throw new Error('Expected writeSnapshot to throw for kind=critique without slug');
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testCritiqueWriteCreatesExpectedPaths() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const slug = 'test-feature';
    const findings = [
      { ruleId: 'hierarchy', filePath: slug, line: 0, column: 0, messageId: 'wrong-hierarchy', severity: 2 },
    ];
    const { path: writtenPath, snapshot } = await writeSnapshot(
      critiqueResult(findings),
      { cwd, kind: 'critique', slug },
    );

    // Timestamped file must be inside .fuselage-craft/critique/<slug>/
    const expectedPrefix = `.fuselage-craft/critique/${slug}/`;
    if (!writtenPath.includes(expectedPrefix)) {
      throw new Error(`Expected path to include ${expectedPrefix}, got ${writtenPath}`);
    }
    if (!writtenPath.endsWith('.json')) {
      throw new Error(`Expected .json extension, got ${writtenPath}`);
    }

    // latest.json must exist in the same directory
    const latestFile = resolve(cwd, `.fuselage-craft/critique/${slug}/latest.json`);
    const latestExists = await fsp.access(latestFile).then(() => true).catch(() => false);
    if (!latestExists) {
      throw new Error(`Expected latest.json at ${latestFile}`);
    }

    // Schema v1
    if (snapshot.version !== 1) {
      throw new Error(`Expected version 1, got ${snapshot.version}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testCritiqueWriteHasCorrectFindings() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const slug = 'my-screen';
    const findings = [
      { ruleId: 'hierarchy', filePath: slug, line: 0, column: 0, messageId: 'wrong-hierarchy', severity: 2 },
      { ruleId: 'cognitive-load', filePath: slug, line: 0, column: 0, messageId: 'too-dense', severity: 1 },
      { ruleId: 'a11y', filePath: slug, line: 0, column: 0, messageId: 'missing-label', severity: 2 },
    ];
    const { snapshot } = await writeSnapshot(critiqueResult(findings), { cwd, kind: 'critique', slug });

    if (snapshot.findings.length !== 3) {
      throw new Error(`Expected 3 findings, got ${snapshot.findings.length}`);
    }
    if (snapshot.findings[0].rule !== 'hierarchy') {
      throw new Error(`Expected first finding rule=hierarchy, got ${snapshot.findings[0].rule}`);
    }
    if (snapshot.findings[1].rule !== 'cognitive-load') {
      throw new Error(`Expected second finding rule=cognitive-load, got ${snapshot.findings[1].rule}`);
    }
    if (snapshot.totals.errors !== 2) {
      throw new Error(`Expected 2 errors, got ${snapshot.totals.errors}`);
    }
    if (snapshot.totals.warnings !== 1) {
      throw new Error(`Expected 1 warning, got ${snapshot.totals.warnings}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testCritiqueReadLatestWithSlug() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const slug = 'my-feature';
    const findings = [
      { ruleId: 'ia', filePath: slug, line: 0, column: 0, messageId: 'bad-ia', severity: 1 },
    ];
    await writeSnapshot(critiqueResult(findings), { cwd, kind: 'critique', slug });

    const latest = readLatest(cwd, { kind: 'critique', slug });
    if (!latest) {
      throw new Error('Expected a snapshot, got null');
    }
    if (latest.version !== 1) {
      throw new Error(`Expected version 1, got ${latest.version}`);
    }
    if (latest.findings.length !== 1 || latest.findings[0].rule !== 'ia') {
      throw new Error(`Expected finding rule=ia, got ${JSON.stringify(latest.findings)}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testCritiqueReadLatestMissingSlugReturnsNull() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    // No snapshots written for this slug
    const latest = readLatest(cwd, { kind: 'critique', slug: 'nonexistent' });
    if (latest !== null) {
      throw new Error(`Expected null for missing critique slug, got ${JSON.stringify(latest)}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testCritiqueReadLatestMissingDirReturnsNull() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    // .fuselage-craft/critique/ doesn't exist at all
    const latest = readLatest(cwd, { kind: 'critique', slug: 'any-slug' });
    if (latest !== null) {
      throw new Error(`Expected null when dir absent, got ${JSON.stringify(latest)}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testCritiqueSlugsAreIsolated() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const slugA = 'screen-a';
    const slugB = 'screen-b';
    const findingsA = [{ ruleId: 'hierarchy', filePath: slugA, line: 0, column: 0, messageId: 'x', severity: 2 }];
    const findingsB = [{ ruleId: 'a11y', filePath: slugB, line: 0, column: 0, messageId: 'y', severity: 1 }];

    await writeSnapshot(critiqueResult(findingsA), { cwd, kind: 'critique', slug: slugA });
    await writeSnapshot(critiqueResult(findingsB), { cwd, kind: 'critique', slug: slugB });

    const latestA = readLatest(cwd, { kind: 'critique', slug: slugA });
    const latestB = readLatest(cwd, { kind: 'critique', slug: slugB });

    if (!latestA || latestA.findings[0].rule !== 'hierarchy') {
      throw new Error(`slugA should have hierarchy finding, got ${JSON.stringify(latestA?.findings)}`);
    }
    if (!latestB || latestB.findings[0].rule !== 'a11y') {
      throw new Error(`slugB should have a11y finding, got ${JSON.stringify(latestB?.findings)}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testCritiqueReadTrendWithSlug() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const slug = 'feature-x';
    const ruleIds = ['hierarchy', 'cognitive-load', 'ia', 'affordances'];

    for (const ruleId of ruleIds) {
      const findings = [{ ruleId, filePath: slug, line: 0, column: 0, messageId: 'x', severity: 1 }];
      await writeSnapshot(critiqueResult(findings), { cwd, kind: 'critique', slug });
      await new Promise((r) => setTimeout(r, 10));
    }

    const trend = readTrend(cwd, 2, { kind: 'critique', slug });
    if (trend.length !== 2) {
      throw new Error(`Expected 2 snapshots in trend, got ${trend.length}`);
    }
    // Newest first — 'affordances' was written last
    if (trend[0].findings[0].rule !== 'affordances') {
      throw new Error(`Expected newest=affordances, got ${trend[0].findings[0].rule}`);
    }
    if (trend[1].findings[0].rule !== 'ia') {
      throw new Error(`Expected second=ia, got ${trend[1].findings[0].rule}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testCritiqueReadTrendEmptyDirReturnsEmptyArray() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const trend = readTrend(cwd, 5, { kind: 'critique', slug: 'no-such-slug' });
    if (!Array.isArray(trend) || trend.length !== 0) {
      throw new Error(`Expected empty array, got ${JSON.stringify(trend)}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testCritiqueReadTrendFewerThanRequested() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const slug = 'partial';
    for (let i = 0; i < 2; i++) {
      await writeSnapshot(critiqueResult(), { cwd, kind: 'critique', slug });
      await new Promise((r) => setTimeout(r, 10));
    }

    const trend = readTrend(cwd, 10, { kind: 'critique', slug });
    if (trend.length !== 2) {
      throw new Error(`Expected 2 snapshots when fewer exist, got ${trend.length}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testCritiqueAllRuleIdCategories() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const slug = 'categories';
    const categories = ['hierarchy', 'cognitive-load', 'ia', 'affordances', 'consistency', 'a11y'];
    const findings = categories.map((ruleId) => ({
      ruleId,
      filePath: slug,
      line: 0,
      column: 0,
      messageId: 'test',
      severity: 1,
    }));

    const { snapshot } = await writeSnapshot(critiqueResult(findings), { cwd, kind: 'critique', slug });

    if (snapshot.findings.length !== categories.length) {
      throw new Error(`Expected ${categories.length} findings, got ${snapshot.findings.length}`);
    }
    for (const cat of categories) {
      const found = snapshot.findings.some((f) => f.rule === cat);
      if (!found) {
        throw new Error(`Category ${cat} not found in snapshot findings`);
      }
    }
    // All are warn (severity=1)
    if (snapshot.totals.warnings !== categories.length) {
      throw new Error(`Expected ${categories.length} warnings, got ${snapshot.totals.warnings}`);
    }
    if (snapshot.totals.errors !== 0) {
      throw new Error(`Expected 0 errors, got ${snapshot.totals.errors}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

// ─── Regression: explicit kind='audit' works like the default ─────────────────

async function testExplicitKindAuditMatchesDefault() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const result = {
      lint: {
        findings: [{ ruleId: 'no-raw-color', filePath: 'src/x.tsx', line: 1, column: 1, severity: 2 }],
        filesScanned: 1,
      },
    };

    // Write with explicit kind='audit'
    const { path: p, snapshot } = await writeSnapshot(result, { cwd, kind: 'audit', fuselageVersion: '6.0.0' });

    if (!p.includes('.fuselage-craft/audit/')) {
      throw new Error(`Expected .fuselage-craft/audit/ in path, got ${p}`);
    }
    if (snapshot.version !== 1) {
      throw new Error(`Expected version 1, got ${snapshot.version}`);
    }

    const latest = readLatest(cwd, { kind: 'audit' });
    if (!latest) {
      throw new Error('Expected latest snapshot for kind=audit');
    }
    if (latest.findings[0].rule !== 'no-raw-color') {
      throw new Error(`Expected rule=no-raw-color, got ${latest.findings[0].rule}`);
    }

    const trend = readTrend(cwd, 5, { kind: 'audit' });
    if (trend.length !== 1) {
      throw new Error(`Expected 1 snapshot in trend, got ${trend.length}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

async function testAuditAndCritiqueDoNotShareStorage() {
  const cwd = tmpTestDir();
  await fsp.mkdir(cwd, { recursive: true });

  try {
    const slug = 'shared-slug';
    const auditResult = {
      lint: {
        findings: [{ ruleId: 'no-raw-color', filePath: 'x.tsx', line: 1, column: 1, severity: 2 }],
        filesScanned: 1,
      },
    };
    const critiqueFindings = [
      { ruleId: 'hierarchy', filePath: slug, line: 0, column: 0, messageId: 'h', severity: 1 },
    ];

    await writeSnapshot(auditResult, { cwd, kind: 'audit' });
    await writeSnapshot(critiqueResult(critiqueFindings), { cwd, kind: 'critique', slug });

    const auditLatest = readLatest(cwd, { kind: 'audit' });
    const critiqueLatest = readLatest(cwd, { kind: 'critique', slug });

    if (!auditLatest || auditLatest.findings[0].rule !== 'no-raw-color') {
      throw new Error('Audit latest should have no-raw-color finding');
    }
    if (!critiqueLatest || critiqueLatest.findings[0].rule !== 'hierarchy') {
      throw new Error('Critique latest should have hierarchy finding');
    }

    // Audit trend should not include critique snapshots
    const auditTrend = readTrend(cwd, 10, { kind: 'audit' });
    const critiqueTrend = readTrend(cwd, 10, { kind: 'critique', slug });

    if (auditTrend.length !== 1) {
      throw new Error(`Expected 1 audit snapshot, got ${auditTrend.length}`);
    }
    if (critiqueTrend.length !== 1) {
      throw new Error(`Expected 1 critique snapshot, got ${critiqueTrend.length}`);
    }
  } finally {
    await cleanupDir(cwd);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const tests = [
  { name: 'writeSnapshot', fn: testWriteSnapshot },
  { name: 'readLatestOnEmptyDir', fn: testReadLatestOnEmptyDir },
  { name: 'readLatestReturnsLatest', fn: testReadLatestReturnsLatest },
  { name: 'readTrendReturnsDescending', fn: testReadTrendReturnsDescending },
  { name: 'readTrendWithFewerSnapshotsThanRequested', fn: testReadTrendWithFewerSnapshotsThanRequested },
  { name: 'readTrendOnEmptyDir', fn: testReadTrendOnEmptyDir },
  // critique namespace
  { name: 'critique/writeRequiresSlug', fn: testCritiqueWriteRequiresSlug },
  { name: 'critique/writeCreatesExpectedPaths', fn: testCritiqueWriteCreatesExpectedPaths },
  { name: 'critique/writeHasCorrectFindings', fn: testCritiqueWriteHasCorrectFindings },
  { name: 'critique/readLatestWithSlug', fn: testCritiqueReadLatestWithSlug },
  { name: 'critique/readLatestMissingSlugReturnsNull', fn: testCritiqueReadLatestMissingSlugReturnsNull },
  { name: 'critique/readLatestMissingDirReturnsNull', fn: testCritiqueReadLatestMissingDirReturnsNull },
  { name: 'critique/slugsAreIsolated', fn: testCritiqueSlugsAreIsolated },
  { name: 'critique/readTrendWithSlug', fn: testCritiqueReadTrendWithSlug },
  { name: 'critique/readTrendEmptyDirReturnsEmptyArray', fn: testCritiqueReadTrendEmptyDirReturnsEmptyArray },
  { name: 'critique/readTrendFewerThanRequested', fn: testCritiqueReadTrendFewerThanRequested },
  { name: 'critique/allRuleIdCategories', fn: testCritiqueAllRuleIdCategories },
  // regression: explicit kind='audit'
  { name: 'audit/explicitKindMatchesDefault', fn: testExplicitKindAuditMatchesDefault },
  { name: 'audit/doesNotShareStorageWithCritique', fn: testAuditAndCritiqueDoNotShareStorage },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    await test.fn();
    passed++;
  } catch (err) {
    failed++;
    throw new Error(`audit-snapshot: ${test.name} failed: ${err.message}`);
  }
}

console.log(`audit-snapshot: all ${passed} tests passed`);
