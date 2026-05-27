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

import '../src/resolve.mjs';
