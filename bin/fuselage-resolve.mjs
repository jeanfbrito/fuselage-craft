#!/usr/bin/env node
/**
 * fuselage-resolve — CLI entry point for the fuselage-craft resolver.
 *
 * Usage:
 *   npx fuselage-resolve [category] [--json]
 *   node <repo>/bin/fuselage-resolve.mjs [category] [--json]
 *
 * Categories: colors, semantic, fontscale, breakpoints, spacing,
 *             elevation, radius, components, forms, inputs, hooks, all (default)
 */

// Call main() explicitly. The npm .bin is named `fuselage-resolve` (no .mjs),
// so the module's own argv-name self-run guard does not fire when invoked via
// the bin (npx local .bin, volta global shim). Calling main() works for every
// invocation path.
import { main } from '../src/resolve.mjs';

main().catch((err) => {
  process.stderr.write(`fuselage-resolve error: ${err?.stack ?? err}\n`);
  process.exit(1);
});
