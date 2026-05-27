#!/usr/bin/env node
/**
 * run-tests.mjs — runs all rule RuleTester suites.
 *
 * Each test module calls RuleTester.run() which throws on failure.
 * All nine suites must pass or the process exits nonzero.
 *
 * Usage (from repo root):
 *   node test/run-tests.mjs
 */

const suites = [
  './no-raw-color.test.mjs',
  './no-literal-dimension.test.mjs',
  './no-literal-shadow.test.mjs',
  './no-literal-media-query.test.mjs',
  './require-field-wrapper.test.mjs',
  './prefer-box.test.mjs',
  './valid-color-token.test.mjs',
  './resolve-diff.test.mjs',
  './reconcile-companions.test.mjs',
];

let passed = 0;
let failed = 0;
const failures = [];

for (const suite of suites) {
  try {
    await import(new URL(suite, import.meta.url).href);
    passed++;
  } catch (err) {
    failed++;
    failures.push({ suite, err });
    process.stderr.write(`\nFAIL: ${suite}\n${err.message}\n`);
    if (err.cause) {
      process.stderr.write(`  cause: ${err.cause}\n`);
    }
  }
}

process.stdout.write(
  `\n────────────────────────────────────────────────\n`,
);
process.stdout.write(`Test results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.stdout.write(`\nFailed suites:\n`);
  for (const { suite } of failures) {
    process.stdout.write(`  - ${suite}\n`);
  }
  process.exit(1);
} else {
  process.stdout.write(`All gate rule tests passed.\n`);
}
