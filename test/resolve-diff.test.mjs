/**
 * Tests for src/resolve.mjs — resolveDiff()
 */

import assert from 'node:assert/strict';
import { resolveDiff } from '../src/resolve.mjs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSnap(categoriesMap, versions = {}) {
  return {
    root: '/fake',
    resolvedFrom: '/fake',
    fuselageInstalled: true,
    versions,
    categories: categoriesMap,
  };
}

function okArray(data) {
  return { status: 'ok', source: 'fake', data };
}

function okSemantic(groups) {
  // groups: [{ groupName, keys }]
  return { status: 'ok', source: 'fake', data: groups };
}

function unavailable(reason) {
  return { status: 'unavailable', reason };
}

// ── Test 1: components — removed Tile, added Chip ────────────────────────────

{
  const old = makeSnap({ components: okArray(['Box', 'Tile', 'Button']) });
  const nw = makeSnap({ components: okArray(['Box', 'Button', 'Chip']) });

  const diff = resolveDiff(old, nw);

  assert.deepEqual(diff.categories.components.removed, ['Tile']);
  assert.deepEqual(diff.categories.components.added, ['Chip']);
}

// ── Test 2: hooks — added useBreakpoints ─────────────────────────────────────

{
  const old = makeSnap({ hooks: okArray(['useDebouncedValue']) });
  const nw = makeSnap({ hooks: okArray(['useDebouncedValue', 'useBreakpoints']) });

  const diff = resolveDiff(old, nw);

  assert.deepEqual(diff.categories.hooks.removed, []);
  assert.deepEqual(diff.categories.hooks.added, ['useBreakpoints']);
}

// ── Test 3: semantic — removed surface/surface-tint ──────────────────────────

{
  const old = makeSnap({
    semantic: okSemantic([
      { groupName: 'surface', keys: ['surface-light', 'surface-tint'] },
    ]),
  });
  const nw = makeSnap({
    semantic: okSemantic([
      { groupName: 'surface', keys: ['surface-light'] },
    ]),
  });

  const diff = resolveDiff(old, nw);

  assert.deepEqual(diff.categories.semantic.removed, ['surface/surface-tint']);
  assert.deepEqual(diff.categories.semantic.added, []);
}

// ── Test 4: fontscale — identical both sides → no change ─────────────────────

{
  const fontscaleData = ['x-small', 'small', 'medium', 'large'];
  const old = makeSnap({ fontscale: okArray(fontscaleData) });
  const nw = makeSnap({ fontscale: okArray(fontscaleData) });

  const diff = resolveDiff(old, nw);

  assert.deepEqual(diff.categories.fontscale.removed, []);
  assert.deepEqual(diff.categories.fontscale.added, []);
}

// ── Test 5: category unavailable on new side → appears in skipped ────────────

{
  const old = makeSnap({ colors: okArray(['neutral-100', 'neutral-200']) });
  const nw = makeSnap({ colors: unavailable('could not load palette') });

  const diff = resolveDiff(old, nw);

  assert.ok(!('colors' in diff.categories), 'colors should not be in categories when new is unavailable');
  assert.ok('colors' in diff.skipped, 'colors should appear in skipped');
  assert.ok(typeof diff.skipped.colors === 'string', 'skipped reason should be a string');
}

// ── Test 6: category present only on old (missing on new) → all removed ──────

{
  const old = makeSnap({ inputs: okArray(['TextInput', 'PasswordInput']) });
  const nw = makeSnap({});

  const diff = resolveDiff(old, nw);

  assert.deepEqual(
    diff.categories.inputs.removed.sort(),
    ['PasswordInput', 'TextInput'],
  );
  assert.deepEqual(diff.categories.inputs.added, []);
}

// ── Test 6b: category present only on new (missing on old) → all added ───────

{
  const old = makeSnap({});
  const nw = makeSnap({ hooks: okArray(['useBreakpoints', 'useMediaQuery']) });

  const diff = resolveDiff(old, nw);

  assert.deepEqual(diff.categories.hooks.removed, []);
  assert.deepEqual(
    diff.categories.hooks.added.sort(),
    ['useBreakpoints', 'useMediaQuery'],
  );
}

// ── Test 8: semantic with keys:null on new side → skipped, no crash ──────────

{
  const old = makeSnap({
    semantic: okSemantic([
      { groupName: 'surface', keys: ['surface-light'] },
    ]),
  });
  // New side has a malformed group: keys is null
  const nw = makeSnap({
    semantic: okSemantic([
      { groupName: 'surface', keys: null },
    ]),
  });

  const diff = resolveDiff(old, nw);

  assert.ok(!('semantic' in diff.categories), 'semantic should not be in categories when new has keys:null');
  assert.ok('semantic' in diff.skipped, 'semantic should appear in skipped');
  assert.ok(typeof diff.skipped.semantic === 'string', 'skipped reason should be a string');
}

// ── Test 9: semantic with malformed later element → skipped, no crash ─────────

{
  const old = makeSnap({
    semantic: okSemantic([
      { groupName: 'surface', keys: ['surface-light'] },
    ]),
  });
  // Second group is missing keys (not an array)
  const nw = makeSnap({
    semantic: okSemantic([
      { groupName: 'surface', keys: ['surface-light'] },
      { groupName: 'text' },
    ]),
  });

  const diff = resolveDiff(old, nw);

  assert.ok(!('semantic' in diff.categories), 'semantic should not be in categories when a later group is malformed');
  assert.ok('semantic' in diff.skipped, 'semantic should appear in skipped when later group is malformed');
}

// ── Test 7: versions are preserved ───────────────────────────────────────────

{
  const oldVersions = { '@rocket.chat/fuselage': '0.31.0' };
  const newVersions = { '@rocket.chat/fuselage': '0.32.0' };
  const old = makeSnap({}, oldVersions);
  const nw = makeSnap({}, newVersions);

  const diff = resolveDiff(old, nw);

  assert.deepEqual(diff.versions.old, oldVersions);
  assert.deepEqual(diff.versions.new, newVersions);
}

console.log('resolve-diff: all tests passed');
