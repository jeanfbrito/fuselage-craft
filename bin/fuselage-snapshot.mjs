#!/usr/bin/env node
/**
 * fuselage-snapshot — CLI entry point for snapshot inspection and ignore-file inspection.
 *
 * Usage:
 *   npx fuselage-snapshot <latest|trend [N]|write [--input <path>]> [--kind audit|critique] [--slug <slug>] [--cwd <dir>]
 *   npx fuselage-snapshot ignore [--kind audit|critique] [--cwd <dir>]
 *   node <repo>/bin/fuselage-snapshot.mjs ...
 */

// Call main() explicitly. The npm .bin is named `fuselage-snapshot` (no .mjs),
// so audit-snapshot.mjs's own argv-name self-run guard does not fire when
// invoked via the bin (npx local .bin, volta global shim). See
// bin/fuselage-resolve.mjs for the same pattern.
import { main as snapshotMain } from '../src/audit-snapshot.mjs';
import { loadIgnore } from '../src/ignore-filter.mjs';
import { loadCritiqueIgnore } from '../src/critique-ignore.mjs';

function parseFlagValue(argv, flag) {
  const idx = argv.indexOf(flag);
  if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
  return null;
}

/**
 * `ignore` subcommand: inspect .fuselage-craft/ignore.md (kind=audit, default)
 * or .fuselage-craft/critique-ignore.md (kind=critique). Reuses the parsing
 * exports from ignore-filter.mjs / critique-ignore.mjs — no parsing logic is
 * duplicated here, only the CLI display.
 */
function runIgnore(rest) {
  const cwd = parseFlagValue(rest, '--cwd') ?? process.cwd();
  const kind = parseFlagValue(rest, '--kind') ?? 'audit';

  if (kind === 'critique') {
    const { entries, warnings } = loadCritiqueIgnore(cwd);
    for (const w of warnings) console.warn('[fuselage-snapshot ignore] WARNING:', w);
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
    return;
  }

  const { entries, warnings } = loadIgnore(cwd);
  for (const w of warnings) console.warn('[fuselage-snapshot ignore] WARNING:', w);
  if (entries.length === 0) {
    console.log('No ignore entries found.');
  } else {
    console.log(`Loaded ${entries.length} ignore ${entries.length === 1 ? 'entry' : 'entries'}:\n`);
    for (const entry of entries) {
      console.log(`  rule    : ${entry.rule}`);
      console.log(`  path    : ${entry.pathGlob}`);
      if (entry.line !== undefined) console.log(`  line    : ${entry.line}`);
      console.log(`  reason  : ${entry.reason}`);
      console.log('');
    }
  }
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'ignore') {
    runIgnore(rest);
    return;
  }
  return snapshotMain(argv);
}

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`fuselage-snapshot error: ${err?.stack ?? err}\n`);
  process.exit(1);
});
