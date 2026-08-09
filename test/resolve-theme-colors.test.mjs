/**
 * Tests for src/resolve.mjs — resolveCategory('theme-colors')
 *
 * The resolver's anchor (consumer root) is computed once at module load from
 * process.cwd(), so a same-process import always resolves against THIS repo's
 * cwd. To exercise it against the real installed Fuselage in fixtures/consumer
 * (the pattern the project's own smoke tests use — see CLAUDE.md "Smoke tests"),
 * spawn the bin as a subprocess with cwd set to the fixture.
 *
 * Run via: node test/run-tests.mjs (from repo root)
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const fixtureDir = resolve(repoRoot, 'fixtures/consumer');
const binPath = resolve(repoRoot, 'bin/fuselage-resolve.mjs');

function runResolver(category) {
  const raw = execFileSync('node', [binPath, category, '--json'], {
    cwd: fixtureDir,
    encoding: 'utf8',
  });
  return JSON.parse(raw).categories[category];
}

// ── Test 1: resolves per-theme values against the real installed Fuselage ────

{
  const result = runResolver('theme-colors');

  assert.equal(result.status, 'ok', `expected ok, got ${result.status}: ${result.reason}`);
  assert.ok(Array.isArray(result.data), 'data must be an array');
  assert.ok(result.data.length > 0, 'expected at least one resolved theme-color entry');

  for (const entry of result.data) {
    assert.equal(typeof entry.name, 'string');
    assert.equal(typeof entry.groupName, 'string');
    assert.ok('light' in entry, 'entry must carry a light value');
    assert.ok('dark' in entry, 'entry must carry a dark value');
  }
}

// ── Test 2: every group the `semantic` category reports also appears here ────
// (except entries with no static color, e.g. surface's 'transparent')

{
  const semantic = runResolver('semantic');
  const themeColors = runResolver('theme-colors');

  assert.equal(semantic.status, 'ok');
  assert.equal(themeColors.status, 'ok');

  const resolvedGroups = new Set(themeColors.data.map((d) => d.groupName));
  const semanticGroups = semantic.data.map((g) => g.groupName);

  for (const groupName of semanticGroups) {
    assert.ok(
      resolvedGroups.has(groupName),
      `expected theme-colors to resolve at least one entry for semantic group "${groupName}"`,
    );
  }
}

// ── Test 3: a known token resolves to distinct-shaped light/dark hex values ──
// (`font-danger` bare name 'danger' is a stable, long-lived Fuselage token)

{
  const themeColors = runResolver('theme-colors');
  const dangerText = themeColors.data.find(
    (d) => d.groupName === 'text' && d.name === 'danger',
  );

  assert.ok(dangerText, 'expected to find the text/danger token in theme-colors output');
  assert.equal(typeof dangerText.light, 'string');
  assert.equal(typeof dangerText.dark, 'string');
  assert.ok(dangerText.light.length > 0);
  assert.ok(dangerText.dark.length > 0);
}

// ── Test 4: status/statusColor groups reconstruct their semantic prefixes ────
// (status.json stores bare 'info'/'font-on-info' keys; the resolver must
// reconstruct 'status-background-info' / 'status-font-on-info' to match the
// semantic category's full names)

{
  const themeColors = runResolver('theme-colors');

  const statusBg = themeColors.data.find((d) => d.groupName === 'status');
  const statusFont = themeColors.data.find((d) => d.groupName === 'statusColor');

  assert.ok(statusBg, 'expected at least one status (background) entry');
  assert.ok(statusBg.name.startsWith('status-background-'), `got name "${statusBg.name}"`);

  assert.ok(statusFont, 'expected at least one statusColor (font-on) entry');
  assert.ok(statusFont.name.startsWith('status-font-on-'), `got name "${statusFont.name}"`);
}

console.log('resolve-theme-colors: all tests passed');
