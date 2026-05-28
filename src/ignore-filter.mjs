#!/usr/bin/env node
/**
 * ignore-filter.mjs — parse .fuselage-craft/ignore.md and suppress matching findings.
 *
 * Reads a markdown ignore file from <cwd>/.fuselage-craft/ignore.md.
 * Each H2 block opens a rule scope; list items describe path+line signatures to ignore.
 *
 * Format (frozen per todo.md):
 *   ## <ruleId>
 *   - path: <glob>
 *     line: <int>       (optional)
 *     reason: <text>    (required; missing → warn + skip)
 *
 * Rule IDs may contain `/` (e.g. fuselage-craft-gate/no-raw-color).
 * Glob support: `*` (no slash), `**` (any incl. slash), exact path.
 *
 * Usage:
 *   node src/ignore-filter.mjs <cwd>
 *
 * Exports: loadIgnore(cwd), filterFindings(findings, ignore)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ─── Glob → RegExp ────────────────────────────────────────────────────────────

/**
 * Escape all regex metacharacters in a string (except those we handle specially).
 */
function escapeRegexMeta(str) {
  return str.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a minimatch-style glob string to a RegExp anchored to the full string.
 *
 * Rules:
 *   **   → .*           (any characters including /)
 *   *    → [^/]*        (any characters except /)
 *   ?    → [^/]         (single character except /)
 *   rest → regex-escaped literal
 *
 * Anchored: ^ … $ so partial matches never suppress unrelated paths.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegExp(glob) {
  // Split on the special tokens we handle: **, *, ?
  // Process segment by segment so ** and * are never confused.
  const parts = glob.split(/(\*\*|\*|\?)/);
  let pattern = '';
  for (const part of parts) {
    if (part === '**') {
      pattern += '.*';
    } else if (part === '*') {
      pattern += '[^/]*';
    } else if (part === '?') {
      pattern += '[^/]';
    } else {
      pattern += escapeRegexMeta(part);
    }
  }
  return new RegExp('^' + pattern + '$');
}

/**
 * Return true if path matches the glob pattern.
 *
 * @param {string} pathGlob
 * @param {string} filePath
 * @returns {boolean}
 */
function matchGlob(pathGlob, filePath) {
  try {
    return globToRegExp(pathGlob).test(filePath);
  } catch {
    return false;
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse the markdown ignore file content into structured entries.
 *
 * State machine:
 *   - Lines outside any H2 block are ignored (allow top-of-file comments).
 *   - `## <ruleId>` opens a new rule block.
 *   - `- path: <glob>` opens a new entry within the current rule block.
 *   - Indented `  line: <int>` and `  reason: <text>` belong to the current entry.
 *   - A blank line, next `- path:`, or next `##` closes the current entry.
 *
 * @param {string} content   - raw file content
 * @returns {{ entries: Array<{rule,pathGlob,line?,reason}>, warnings: string[] }}
 */
function parseIgnoreContent(content) {
  const entries = [];
  const warnings = [];

  const lines = content.split('\n');

  let currentRule = null;   // string | null
  let currentEntry = null;  // { pathGlob, line?, reason? } | null
  let lineNumber = 0;

  function flushEntry() {
    if (!currentEntry) return;
    const entry = currentEntry;
    currentEntry = null;

    if (!entry.reason) {
      warnings.push(
        `ignore.md line ${entry._openedAt}: entry for rule "${currentRule}" path "${entry.pathGlob}" is missing a reason — skipped`,
      );
      return;
    }

    entries.push({
      rule: currentRule,
      pathGlob: entry.pathGlob,
      ...(entry.line !== undefined ? { line: entry.line } : {}),
      reason: entry.reason,
    });
  }

  for (const raw of lines) {
    lineNumber++;
    const line = raw;

    // H2 heading → new rule block
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      flushEntry();
      currentRule = h2Match[1].trim();
      continue;
    }

    // Outside any rule block → ignore
    if (currentRule === null) continue;

    // Blank line → close current entry
    if (line.trim() === '') {
      flushEntry();
      continue;
    }

    // List item: `- path: <glob>`
    const pathMatch = line.match(/^-\s+path:\s*(.+)$/);
    if (pathMatch) {
      flushEntry();
      currentEntry = {
        pathGlob: pathMatch[1].trim(),
        _openedAt: lineNumber,
      };
      continue;
    }

    // Indented `  line: <int>` — belongs to current entry
    const lineNumMatch = line.match(/^\s+line:\s*(\d+)\s*$/);
    if (lineNumMatch && currentEntry) {
      currentEntry.line = parseInt(lineNumMatch[1], 10);
      continue;
    }

    // Indented `  reason: <text>` — belongs to current entry
    const reasonMatch = line.match(/^\s+reason:\s*(.+)$/);
    if (reasonMatch && currentEntry) {
      currentEntry.reason = reasonMatch[1].trim();
      continue;
    }

    // Any other indented continuation — ignored (forward-compatible)
  }

  // Flush any trailing entry
  flushEntry();

  return { entries, warnings };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load and parse <cwd>/.fuselage-craft/ignore.md.
 *
 * Missing file → { entries: [], warnings: [] } (not an error).
 * Malformed entry (missing reason) → pushed to warnings, entry skipped.
 *
 * @param {string} cwd  - consumer project root
 * @returns {{ entries: Array<{rule: string, pathGlob: string, line?: number, reason: string}>, warnings: string[] }}
 */
export function loadIgnore(cwd) {
  const ignoreFile = join(cwd, '.fuselage-craft', 'ignore.md');

  if (!existsSync(ignoreFile)) {
    return { entries: [], warnings: [] };
  }

  let content;
  try {
    content = readFileSync(ignoreFile, 'utf8');
  } catch (err) {
    return { entries: [], warnings: [`ignore.md could not be read: ${err.message}`] };
  }

  return parseIgnoreContent(content);
}

/**
 * Partition findings into kept and suppressed sets.
 *
 * A finding is suppressed when at least one ignore entry matches on all three dimensions:
 *   1. entry.rule === finding.rule (accepts both `ruleId` and `rule` field names)
 *   2. glob match of entry.pathGlob against finding file path (accepts `filePath` or `file`)
 *   3. entry.line is undefined OR entry.line === finding.line
 *
 * @param {Array<Object>} findings  - each has {ruleId|rule, filePath|file, line?, ...}
 * @param {{ entries: Array<{rule, pathGlob, line?, reason}> }} ignore
 * @returns {{ kept: Array<Object>, suppressed: Array<Object> }}
 */
export function filterFindings(findings, ignore) {
  const kept = [];
  const suppressed = [];

  for (const finding of findings) {
    // Normalize field names: accept both alias forms
    const rule = finding.rule ?? finding.ruleId ?? '';
    const filePath = finding.file ?? finding.filePath ?? '';
    const line = finding.line;

    const matched = ignore.entries.some((entry) => {
      if (entry.rule !== rule) return false;
      if (!matchGlob(entry.pathGlob, filePath)) return false;
      if (entry.line !== undefined && entry.line !== line) return false;
      return true;
    });

    if (matched) {
      suppressed.push(finding);
    } else {
      kept.push(finding);
    }
  }

  return { kept, suppressed };
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const cwd = process.argv[2] ?? process.cwd();
  const { entries, warnings } = loadIgnore(cwd);

  if (warnings.length > 0) {
    for (const w of warnings) {
      console.warn('[ignore-filter] WARNING:', w);
    }
  }

  if (entries.length === 0) {
    console.log('No ignore entries found.');
  } else {
    console.log(`Loaded ${entries.length} ignore ${entries.length === 1 ? 'entry' : 'entries'}:\n`);
    for (const entry of entries) {
      const linePart = entry.line !== undefined ? `  line    : ${entry.line}` : '';
      console.log(`  rule    : ${entry.rule}`);
      console.log(`  path    : ${entry.pathGlob}`);
      if (linePart) console.log(linePart);
      console.log(`  reason  : ${entry.reason}`);
      console.log('');
    }
  }
}
