/**
 * Tests for command list sync across:
 *   - adapters/claude-code/command-metadata.json (source of truth)
 *   - adapters/claude-code/SKILL.md (## Commands router table)
 *   - adapters/claude-code/README.md (## Commands table)
 *   - root README.md (## Commands table)
 *   - adapters/claude-code/reference/<cmd>.md files (no orphans)
 *
 * Run via: node test/run-tests.mjs (from repo root)
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fsp } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ADAPTER_DIR = resolve(ROOT, 'adapters/claude-code');

const METADATA_PATH = resolve(ADAPTER_DIR, 'command-metadata.json');
const SKILL_PATH = resolve(ADAPTER_DIR, 'SKILL.md');
const ADAPTER_README_PATH = resolve(ADAPTER_DIR, 'README.md');
const ROOT_README_PATH = resolve(ROOT, 'README.md');
const REFERENCE_DIR = resolve(ADAPTER_DIR, 'reference');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeWhitespace(str) {
  return str.replace(/\s+/g, ' ').trim();
}

function stripCommandName(cell) {
  // strip markdown backticks and bold/link syntax around a command name cell
  return cell.replace(/`/g, '').trim();
}

function extractLinkTarget(cell) {
  const match = cell.match(/\(([^)]+)\)/);
  return match ? match[1].trim() : null;
}

/**
 * Extracts the first markdown table found after a "## Commands" heading.
 * Returns an array of row-cell arrays (header + separator rows excluded).
 */
function parseCommandsTable(content, sourceLabel) {
  const lines = content.split('\n');
  const headingIdx = lines.findIndex((line) => line.trim() === '## Commands');
  if (headingIdx === -1) {
    throw new Error(`${sourceLabel}: could not find "## Commands" heading`);
  }

  let tableStart = -1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith('|')) {
      tableStart = i;
      break;
    }
  }
  if (tableStart === -1) {
    throw new Error(`${sourceLabel}: could not find a table after "## Commands"`);
  }

  const rows = [];
  for (let i = tableStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) break;
    rows.push(line);
  }

  // rows[0] = header, rows[1] = separator (---), rows[2..] = data rows
  const dataRows = rows.slice(2);

  return dataRows.map((row) => {
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
    return cells;
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testMetadataShape() {
  const raw = await fsp.readFile(METADATA_PATH, 'utf8');
  const parsed = JSON.parse(raw); // throws on invalid JSON

  if (!Array.isArray(parsed.commands) || parsed.commands.length === 0) {
    throw new Error('command-metadata.json: expected non-empty "commands" array');
  }

  for (const entry of parsed.commands) {
    for (const field of ['name', 'category', 'purpose', 'referenceFile']) {
      if (!entry[field] || typeof entry[field] !== 'string') {
        throw new Error(
          `command-metadata.json: entry ${JSON.stringify(entry.name ?? entry)} missing required field "${field}"`,
        );
      }
    }

    const refPath = resolve(ADAPTER_DIR, entry.referenceFile);
    try {
      await fsp.access(refPath);
    } catch {
      throw new Error(
        `command-metadata.json: command "${entry.name}" referenceFile "${entry.referenceFile}" does not exist on disk`,
      );
    }
  }
}

async function loadMetadataCommands() {
  const raw = await fsp.readFile(METADATA_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const map = new Map();
  for (const entry of parsed.commands) {
    map.set(entry.name, entry);
  }
  return map;
}

async function testSkillMdSync() {
  const metadata = await loadMetadataCommands();
  const content = await fsp.readFile(SKILL_PATH, 'utf8');
  const rows = parseCommandsTable(content, 'SKILL.md');

  const skillCommands = new Map();
  for (const cells of rows) {
    if (cells.length < 4) continue; // tolerate malformed/short rows, name check below will catch drift
    const name = stripCommandName(cells[0]);
    const category = cells[1].trim();
    const purpose = normalizeWhitespace(cells[2]);
    const referenceTarget = extractLinkTarget(cells[3]);
    skillCommands.set(name, { category, purpose, referenceTarget });
  }

  // Bidirectional: every metadata command has a row, and vice versa.
  for (const name of metadata.keys()) {
    if (!skillCommands.has(name)) {
      throw new Error(`SKILL.md: missing router row for command "${name}"`);
    }
  }
  for (const name of skillCommands.keys()) {
    if (!metadata.has(name)) {
      throw new Error(`SKILL.md: router row for unknown command "${name}" (not in command-metadata.json)`);
    }
  }

  for (const [name, meta] of metadata) {
    const row = skillCommands.get(name);

    if (row.category !== meta.category) {
      throw new Error(
        `SKILL.md: command "${name}" category mismatch — table has "${row.category}", metadata has "${meta.category}"`,
      );
    }

    const expectedPurpose = normalizeWhitespace(meta.purpose);
    if (row.purpose !== expectedPurpose) {
      throw new Error(
        `SKILL.md: command "${name}" "What it does" text does not match metadata purpose exactly.\n  table: ${row.purpose}\n  metadata: ${expectedPurpose}`,
      );
    }

    if (row.referenceTarget !== meta.referenceFile) {
      throw new Error(
        `SKILL.md: command "${name}" Reference link targets "${row.referenceTarget}", expected "${meta.referenceFile}"`,
      );
    }
  }
}

async function testReadmeTableSync(readmePath, sourceLabel) {
  const metadata = await loadMetadataCommands();
  const content = await fsp.readFile(readmePath, 'utf8');
  const rows = parseCommandsTable(content, sourceLabel);

  const readmeCommands = new Map();
  for (const cells of rows) {
    if (cells.length < 3) continue;
    const name = stripCommandName(cells[0]);
    const category = cells[1].trim();
    const purpose = cells[2].trim();
    readmeCommands.set(name, { category, purpose });
  }

  for (const name of metadata.keys()) {
    if (!readmeCommands.has(name)) {
      throw new Error(`${sourceLabel}: missing table row for command "${name}"`);
    }
  }
  for (const name of readmeCommands.keys()) {
    if (!metadata.has(name)) {
      throw new Error(`${sourceLabel}: table row for unknown command "${name}" (not in command-metadata.json)`);
    }
  }

  for (const [name, meta] of metadata) {
    const row = readmeCommands.get(name);

    if (row.category !== meta.category) {
      throw new Error(
        `${sourceLabel}: command "${name}" category mismatch — table has "${row.category}", metadata has "${meta.category}"`,
      );
    }

    if (row.purpose.length === 0) {
      throw new Error(`${sourceLabel}: command "${name}" has an empty "What it does" cell`);
    }
  }
}

async function testAdapterReadmeSync() {
  await testReadmeTableSync(ADAPTER_README_PATH, 'adapters/claude-code/README.md');
}

async function testRootReadmeSync() {
  await testReadmeTableSync(ROOT_README_PATH, 'README.md');
}

async function testNoOrphanReferenceFiles() {
  const metadata = await loadMetadataCommands();
  const referencedFiles = new Set(
    Array.from(metadata.values()).map((entry) => entry.referenceFile.replace(/^reference\//, '')),
  );

  const files = await fsp.readdir(REFERENCE_DIR);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  for (const file of mdFiles) {
    if (!referencedFiles.has(file)) {
      throw new Error(
        `adapters/claude-code/reference/${file}: orphan reference file with no corresponding command-metadata.json entry`,
      );
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const tests = [
  { name: 'metadataShape', fn: testMetadataShape },
  { name: 'skillMdSync', fn: testSkillMdSync },
  { name: 'adapterReadmeSync', fn: testAdapterReadmeSync },
  { name: 'rootReadmeSync', fn: testRootReadmeSync },
  { name: 'noOrphanReferenceFiles', fn: testNoOrphanReferenceFiles },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    await test.fn();
    passed++;
  } catch (err) {
    failed++;
    throw new Error(`command-table-sync: ${test.name} failed: ${err.message}`);
  }
}

console.log(`command-table-sync: all ${passed} tests passed`);
