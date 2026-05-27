#!/usr/bin/env node
/**
 * fuselage-gate — CLI entry point for the fuselage-craft gate.
 *
 * Usage:
 *   npx fuselage-gate [globs...]
 *   node <repo>/bin/fuselage-gate.mjs 'src/**\/*.tsx'
 *
 * Exits nonzero if lint errors > 0 OR tsc exits nonzero.
 */

import '../src/run-gate.mjs';
