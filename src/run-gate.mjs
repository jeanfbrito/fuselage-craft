#!/usr/bin/env node
/**
 * run-gate.mjs — ESM orchestrator for the fuselage-craft gate.
 *
 * Runs:
 *   1. Lint gate — programmatic ESLint with the local gate config
 *   2. Type gate — spawns typecheck.mjs (which runs tsc --noEmit)
 *
 * Usage:
 *   fuselage-gate [globs...]
 *   node <repo>/bin/fuselage-gate.mjs [globs...]
 *   node <repo>/src/run-gate.mjs 'src/**\/*.{ts,tsx}'
 *
 * Exits nonzero if lint errors > 0 OR tsc exits nonzero.
 * Warnings do NOT fail the gate.
 */

import { ESLint } from 'eslint';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve as pathResolve, relative, join } from 'path';
import { argv, exit, cwd } from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// GATE_DIR is the directory of this file (src/)
const GATE_DIR = __dirname;

const DEFAULT_GLOBS = ['src/**/*.{ts,tsx}'];
const targetGlobs = argv.slice(2).length > 0 ? argv.slice(2) : DEFAULT_GLOBS;

// ─── Live Fuselage control list ───────────────────────────────────────────────

/**
 * Load the live list of Fuselage input control primitive names from the resolver.
 * These are the actual user-facing controls (TextInput, Select, CheckBox, etc.) —
 * NOT the Field wrapper family (Field, FieldRow, FieldGroup...) which is `forms`.
 * These are passed as the `controls` option to the require-field-wrapper rule
 * so no Fuselage names are baked into the rule itself.
 *
 * On failure, returns null and the rule falls back to its raw-HTML default.
 */
async function loadLiveFuselageControls() {
  // resolve.mjs lives alongside this file in src/
  const resolverPath = pathToFileURL(join(GATE_DIR, 'resolve.mjs')).href;
  try {
    const { resolveCategory } = await import(resolverPath);
    const result = await resolveCategory('inputs');
    if (result.status === 'ok' && Array.isArray(result.data) && result.data.length > 0) {
      return result.data;
    }
    process.stderr.write(
      `run-gate: resolver returned ${result.status} for inputs: ${result.reason ?? ''}\n`,
    );
    return null;
  } catch (err) {
    process.stderr.write(
      `run-gate: could not load resolver (${err.message}); require-field-wrapper will use raw-HTML default\n`,
    );
    return null;
  }
}

/**
 * Load the live semantic color palette from the resolver.
 * This is passed as the `palette` option to the valid-color-token rule so no
 * Fuselage token names are baked into the rule itself.
 *
 * Returns the semantic data array on success, or null on failure (rule no-ops).
 */
async function loadLivePalette() {
  const resolverPath = pathToFileURL(join(GATE_DIR, 'resolve.mjs')).href;
  try {
    const { resolveCategory } = await import(resolverPath);
    const result = await resolveCategory('semantic');
    if (result.status === 'ok' && Array.isArray(result.data) && result.data.length > 0) {
      return result.data;
    }
    process.stderr.write(
      `run-gate: resolver returned ${result.status} for semantic: ${result.reason ?? ''}\n`,
    );
    return null;
  } catch (err) {
    process.stderr.write(
      `run-gate: could not load semantic palette (${err.message}); valid-color-token will no-op\n`,
    );
    return null;
  }
}

/**
 * Load the live deprecated Fuselage export list from the resolver.
 * This is passed as the `deprecated` option to the no-deprecated-fuselage-export
 * rule so no Fuselage names are baked into the rule itself.
 *
 * Returns the deprecated data array on success, or null on failure (rule no-ops).
 */
async function loadLiveDeprecated() {
  const resolverPath = pathToFileURL(join(GATE_DIR, 'resolve.mjs')).href;
  try {
    const { resolveDeprecated } = await import(resolverPath);
    const result = await resolveDeprecated();
    if (result.status === 'ok' && Array.isArray(result.data)) {
      return result.data;
    }
    process.stderr.write(
      `run-gate: resolver returned ${result.status} for deprecated: ${result.reason ?? ''}\n`,
    );
    return null;
  } catch (err) {
    process.stderr.write(
      `run-gate: could not load deprecated list (${err.message}); no-deprecated-fuselage-export will no-op\n`,
    );
    return null;
  }
}

// ─── Lint gate ────────────────────────────────────────────────────────────────

async function runLintGate(fuselageControls, livePalette, liveDeprecated) {
  // Build rule options for require-field-wrapper.
  // If we have a live control list, merge it with the raw-HTML defaults.
  const rawHtml = ['input', 'select', 'textarea'];
  const controls = fuselageControls
    ? [...new Set([...rawHtml, ...fuselageControls])]
    : null; // null = rule uses its own DEFAULT_CONTROLS (raw HTML only)

  // Build overrideConfig combining require-field-wrapper and valid-color-token options.
  // Both rules degrade gracefully when their live data is absent.
  const overrideRules = {};
  if (controls) {
    // 'warn': a missing Field wrapper is an a11y recommendation (toolbar/filter inputs
    // legitimately skip it), not a hard conformance failure. Informs without blocking.
    overrideRules['fuselage-craft-gate/require-field-wrapper'] = ['warn', { controls }];
  }
  if (livePalette) {
    overrideRules['fuselage-craft-gate/valid-color-token'] = ['error', { palette: livePalette }];
  }
  if (liveDeprecated && liveDeprecated.length > 0) {
    overrideRules['fuselage-craft-gate/no-deprecated-fuselage-export'] = ['warn', { deprecated: liveDeprecated }];
  }

  const overrideConfig = Object.keys(overrideRules).length > 0
    ? [{ rules: overrideRules }]
    : undefined;

  const eslint = new ESLint({
    overrideConfigFile: pathResolve(GATE_DIR, 'eslint.config.mjs'),
    ...(overrideConfig ? { overrideConfig } : {}),
    // Let the consumer's cwd be the base for glob resolution
    cwd: cwd(),
  });

  let results;
  try {
    results = await eslint.lintFiles(targetGlobs);
  } catch (err) {
    process.stderr.write(`Lint gate error: ${err.message}\n`);
    return { errors: 1, warnings: 0 };
  }

  // Honesty guard: a file OUTSIDE the cwd base path matches no flat-config block
  // (`files: ['**/*...']` only matches under cwd), so ESLint lints it with ZERO
  // rules and returns a clean result — a silent false PASS. Refuse to report PASS
  // for any target that was processed without the gate's own rules attached.
  let unconfigured = 0;
  for (const result of results) {
    let cfg;
    try {
      cfg = await eslint.calculateConfigForFile(result.filePath);
    } catch {
      cfg = undefined;
    }
    const gated =
      cfg &&
      cfg.rules &&
      Object.keys(cfg.rules).some((k) => k.startsWith('fuselage-craft-gate/'));
    if (!gated) {
      process.stderr.write(
        `Lint gate: '${relative(cwd(), result.filePath)}' is outside the cwd base path — ` +
          `the gate config did not apply to it, so it was NOT checked. Run the gate from the ` +
          `consumer repo root and target paths under it (e.g. src/**).\n`,
      );
      unconfigured += 1;
    }
  }

  let totalErrors = unconfigured;
  let totalWarnings = 0;

  for (const result of results) {
    if (result.messages.length === 0) continue;

    const relPath = relative(cwd(), result.filePath);
    for (const msg of result.messages) {
      const severity = msg.severity === 2 ? 'error' : 'warn';
      const loc = `${relPath}:${msg.line}:${msg.column}`;
      const ruleId = msg.ruleId ? ` [${msg.ruleId}]` : '';
      process.stdout.write(`${severity}  ${loc}${ruleId}  ${msg.message}\n`);
    }

    totalErrors += result.errorCount;
    totalWarnings += result.warningCount;
  }

  return { errors: totalErrors, warnings: totalWarnings };
}

// ─── Companion gate ───────────────────────────────────────────────────────────

/**
 * Run the companion-reconciliation check by dynamically importing
 * reconcileCompanions from resolve.mjs (same pattern as loadLivePalette /
 * loadLiveFuselageControls).  Never throws; on any infra failure returns
 * { status:'unavailable', reason, missing:[] }.
 */
async function runCompanionGate() {
  const resolverPath = pathToFileURL(join(GATE_DIR, 'resolve.mjs')).href;
  try {
    const { reconcileCompanions } = await import(resolverPath);
    return await reconcileCompanions();
  } catch (err) {
    return { status: 'unavailable', reason: err.message, missing: [] };
  }
}

// ─── Type gate ────────────────────────────────────────────────────────────────

function runTypeGate() {
  return new Promise((promiseResolve) => {
    // typecheck.mjs lives alongside this file in src/
    const scriptPath = new URL('./typecheck.mjs', import.meta.url).pathname;

    const child = spawn(process.execPath, [scriptPath], {
      stdio: 'inherit',
      shell: false,
    });

    child.on('close', (code) => {
      promiseResolve(code ?? 1);
    });

    child.on('error', (err) => {
      process.stderr.write(
        `Type gate: failed to spawn typecheck: ${err.message}\n`,
      );
      promiseResolve(1);
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

process.stdout.write(
  `\nfuselage-craft gate — targeting: ${targetGlobs.join(', ')}\n\n`,
);

// Load live Fuselage form control list before lint (degrade gracefully on failure)
const fuselageControls = await loadLiveFuselageControls();
if (fuselageControls) {
  process.stdout.write(
    `resolver: loaded ${fuselageControls.length} Fuselage input controls for require-field-wrapper\n`,
  );
} else {
  process.stdout.write(
    `resolver: could not load Fuselage input controls — require-field-wrapper will check raw HTML only\n`,
  );
}

// Load live semantic palette for valid-color-token (degrade gracefully on failure)
const livePalette = await loadLivePalette();
if (livePalette) {
  const tokenCount = livePalette.reduce((n, g) => n + g.keys.length, 0);
  process.stdout.write(
    `resolver: loaded ${tokenCount} semantic color tokens across ${livePalette.length} groups for valid-color-token\n`,
  );
} else {
  process.stdout.write(
    `resolver: could not load semantic palette — valid-color-token will no-op\n`,
  );
}

// Load live deprecated export list for no-deprecated-fuselage-export (degrade gracefully)
const liveDeprecated = await loadLiveDeprecated();
if (liveDeprecated) {
  process.stdout.write(
    `resolver: loaded ${liveDeprecated.length} deprecated export${liveDeprecated.length !== 1 ? 's' : ''} for no-deprecated-fuselage-export\n`,
  );
} else {
  process.stdout.write(
    `resolver: could not load deprecated export list — no-deprecated-fuselage-export will no-op\n`,
  );
}

process.stdout.write('─── Lint gate ───────────────────────────────────────\n');
const { errors: lintErrors, warnings: lintWarnings } = await runLintGate(fuselageControls, livePalette, liveDeprecated);

process.stdout.write(
  '\n─── Type gate ───────────────────────────────────────\n',
);
const typeExitCode = await runTypeGate();

process.stdout.write(
  '\n─── Companion gate ──────────────────────────────────\n',
);
const companionResult = await runCompanionGate();
const companionStatus = companionResult.status;

if (companionResult.note) {
  // Minified-only install: no coverage, but not a failure
  process.stdout.write(`NOTE: ${companionResult.note}\n`);
  process.stdout.write(`Companion gate: PASS (no coverage — minified-only bundle; rely on runtime launch)\n`);
} else if (companionStatus === 'ok') {
  const reconciledCount = Object.values(companionResult.checked ?? {}).reduce(
    (n, pkg) => n + (pkg.imports ?? 0),
    0,
  );
  process.stdout.write(
    `Companion gate: PASS — ${reconciledCount} companion symbols reconciled\n`,
  );
} else if (companionStatus === 'missing') {
  for (const entry of companionResult.missing) {
    process.stdout.write(
      `✗ ${entry.companion} does not export '${entry.symbol}' (imported by ${entry.importedBy})\n`,
    );
  }
  process.stdout.write(
    `→ bump the companion package(s) above to versions that export these symbols\n`,
  );
} else {
  // unavailable — infra failure, note only
  process.stdout.write(
    `NOTE: companion reconciliation unavailable — ${companionResult.reason ?? 'unknown error'}\n`,
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────

process.stdout.write('\n═════════════════════════════════════════════════════\n');
const typeStatus = typeExitCode === 0 ? 'PASS' : 'FAIL';
const lintStatus = lintErrors > 0 ? 'FAIL' : 'PASS';
const companionSummaryStatus =
  companionResult.note ? 'PASS' :
  companionStatus === 'ok' ? 'PASS' : companionStatus === 'missing' ? 'FAIL' : 'SKIP';

process.stdout.write(`Type gate      : ${typeStatus}\n`);
process.stdout.write(
  `Lint gate      : ${lintStatus}  (${lintErrors} errors, ${lintWarnings} warnings)\n`,
);
process.stdout.write(`Companion gate : ${companionSummaryStatus}\n`);
process.stdout.write('═════════════════════════════════════════════════════\n\n');

const failed = lintErrors > 0 || typeExitCode !== 0 || companionStatus === 'missing';
exit(failed ? 1 : 0);
