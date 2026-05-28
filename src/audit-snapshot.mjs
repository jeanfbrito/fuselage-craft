#!/usr/bin/env node
/**
 * audit-snapshot.mjs — snapshot persistence for the fuselage-craft gate.
 *
 * Each gate run (with --snapshot) writes a structured JSON snapshot to:
 *   .fuselage-craft/audit/<ISO-safe-timestamp>.json
 * and copies it to:
 *   .fuselage-craft/audit/latest.json
 *
 * The polish skill reads latest.json as its P0 fix backlog. The trend
 * subcommand surfaces drift across consecutive runs.
 *
 * Schema v1 is frozen — see docs/todo.md and README. Never add
 * Fuselage token / component / color literal strings to this file.
 * Schema field names (rule IDs) are allowed; they are structural keys.
 *
 * CLI entry points:
 *   node audit-snapshot.mjs latest [--kind audit|critique] [--slug <slug>] [--cwd <dir>]
 *   node audit-snapshot.mjs trend [N] [--kind audit|critique] [--slug <slug>] [--cwd <dir>]
 *   node audit-snapshot.mjs write [--input <path>] [--kind audit|critique] [--slug <slug>] [--cwd <dir>]
 *
 * Exports:
 *   writeSnapshot(result, { cwd, fuselageVersion, kind, slug }) → Promise<{ path, snapshot }>
 *   readLatest(cwd, { kind, slug }) → snapshot | null
 *   readTrend(cwd, n, { kind, slug }) → snapshot[]
 *
 * kind='audit' (default): writes to .fuselage-craft/audit/
 * kind='critique': requires slug; writes to .fuselage-craft/critique/<slug>/
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 1;
const AUDIT_DIR_NAME = path.join('.fuselage-craft', 'audit');
const CRITIQUE_BASE_DIR_NAME = path.join('.fuselage-craft', 'critique');
const LATEST_FILENAME = 'latest.json';

// ─── Timestamp ────────────────────────────────────────────────────────────────

/**
 * Filename-safe UTC ISO timestamp.
 * Colons and dots are replaced with hyphens so the name is valid on
 * Windows (colons forbidden), Mac, and Linux.
 * Example: 2026-05-28T14-30-00-000Z
 */
function nowFilenameStamp(date = new Date()) {
  // toISOString() → "2026-05-28T14:30:00.123Z"
  // Replace colons and the dot before milliseconds with hyphens.
  return date.toISOString().replace(/[:.]/g, '-').replace(/-(\d+)Z$/, '-$1Z');
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve the storage directory for a given kind/slug combination.
 *
 * kind='audit' (default) → <cwd>/.fuselage-craft/audit/
 * kind='critique'        → <cwd>/.fuselage-craft/critique/<slug>/
 *
 * Slug validation is the caller's responsibility — this function only builds
 * the path. Callers that accept user input must reject a missing slug before
 * calling this.
 */
function snapshotDir(cwd, { kind = 'audit', slug } = {}) {
  if (kind === 'critique') {
    return path.join(cwd, CRITIQUE_BASE_DIR_NAME, slug);
  }
  return path.join(cwd, AUDIT_DIR_NAME);
}

function latestPath(cwd, opts) {
  return path.join(snapshotDir(cwd, opts), LATEST_FILENAME);
}

// ─── Snapshot assembly ────────────────────────────────────────────────────────

/**
 * Assemble a schema-v1 snapshot object from a gate result.
 *
 * result shape:
 *   {
 *     lint: { findings: [{ruleId, filePath, line, column, messageId, severity}], filesScanned: N },
 *     typecheck: { errorCount: N, files: [...] } | null,
 *     companions: { missing: [...] } | null
 *   }
 *
 * severity in findings: 1 = warn, 2 = error (ESLint convention).
 */
function assembleSnapshot(result, { fuselageVersion = null, timestamp = new Date() } = {}) {
  const lint = result.lint ?? { findings: [], filesScanned: 0 };
  const findings = lint.findings ?? [];

  // Aggregate per-rule counts
  const lintRulesCount = {};
  for (const f of findings) {
    const id = f.ruleId ?? 'unknown';
    lintRulesCount[id] = (lintRulesCount[id] ?? 0) + 1;
  }

  // Map findings to schema shape (relative-ish file path preserved from caller)
  const schemaFindings = findings.map((f) => ({
    rule: f.ruleId ?? 'unknown',
    file: f.filePath ?? '',
    line: f.line ?? 0,
    column: f.column ?? 0,
    messageId: f.messageId ?? '',
    severity: f.severity === 2 ? 'error' : 'warn',
  }));

  // Compute totals
  let errors = 0;
  let warnings = 0;
  for (const f of findings) {
    if (f.severity === 2) errors++;
    else warnings++;
  }

  // Typecheck block
  const typecheck = result.typecheck
    ? { errorCount: result.typecheck.errorCount ?? 0, files: result.typecheck.files ?? [] }
    : { errorCount: 0, files: [] };

  // Companions block
  const companions = result.companions
    ? { missing: result.companions.missing ?? [] }
    : { missing: [] };

  return {
    version: SCHEMA_VERSION,
    timestamp: timestamp instanceof Date ? timestamp.toISOString() : timestamp,
    fuselageVersion: fuselageVersion ?? null,
    lintRulesCount,
    findings: schemaFindings,
    typecheck,
    companions,
    totals: {
      errors,
      warnings,
      filesScanned: lint.filesScanned ?? 0,
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Write a snapshot for the given gate result.
 *
 * kind='audit' (default):
 *   Creates .fuselage-craft/audit/ if absent.
 *   Writes <ISO-timestamp>.json and copies to latest.json.
 *
 * kind='critique':
 *   Requires slug. Creates .fuselage-craft/critique/<slug>/ if absent.
 *   Writes <ISO-timestamp>.json and copies to latest.json.
 *
 * latest.json is always a copy, not a symlink — symlinks are non-portable
 * on Windows without elevated privileges.
 *
 * @param {object} result  - gate result (see assembleSnapshot)
 * @param {{ cwd?: string, fuselageVersion?: string, kind?: string, slug?: string }} opts
 * @returns {Promise<{ path: string, snapshot: object }>}
 */
export async function writeSnapshot(
  result,
  { cwd = process.cwd(), fuselageVersion = null, kind = 'audit', slug } = {},
) {
  if (kind === 'critique' && !slug) {
    throw new Error('slug required for kind=critique');
  }

  const now = new Date();
  const snapshot = assembleSnapshot(result, { fuselageVersion, timestamp: now });

  const dirOpts = { kind, slug };
  const dir = snapshotDir(cwd, dirOpts);
  await fsp.mkdir(dir, { recursive: true });

  const stamp = nowFilenameStamp(now);
  const snapshotPath = path.join(dir, `${stamp}.json`);
  const json = JSON.stringify(snapshot, null, 2);

  await fsp.writeFile(snapshotPath, json, 'utf-8');
  await fsp.writeFile(latestPath(cwd, dirOpts), json, 'utf-8'); // copy, not symlink

  return { path: snapshotPath, snapshot };
}

/**
 * Return the parsed latest.json snapshot, or null if none exists.
 *
 * kind='audit' (default): reads .fuselage-craft/audit/latest.json
 * kind='critique': requires slug; reads .fuselage-craft/critique/<slug>/latest.json
 *
 * Returns null if the directory or file is missing.
 *
 * @param {string} [cwd]
 * @param {{ kind?: string, slug?: string }} [opts]
 * @returns {object|null}
 */
export function readLatest(cwd = process.cwd(), { kind = 'audit', slug } = {}) {
  const dirOpts = { kind, slug };
  const dir = snapshotDir(cwd, dirOpts);
  if (!fs.existsSync(dir)) return null;
  const p = latestPath(cwd, dirOpts);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Return the last N snapshots by timestamp descending.
 * Reads all timestamped JSON files in the relevant dir (excludes latest.json),
 * sorts by filename (ISO-safe stamps sort lexicographically = chronologically),
 * and returns the last N parsed as objects, newest first.
 *
 * kind='audit' (default): reads from .fuselage-craft/audit/
 * kind='critique': requires slug; reads from .fuselage-craft/critique/<slug>/
 *
 * @param {string} [cwd]
 * @param {number} [n=5]
 * @param {{ kind?: string, slug?: string }} [opts]
 * @returns {object[]}
 */
export function readTrend(cwd = process.cwd(), n = 5, { kind = 'audit', slug } = {}) {
  const dir = snapshotDir(cwd, { kind, slug });
  if (!fs.existsSync(dir)) return [];

  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }

  // Exclude latest.json; include only .json files that look like timestamps
  const stamped = files
    .filter((f) => f.endsWith('.json') && f !== LATEST_FILENAME)
    .sort(); // lexicographic = chronological for ISO-safe stamps

  const slice = stamped.slice(-n).reverse(); // last N, newest first

  const results = [];
  for (const f of slice) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      results.push(parsed);
    } catch {
      // skip corrupt files
    }
  }
  return results;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseFlagValue(argv, flag) {
  const idx = argv.indexOf(flag);
  if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
  return null;
}

function parseCwdFlag(argv) {
  return parseFlagValue(argv, '--cwd') ?? process.cwd();
}

function parseKindFlag(argv) {
  return parseFlagValue(argv, '--kind') ?? 'audit';
}

function parseSlugFlag(argv) {
  return parseFlagValue(argv, '--slug') ?? undefined;
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const cwd = parseCwdFlag(rest);
  const kind = parseKindFlag(rest);
  const slug = parseSlugFlag(rest);

  switch (cmd) {
    case 'latest': {
      let snapshot;
      try {
        snapshot = readLatest(cwd, { kind, slug });
      } catch (err) {
        process.stderr.write(`audit-snapshot: ${err.message}\n`);
        process.exit(1);
      }
      if (!snapshot) {
        process.stderr.write('audit-snapshot: no latest snapshot found\n');
        process.exit(2);
      }
      process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');
      return;
    }

    case 'trend': {
      // trend [N] [--kind <kind>] [--slug <slug>] [--cwd <dir>]
      const maybeN = rest.find((a) => /^\d+$/.test(a));
      const n = maybeN ? Number(maybeN) : 5;
      const snapshots = readTrend(cwd, n, { kind, slug });
      process.stdout.write(JSON.stringify(snapshots, null, 2) + '\n');
      return;
    }

    case 'write': {
      // write [--input <path>] [--kind <kind>] [--slug <slug>] [--cwd <dir>]
      // Reads JSON from --input file or stdin; writes snapshot.
      let raw;
      const inputIdx = rest.indexOf('--input');
      if (inputIdx !== -1 && rest[inputIdx + 1]) {
        try {
          raw = fs.readFileSync(rest[inputIdx + 1], 'utf-8');
        } catch (err) {
          process.stderr.write(`audit-snapshot write: cannot read input file: ${err.message}\n`);
          process.exit(1);
        }
      } else {
        // Read from stdin
        const chunks = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        raw = Buffer.concat(chunks).toString('utf-8');
      }

      let result;
      try {
        result = JSON.parse(raw);
      } catch (err) {
        process.stderr.write(`audit-snapshot write: invalid JSON input: ${err.message}\n`);
        process.exit(1);
      }

      // Allow optional fuselageVersion in the input envelope
      const fuselageVersion = result.fuselageVersion ?? null;
      const gateResult = result.lint !== undefined ? result : { lint: result, typecheck: null, companions: null };

      const { path: written } = await writeSnapshot(gateResult, { cwd, fuselageVersion, kind, slug });
      process.stdout.write(`${written}\n`);
      return;
    }

    default:
      process.stderr.write(
        'usage: audit-snapshot.mjs <latest|trend [N]|write [--input <path>]> [--kind audit|critique] [--slug <slug>] [--cwd <dir>]\n',
      );
      process.exit(1);
  }
}

// ─── isMain guard (symlink-safe, mirrors resolve.mjs / critique-storage.mjs) ──

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return (
      fs.realpathSync(fileURLToPath(import.meta.url)) ===
      fs.realpathSync(process.argv[1])
    );
  } catch {
    // pathToFileURL normalises Windows paths; keep as fallback when realpath
    // is unavailable (e.g. in some containerised environments).
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

if (isMainModule()) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`audit-snapshot: ${err.message}\n`);
    process.exit(1);
  });
}
