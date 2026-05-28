#!/usr/bin/env node
/**
 * critique-ignore.mjs — parse .fuselage-craft/critique-ignore.md and suppress matching findings.
 *
 * Reads a markdown ignore file from <cwd>/.fuselage-craft/critique-ignore.md.
 * Each H2 block opens a slug scope; list items describe category+optional-contains signatures.
 *
 * Format:
 *   ## <slug>
 *   - category: hierarchy
 *     contains: "specific phrase from finding message"
 *     reason: accepted — stylistic choice on this surface
 *
 * `contains:` is optional (omitted = wildcard within slug+category).
 * `reason:` is required — missing → warn + skip entry.
 *
 * Usage:
 *   node src/critique-ignore.mjs <cwd>
 *
 * Exports: loadCritiqueIgnore(cwd), filterCritiqueFindings(findings, ignore)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse the markdown critique-ignore file content into structured entries.
 *
 * State machine:
 *   - Lines outside any H2 block are ignored (allow top-of-file comments).
 *   - `## <slug>` opens a new slug block.
 *   - `- category: <name>` opens a new entry within the current slug block.
 *   - Indented `  contains: <text>` and `  reason: <text>` belong to the current entry.
 *   - A blank line, next `- category:`, or next `##` closes the current entry.
 *
 * @param {string} content   - raw file content
 * @returns {{ entries: Array<{slug, category, contains?, reason}>, warnings: string[] }}
 */
function parseCritiqueIgnoreContent(content) {
  const entries = [];
  const warnings = [];

  const lines = content.split('\n');

  let currentSlug = null;   // string | null
  let currentEntry = null;  // { category, contains?, reason? } | null
  let lineNumber = 0;

  function flushEntry() {
    if (!currentEntry) return;
    const entry = currentEntry;
    currentEntry = null;

    if (!entry.reason) {
      warnings.push(
        `critique-ignore.md line ${entry._openedAt}: entry for slug "${currentSlug}" category "${entry.category}" is missing a reason — skipped`,
      );
      return;
    }

    entries.push({
      slug: currentSlug,
      category: entry.category,
      ...(entry.contains !== undefined ? { contains: entry.contains } : {}),
      reason: entry.reason,
    });
  }

  for (const raw of lines) {
    lineNumber++;
    const line = raw;

    // H2 heading → new slug block
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      flushEntry();
      currentSlug = h2Match[1].trim();
      continue;
    }

    // Outside any slug block → ignore
    if (currentSlug === null) continue;

    // Blank line → close current entry
    if (line.trim() === '') {
      flushEntry();
      continue;
    }

    // List item: `- category: <name>`
    const categoryMatch = line.match(/^-\s+category:\s*(.+)$/);
    if (categoryMatch) {
      flushEntry();
      currentEntry = {
        category: categoryMatch[1].trim(),
        _openedAt: lineNumber,
      };
      continue;
    }

    // Indented `  contains: <text>` — belongs to current entry
    const containsMatch = line.match(/^\s+contains:\s*(.+)$/);
    if (containsMatch && currentEntry) {
      // Strip optional surrounding quotes from the value
      currentEntry.contains = containsMatch[1].trim().replace(/^["']|["']$/g, '');
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
 * Load and parse <cwd>/.fuselage-craft/critique-ignore.md.
 *
 * Missing file → { entries: [], warnings: [] } (not an error).
 * Malformed entry (missing reason) → pushed to warnings, entry skipped.
 *
 * @param {string} cwd  - consumer project root
 * @returns {{ entries: Array<{slug: string, category: string, contains?: string, reason: string}>, warnings: string[] }}
 */
export function loadCritiqueIgnore(cwd) {
  const ignoreFile = join(cwd, '.fuselage-craft', 'critique-ignore.md');

  if (!existsSync(ignoreFile)) {
    return { entries: [], warnings: [] };
  }

  let content;
  try {
    content = readFileSync(ignoreFile, 'utf8');
  } catch (err) {
    return { entries: [], warnings: [`critique-ignore.md could not be read: ${err.message}`] };
  }

  return parseCritiqueIgnoreContent(content);
}

/**
 * Partition critique findings into kept and suppressed sets.
 *
 * A finding is suppressed when at least one ignore entry matches on all dimensions:
 *   1. entry.slug === finding.slug
 *   2. entry.category === finding.category
 *   3. entry.contains is undefined OR finding.message?.includes(entry.contains)
 *
 * @param {Array<{slug: string, category: string, message?: string}>} findings
 * @param {{ entries: Array<{slug, category, contains?, reason}> }} ignore
 * @returns {{ kept: Array<Object>, suppressed: Array<Object> }}
 */
export function filterCritiqueFindings(findings, ignore) {
  const kept = [];
  const suppressed = [];

  for (const finding of findings) {
    const matched = ignore.entries.some((entry) => {
      if (entry.slug !== finding.slug) return false;
      if (entry.category !== finding.category) return false;
      if (entry.contains !== undefined && !finding.message?.includes(entry.contains)) return false;
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
  const { entries, warnings } = loadCritiqueIgnore(cwd);

  if (warnings.length > 0) {
    for (const w of warnings) {
      console.warn('[critique-ignore] WARNING:', w);
    }
  }

  if (entries.length === 0) {
    console.log('No critique-ignore entries found.');
  } else {
    console.log(`Loaded ${entries.length} critique-ignore ${entries.length === 1 ? 'entry' : 'entries'}:\n`);
    for (const entry of entries) {
      console.log(`  slug     : ${entry.slug}`);
      console.log(`  category : ${entry.category}`);
      if (entry.contains !== undefined) console.log(`  contains : ${entry.contains}`);
      console.log(`  reason   : ${entry.reason}`);
      console.log('');
    }
  }
}
