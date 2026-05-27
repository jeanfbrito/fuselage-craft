#!/usr/bin/env node
/**
 * resolve.mjs — live source-of-truth resolver for fuselage-craft.
 *
 * Reads @rocket.chat/fuselage* packages from the INSTALLED packages under the
 * consumer's project root (located by walking up from process.cwd()). Zero
 * Fuselage vocabulary is hardcoded here — all names are extracted from the
 * installed .d.ts files.
 *
 * Single resolution mode: installed packages only. Monorepo source paths are
 * not used. If run inside the fuselage monorepo itself (where the packages are
 * not installed as node_modules), TS-backed categories report "unavailable"
 * with an actionable message.
 *
 * Usage:
 *   fuselage-resolve [category] [--json]
 *   node <repo>/bin/fuselage-resolve.mjs [category] [--json]
 *
 * Categories: colors, semantic, fontscale, breakpoints, spacing,
 *             elevation, radius, components, forms, inputs, hooks, all (default)
 *
 * Exports: resolveCategory(category), resolveAll()
 */

import { createRequire } from 'module';
import { pathToFileURL, fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Resolution root ──────────────────────────────────────────────────────────

/**
 * Build a require() anchored to a given directory.
 */
function makeRequire(dir) {
  return createRequire(pathToFileURL(join(dir, 'package.json')).href);
}

/**
 * Walk up from startDir until we find a directory whose package.json lists
 * @rocket.chat/fuselage in any dep field. Returns that directory, or null.
 */
function findConsumerRoot(startDir) {
  const dep_fields = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];
  let dir = startDir;
  while (true) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const raw = readFileSync(pkgPath, 'utf8');
        const parsed = JSON.parse(raw);
        for (const field of dep_fields) {
          if (parsed[field] && '@rocket.chat/fuselage' in parsed[field]) {
            return dir;
          }
        }
      } catch {
        // not readable / not valid JSON — keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return null;
}

const cwd = process.cwd();
const anchor = findConsumerRoot(cwd) ?? cwd;
const anchorRequire = makeRequire(anchor);

/**
 * Whether @rocket.chat/fuselage is resolvable from the anchor.
 */
function fuselageInstalled() {
  try {
    anchorRequire.resolve('@rocket.chat/fuselage/package.json');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the `version` field from a package's package.json.
 */
function readPackageVersion(pkgName) {
  try {
    const pkgJson = anchorRequire(`${pkgName}/package.json`);
    if (pkgJson && pkgJson.version) return pkgJson.version;
  } catch {
    // not installed
  }
  return 'not installed';
}

/**
 * Collect resolved versions for the header.
 */
function collectVersions() {
  const packages = [
    '@rocket.chat/fuselage',
    '@rocket.chat/fuselage-tokens',
    '@rocket.chat/fuselage-forms',
    '@rocket.chat/fuselage-hooks',
  ];
  const versions = {};
  for (const pkg of packages) {
    versions[pkg] = readPackageVersion(pkg);
  }
  return versions;
}

// ─── TypeScript compiler bootstrap ───────────────────────────────────────────

/**
 * Resolve the TypeScript module. Try:
 *   1. Consumer's anchor node_modules
 *   2. The toolkit's own node_modules (cwd node_modules, then repo root node_modules)
 * Returns the ts module or null.
 */
let _ts = null;
let _tsResolved = false;

function loadTypeScript() {
  if (_tsResolved) return _ts;
  _tsResolved = true;

  // 1. Try from anchor (consumer's node_modules)
  try {
    _ts = anchorRequire('typescript');
    return _ts;
  } catch {
    // fall through
  }

  // 2. Try from cwd node_modules, then from the toolkit's own directory
  const candidates = [
    cwd, // process.cwd() node_modules
    join(__dirname, '..'), // repo root (src/../ = repo root)
  ];
  for (const dir of candidates) {
    try {
      _ts = makeRequire(dir)('typescript');
      return _ts;
    } catch {
      // continue
    }
  }

  _ts = null;
  return null;
}

const TS_DEGRADED = {
  status: 'type-only',
  data: 'typescript not resolvable from cwd; validate via the type gate',
};

// ─── Package entry resolution ─────────────────────────────────────────────────

/**
 * Resolve the TypeScript entry point for a package.
 * Uses ONLY the installed package's types field (consumer node_modules .d.ts).
 * Returns { path, source } or null.
 */
function resolveTypesEntry(pkg) {
  try {
    const pkgJsonPath = anchorRequire.resolve(`${pkg}/package.json`);
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    const typesField = pkgJson.types || pkgJson.typings;
    if (typesField) {
      const pkgDir = dirname(pkgJsonPath);
      const entry = join(pkgDir, typesField);
      if (existsSync(entry)) {
        return { path: entry, source: 'installed .d.ts (types)' };
      }
    }
  } catch {
    // not installed or unresolvable (PnP / no-node_modules)
  }
  return null;
}

// ─── TS Program cache ─────────────────────────────────────────────────────────

const _programCache = new Map();

/**
 * Build (or retrieve cached) a ts.Program for a given entry file.
 * Returns { program, checker, sourceFile } or null.
 */
function getTsProgram(entryPath) {
  if (_programCache.has(entryPath)) return _programCache.get(entryPath);

  const ts = loadTypeScript();
  if (!ts) {
    _programCache.set(entryPath, null);
    return null;
  }

  const compilerOptions = {
    noEmit: true,
    skipLibCheck: true,
    types: [],
    // Use Bundler when available (TS >=5.0), fall back to NodeNext
    moduleResolution:
      ts.ModuleResolutionKind.Bundler ?? ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ESNext,
    allowJs: false,
    // Allow .d.ts programs to pull in .ts source
    allowImportingTsExtensions: true,
    noEmitOnError: false,
  };

  let program;
  try {
    program = ts.createProgram([entryPath], compilerOptions);
  } catch (e) {
    _programCache.set(entryPath, null);
    return null;
  }

  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(entryPath);
  if (!sourceFile) {
    _programCache.set(entryPath, null);
    return null;
  }

  const result = { program, checker, sourceFile };
  _programCache.set(entryPath, result);
  return result;
}

// ─── TS extraction helpers ────────────────────────────────────────────────────

/**
 * Get all exported symbols from a module's source file.
 */
function getExportedSymbols(checker, sourceFile) {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return [];
  return checker.getExportsOfModule(moduleSymbol);
}

/**
 * Check if a symbol is a value declaration (function, class, variable, const).
 */
function isValueDeclaration(ts, symbol) {
  const flags = symbol.getFlags();
  return !!(
    flags & ts.SymbolFlags.Function ||
    flags & ts.SymbolFlags.Class ||
    flags & ts.SymbolFlags.Variable ||
    flags & ts.SymbolFlags.BlockScopedVariable ||
    flags & ts.SymbolFlags.FunctionScopedVariable
  );
}

/**
 * Extract string literal members from a type alias union.
 * e.g. type FontScale = 'hero' | 'h1' | 'h2' | ...
 */
function extractUnionStringLiterals(ts, checker, symbol) {
  const decls = symbol.getDeclarations?.() ?? [];
  for (const decl of decls) {
    if (!ts.isTypeAliasDeclaration(decl)) continue;
    const type = checker.getTypeAtLocation(decl.type);
    if (type.isUnion()) {
      const literals = [];
      for (const t of type.types) {
        if (t.isStringLiteral()) literals.push(t.value);
      }
      if (literals.length > 0) return literals;
    }
    // single literal (non-union)
    if (type.isStringLiteral()) return [type.value];
  }
  return null;
}

/**
 * Extract the keys of an exported const object symbol.
 * e.g. export const surfaceColors = { 'surface-light': ..., ... }
 * Returns an array of string keys.
 */
function extractObjectKeys(checker, symbol) {
  const type = checker.getTypeOfSymbol(symbol);
  const props = checker.getPropertiesOfType(type);
  const keys = props.map((p) => p.getName());
  return keys.filter((k) => typeof k === 'string' && k.length > 0);
}

/**
 * Extract string literal union members from the `elevation` property
 * of the StylingProps type exported by the fuselage entry.
 * Looks for the StylingProps type alias and reads its `elevation` property.
 */
function extractElevationLiterals(ts, checker, exports) {
  // Find StylingProps type alias in exported symbols
  const stylingPropsSymbol = exports.find((s) => s.getName() === 'StylingProps');
  if (stylingPropsSymbol) {
    const decls = stylingPropsSymbol.getDeclarations?.() ?? [];
    for (const decl of decls) {
      if (!ts.isTypeAliasDeclaration(decl)) continue;
      const type = checker.getTypeAtLocation(decl.type);
      const elevProp = type.getProperty('elevation');
      if (elevProp) {
        const elevType = checker.getTypeOfSymbol(elevProp);
        const literals = extractUnionFromType(elevType);
        if (literals && literals.length > 0) return literals;
      }
    }
  }

  // Fallback: search all exported interface/type symbols for one with `elevation`
  for (const sym of exports) {
    const decls = sym.getDeclarations?.() ?? [];
    for (const decl of decls) {
      if (!ts.isTypeAliasDeclaration(decl) && !ts.isInterfaceDeclaration(decl))
        continue;
      const type = checker.getTypeAtLocation(decl);
      const elevProp = type.getProperty('elevation');
      if (!elevProp) continue;
      const elevType = checker.getTypeOfSymbol(elevProp);
      const literals = extractUnionFromType(elevType);
      if (literals && literals.length > 0) return literals;
    }
  }

  return null;
}

/**
 * Extract string literal union values from a type (handles union + single).
 */
function extractUnionFromType(type) {
  if (type.isUnion()) {
    const lits = [];
    for (const t of type.types) {
      if (t.isStringLiteral()) lits.push(t.value);
    }
    return lits.length > 0 ? lits : null;
  }
  if (type.isStringLiteral()) return [type.value];
  return null;
}

// ─── Token data import (anchor-rooted, absolute path) ─────────────────────────

/**
 * Import a package data file (e.g. colors.mjs) from the consumer's node_modules.
 * A bare `import('pkg/file')` resolves relative to THIS module (the toolkit repo),
 * not the consumer's anchor, so subpath data imports silently fail in a consumer.
 * Resolve the package dir from the anchor and import the absolute file URL instead.
 * Returns { value, source } or null.
 */
async function importPkgData(pkg, files) {
  const candidates = [];
  try {
    const pkgDir = dirname(anchorRequire.resolve(`${pkg}/package.json`));
    for (const f of files) candidates.push([join(pkgDir, f), 'node_modules (data)']);
  } catch {
    // not resolvable via node_modules (PnP / not installed)
  }
  for (const [abs, source] of candidates) {
    if (!existsSync(abs)) continue;
    try {
      const mod = await import(pathToFileURL(abs).href);
      if (mod && mod.default) return { value: mod.default, source };
    } catch {
      // try next candidate
    }
  }
  return null;
}

// ─── Category resolvers ───────────────────────────────────────────────────────

async function resolveColors() {
  try {
    const hit = await importPkgData('@rocket.chat/fuselage-tokens', [
      'colors.mjs',
      'colors.js',
    ]);
    if (hit && Object.keys(hit.value).length > 0) {
      return {
        status: 'ok',
        source: hit.source,
        warning: '⚠ RAW PALETTE — internal theme values, NOT valid color=/bg= prop values. For product code use the `semantic` category instead.',
        data: Object.keys(hit.value),
      };
    }
    return {
      status: 'unavailable',
      reason: '@rocket.chat/fuselage-tokens colors data could not be loaded',
      data: [],
    };
  } catch (err) {
    return { status: 'unavailable', reason: `colors resolver error: ${err.message}`, data: [] };
  }
}

async function resolveFontScale() {
  try {
    const ts = loadTypeScript();

    if (ts) {
      // Primary: extract FontScale type alias from the fuselage entry
      const entry = resolveTypesEntry('@rocket.chat/fuselage');
      if (entry) {
        const prog = getTsProgram(entry.path);
        if (prog) {
          const { checker, sourceFile } = prog;
          const exports = getExportedSymbols(checker, sourceFile);
          const fontScaleSym = exports.find((s) => s.getName() === 'FontScale');
          if (fontScaleSym) {
            const literals = extractUnionStringLiterals(ts, checker, fontScaleSym);
            if (literals && literals.length > 0) {
              return { status: 'ok', source: entry.source, data: literals };
            }
          }
        }
      }
    }

    // Data fallback: typography tokens
    const hit = await importPkgData('@rocket.chat/fuselage-tokens', [
      'typography.mjs',
      'typography.js',
    ]);
    if (hit && hit.value && hit.value.fontScales) {
      return {
        status: 'ok',
        source: hit.source,
        data: Object.keys(hit.value.fontScales),
      };
    }

    if (!ts) return TS_DEGRADED;

    const notInstalledMsg = fuselageInstalled()
      ? 'FontScale type not found and typography data unavailable'
      : `@rocket.chat/fuselage is not installed under ${anchor}; run inside your product repo.`;
    return {
      status: 'unavailable',
      reason: notInstalledMsg,
      data: [],
    };
  } catch (err) {
    return { status: 'unavailable', reason: `fontscale resolver error: ${err.message}`, data: [] };
  }
}

async function resolveBreakpoints() {
  try {
    const hit = await importPkgData('@rocket.chat/fuselage-tokens', [
      'breakpoints.mjs',
      'breakpoints.js',
    ]);
    if (hit) {
      const v = hit.value;
      const data = Array.isArray(v)
        ? v.map((b) => b.name).filter(Boolean)
        : Object.keys(v);
      if (data.length > 0) return { status: 'ok', source: hit.source, data };
    }
    return {
      status: 'unavailable',
      reason: '@rocket.chat/fuselage-tokens breakpoints data could not be loaded',
      data: [],
    };
  } catch (err) {
    return { status: 'unavailable', reason: `breakpoints resolver error: ${err.message}`, data: [] };
  }
}

/**
 * Semantic color groups: read the exported const sub-objects from Theme.ts.
 * The Palette export is: { surface: surfaceColors, text: textIconColors, ... }
 * Each sub-object (surfaceColors, textIconColors, ...) is also exported directly.
 * We read the Palette object's type properties, and for each, extract the
 * keys of the corresponding sub-object type.
 *
 * Post-processes group keys to strip internal prefixes so the resolver emits
 * the prop-facing bare value, not the internal token key:
 *   text (font-*)        → color=  bare name   (transform prepends font-)
 *   surface (surface-*)  → bg=     bare OR full (transform prepends surface-)
 *   stroke (stroke-*)    → borderColor= bare    (transform prepends stroke-)
 */

/**
 * Per-group metadata: which CSS prop accepts these tokens, which prefix does
 * the Box transform prepend (so we know what to strip), and notes for the user.
 */
const SEMANTIC_GROUP_META = {
  text: {
    prop: 'color=',
    prefix: 'font-',
    note: 'bare name only; Box color= prepends font-',
  },
  surface: {
    prop: 'bg= / backgroundColor=',
    prefix: 'surface-',
    note: 'bare OR full surface-* name; Box bg= prepends surface- but also accepts full form',
  },
  stroke: {
    prop: 'borderColor=',
    prefix: 'stroke-',
    note: 'bare name only; Box borderColor= prepends stroke-',
  },
  // status / statusColor / badge: used bare; leave keys as-is
};

/**
 * Strip an expected prefix from a token key. If the key doesn't start with
 * the prefix, return the key unchanged (resilient — don't crash on unexpected data).
 */
function stripPrefix(key, prefix) {
  if (prefix && key.startsWith(prefix)) return key.slice(prefix.length);
  return key;
}

/**
 * Post-process the raw groups object returned from type extraction.
 * Returns an array of { groupName, meta, keys } where keys are prop-facing values.
 */
function postProcessSemanticGroups(rawGroups) {
  return Object.entries(rawGroups).map(([groupName, keys]) => {
    const meta = SEMANTIC_GROUP_META[groupName];
    if (!meta) {
      // No special handling — pass through as-is
      return { groupName, meta: null, keys };
    }
    const strippedKeys = keys.map((k) => stripPrefix(k, meta.prefix));
    return { groupName, meta, keys: strippedKeys };
  });
}

async function resolveSemantic() {
  try {
    const ts = loadTypeScript();
    if (!ts) return TS_DEGRADED;

    const entry = resolveTypesEntry('@rocket.chat/fuselage');
    if (!entry) {
      return {
        status: 'unavailable',
        reason: fuselageInstalled()
          ? '@rocket.chat/fuselage types entry not found'
          : `@rocket.chat/fuselage is not installed under ${anchor}; run inside your product repo.`,
        data: {},
      };
    }

    const prog = getTsProgram(entry.path);
    if (!prog) {
      return {
        status: 'unavailable',
        reason: 'Could not build TypeScript program for @rocket.chat/fuselage',
        data: {},
      };
    }

    const { checker, sourceFile } = prog;
    const exports = getExportedSymbols(checker, sourceFile);

    // The Palette const maps group names to sub-object consts.
    // We can read Palette's type directly: each property's type has the color keys.
    const paletteSym = exports.find((s) => s.getName() === 'Palette');
    if (paletteSym) {
      const paletteType = checker.getTypeOfSymbol(paletteSym);
      const groupProps = checker.getPropertiesOfType(paletteType);
      const rawGroups = {};
      for (const groupProp of groupProps) {
        const groupName = groupProp.getName();
        const groupType = checker.getTypeOfSymbol(groupProp);
        const colorProps = checker.getPropertiesOfType(groupType);
        // Filter to only string keys that look like semantic color names (contain '-')
        const colorKeys = colorProps
          .map((p) => p.getName())
          .filter((k) => typeof k === 'string' && k.includes('-'));
        if (colorKeys.length > 0) rawGroups[groupName] = colorKeys;
      }
      if (Object.keys(rawGroups).length > 0) {
        return { status: 'ok', source: entry.source, data: postProcessSemanticGroups(rawGroups) };
      }
    }

    // Fallback: read the named sub-object exports directly
    // Map from export name to palette group key
    const subObjectMap = [
      ['surfaceColors', 'surface'],
      ['textIconColors', 'text'],
      ['strokeColors', 'stroke'],
      ['statusBackgroundColors', 'status'],
      ['statusColors', 'statusColor'],
      ['badgeBackgroundColors', 'badge'],
      ['shadowColors', 'shadow'],
    ];

    const rawGroups = {};
    for (const [exportName, groupKey] of subObjectMap) {
      const sym = exports.find((s) => s.getName() === exportName);
      if (!sym) continue;
      const keys = extractObjectKeys(checker, sym);
      if (keys.length > 0) rawGroups[groupKey] = keys;
    }

    if (Object.keys(rawGroups).length > 0) {
      return { status: 'ok', source: entry.source, data: postProcessSemanticGroups(rawGroups) };
    }

    return {
      status: 'unavailable',
      reason: 'Palette and sub-object exports not found in @rocket.chat/fuselage types',
      data: {},
    };
  } catch (err) {
    return { status: 'unavailable', reason: `semantic resolver error: ${err.message}`, data: {} };
  }
}

async function resolveElevation() {
  try {
    const ts = loadTypeScript();
    if (!ts) return TS_DEGRADED;

    const entry = resolveTypesEntry('@rocket.chat/fuselage');
    if (!entry) {
      return {
        status: 'type-only',
        data: fuselageInstalled()
          ? 'type-only: @rocket.chat/fuselage types entry not found; values are "0"|"1"|"2"|"1nb"|"2nb" in StylingProps'
          : `type-only: @rocket.chat/fuselage is not installed under ${anchor}; run inside your product repo.`,
      };
    }

    const prog = getTsProgram(entry.path);
    if (!prog) {
      return {
        status: 'type-only',
        data: 'type-only: could not build TypeScript program; validate via the type gate',
      };
    }

    const { checker, sourceFile } = prog;
    const exports = getExportedSymbols(checker, sourceFile);

    const literals = extractElevationLiterals(ts, checker, exports);
    if (literals && literals.length > 0) {
      return { status: 'ok', source: entry.source, data: literals };
    }

    return {
      status: 'type-only',
      data: 'type-only: elevation literals are "0"|"1"|"2"|"1nb"|"2nb" in StylingProps.elevation; validate via the type gate',
    };
  } catch (err) {
    return { status: 'type-only', data: `type-only: elevation resolver error: ${err.message}` };
  }
}

async function resolveComponents() {
  try {
    const ts = loadTypeScript();
    if (!ts) return TS_DEGRADED;

    const entry = resolveTypesEntry('@rocket.chat/fuselage');
    if (!entry) {
      return {
        status: 'unavailable',
        reason: fuselageInstalled()
          ? '@rocket.chat/fuselage types entry not found'
          : `@rocket.chat/fuselage is not installed under ${anchor}; run inside your product repo.`,
        data: [],
      };
    }

    const prog = getTsProgram(entry.path);
    if (!prog) {
      return {
        status: 'unavailable',
        reason: 'Could not build TypeScript program for @rocket.chat/fuselage',
        data: [],
      };
    }

    const { checker, sourceFile } = prog;
    const exports = getExportedSymbols(checker, sourceFile);

    const names = exports
      .filter((s) => /^[A-Z]/.test(s.getName()) && isValueDeclaration(ts, s))
      .map((s) => s.getName())
      .sort();

    if (names.length > 0) {
      return { status: 'ok', source: entry.source, data: names };
    }

    return {
      status: 'unavailable',
      reason: 'No PascalCase value exports found in @rocket.chat/fuselage types',
      data: [],
    };
  } catch (err) {
    return { status: 'unavailable', reason: `components resolver error: ${err.message}`, data: [] };
  }
}

/**
 * Collect the DECLARATION NODE text(s) for a symbol.
 * For symbols re-exported via barrel index (Alias flags), resolves to the
 * underlying symbol's declarations first.
 *
 * Uses the declaration NODE text (not the full source file) so classification
 * is scoped to the component's own props and avoids false matches from sibling
 * declarations in the same file.
 *
 * Resolves aliases to reach the real declaration before extracting node text.
 */
function getDeclarationTexts(ts, checker, sym) {
  const texts = [];
  try {
    // Resolve aliases so we get the source declaration, not the re-export
    let effective = sym;
    if (sym.getFlags() & ts.SymbolFlags.Alias) {
      try { effective = checker.getAliasedSymbol(sym); } catch { /* keep original */ }
    }
    const decls = effective.getDeclarations?.() ?? [];
    for (const d of decls) {
      try {
        texts.push(d.getText());
      } catch { /* skip unreadable */ }
    }
  } catch {
    // defensive — return empty
  }
  return texts;
}

/**
 * Classify whether a component export is an INPUT primitive using structural
 * analysis of its declaration node text (from the .d.ts).
 *
 * Uses declaration node text (scoped to the component's own declaration/props)
 * rather than the full source file, to avoid false positives from sibling
 * declarations in the same file.
 *
 * SIGNAL A: any declaration text contains HTMLInputElement, HTMLSelectElement,
 *   or HTMLTextAreaElement.
 *
 * SIGNAL B: any declaration text contains BOTH an explicit value property pattern
 *   (value?: or value:) AND an explicit onChange property pattern (onChange?: or
 *   onChange:) spelled out in the type literal.
 *
 * SIGNAL C (InputBox fingerprint): the source text contains `placeholderVisible`.
 *   This prop is unique to InputBox-derived controls.
 *
 * BUTTON EXCLUSION: text contains HTMLButtonElement or HTMLAnchorElement as
 *   element references, AND neither Signal A, B, nor C applies → not an input.
 *
 * Defensive: any exception → false (exclude rather than crash).
 */
function isInputByDeclarationText(declTexts) {
  try {
    const combined = declTexts.join('\n');

    // Signal A: form HTML element in declaration text
    const hasFormElement =
      combined.includes('HTMLInputElement') ||
      combined.includes('HTMLSelectElement') ||
      combined.includes('HTMLTextAreaElement');

    // Signal B: explicit value+onChange contract spelled out in the type literal.
    const hasExplicitValue = /\bvalue\s*\??\s*:/.test(combined);
    const hasExplicitOnChange = /\bonChange\s*\??\s*:/.test(combined);
    const hasValueContract = hasExplicitValue && hasExplicitOnChange;

    // Signal C: InputBox-family fingerprint
    const hasInputBoxFingerprint = combined.includes('placeholderVisible');

    // Button exclusion: anchor/button element present, no input signal of any kind
    const hasButtonElement =
      combined.includes('HTMLButtonElement') ||
      combined.includes('HTMLAnchorElement');
    if (hasButtonElement && !hasFormElement && !hasValueContract && !hasInputBoxFingerprint) return false;

    return hasFormElement || hasValueContract || hasInputBoxFingerprint;
  } catch {
    return false;
  }
}

/**
 * Name-based structural exclusions for the inputs heuristic.
 * These are STRUCTURAL NAMING constants — acceptable as documented exclusions.
 * They identify wrapper/container families by well-known naming conventions,
 * not by hardcoding individual component names.
 */
function isInputExcludedByName(name) {
  // Wrapper family: Field*, *Label (FieldLabel, FieldGroup, FieldRow, FieldError, etc.
  // and Label, HiddenLabel, LabelFor, FieldLabelInfo, FieldLink, FieldContext, etc.)
  if (/^Field/.test(name)) return true;
  if (/Label/.test(name)) return true;
  // Dropdown sub-parts, loading placeholders, containers, list sub-parts
  if (name.endsWith('Option')) return true;
  if (name.endsWith('Skeleton')) return true;
  if (name.endsWith('Group')) return true;
  if (name.endsWith('Item')) return true;
  return false;
}

async function resolveInputs() {
  try {
    const ts = loadTypeScript();
    if (!ts) return TS_DEGRADED;

    // ── Path 1: @rocket.chat/fuselage-forms ───────────────────────────────────
    const formsEntry = resolveTypesEntry('@rocket.chat/fuselage-forms');
    if (formsEntry) {
      const prog = getTsProgram(formsEntry.path);
      if (prog) {
        const { checker, sourceFile } = prog;
        const exports = getExportedSymbols(checker, sourceFile);

        const names = [];
        for (const sym of exports) {
          const name = sym.getName();
          // PascalCase only
          if (!/^[A-Z]/.test(name)) continue;
          // Value or alias-to-value
          if (!isValueDeclaration(ts, sym)) {
            if (!(sym.getFlags() & ts.SymbolFlags.Alias)) continue;
            let resolved = sym;
            try { resolved = checker.getAliasedSymbol(sym); } catch { continue; }
            if (!isValueDeclaration(ts, resolved)) continue;
          }
          // Exclude the Field/Label wrapper family structurally
          if (isInputExcludedByName(name)) continue;
          names.push(name);
        }

        names.sort();
        if (names.length > 0) {
          return { status: 'ok', source: formsEntry.source + ' (forms)', data: names };
        }
      }
    }

    // ── Path 2: Heuristic against @rocket.chat/fuselage ──────────────────────
    const entry = resolveTypesEntry('@rocket.chat/fuselage');
    if (!entry) {
      return {
        status: 'unavailable',
        reason: fuselageInstalled()
          ? '@rocket.chat/fuselage types entry not found'
          : `@rocket.chat/fuselage is not installed under ${anchor}; run inside your product repo.`,
        data: [],
      };
    }

    const prog = getTsProgram(entry.path);
    if (!prog) {
      return {
        status: 'unavailable',
        reason: 'Could not build TypeScript program for @rocket.chat/fuselage',
        data: [],
      };
    }

    const { checker, sourceFile } = prog;
    const exports = getExportedSymbols(checker, sourceFile);

    const names = [];
    for (const sym of exports) {
      const name = sym.getName();

      // Only PascalCase value exports (components, not types or hooks)
      if (!/^[A-Z]/.test(name)) continue;
      // Accept value declarations; also accept Alias if the aliased symbol is a value.
      if (!isValueDeclaration(ts, sym)) {
        if (!(sym.getFlags() & ts.SymbolFlags.Alias)) continue;
        let resolved = sym;
        try { resolved = checker.getAliasedSymbol(sym); } catch { continue; }
        if (!isValueDeclaration(ts, resolved)) continue;
      }

      // Name-based structural exclusions
      if (isInputExcludedByName(name)) continue;

      // Structural classification via declaration node text
      const declTexts = getDeclarationTexts(ts, checker, sym);
      if (declTexts.length === 0) continue; // cannot read → exclude (defensive)

      if (isInputByDeclarationText(declTexts)) {
        names.push(name);
      }
    }

    names.sort();

    if (names.length > 0) {
      return { status: 'ok', source: entry.source, data: names };
    }

    return {
      status: 'unavailable',
      reason: 'No input-primitive components found via structural type analysis in @rocket.chat/fuselage',
      data: [],
    };
  } catch (err) {
    return { status: 'unavailable', reason: `inputs resolver error: ${err.message}`, data: [] };
  }
}

async function resolveForms() {
  try {
    const ts = loadTypeScript();
    if (!ts) return TS_DEGRADED;

    // Primary: @rocket.chat/fuselage-forms
    const formsEntry = resolveTypesEntry('@rocket.chat/fuselage-forms');
    if (formsEntry) {
      const prog = getTsProgram(formsEntry.path);
      if (prog) {
        const { checker, sourceFile } = prog;
        const exports = getExportedSymbols(checker, sourceFile);

        const names = exports
          .filter((s) => /^[A-Z]/.test(s.getName()) && isValueDeclaration(ts, s))
          .map((s) => s.getName())
          .sort();

        if (names.length > 0) {
          return { status: 'ok', source: formsEntry.source, data: names };
        }
      }
    }

    // Fallback: Field* components ship in the main @rocket.chat/fuselage package.
    // Many of these are re-exported via barrel chains (export * from './Field'), so they
    // arrive as Alias symbols (SymbolFlags.Alias = 2097152) rather than direct value
    // declarations. Resolve aliases to their underlying symbol before testing value-ness.
    const mainEntry = resolveTypesEntry('@rocket.chat/fuselage');
    if (mainEntry) {
      const prog = getTsProgram(mainEntry.path);
      if (prog) {
        const { checker, sourceFile } = prog;
        const exports = getExportedSymbols(checker, sourceFile);

        const names = exports
          .filter((s) => {
            if (!/^Field/.test(s.getName())) return false;
            // Resolve alias before testing value-ness
            let effective = s;
            if (s.getFlags() & ts.SymbolFlags.Alias) {
              try { effective = checker.getAliasedSymbol(s); } catch { /* keep original */ }
            }
            return isValueDeclaration(ts, effective);
          })
          .map((s) => s.getName())
          .sort();

        if (names.length > 0) {
          return {
            status: 'ok',
            source: 'main package (Field*) — @rocket.chat/fuselage-forms not installed',
            data: names,
          };
        }
      }
    }

    return {
      status: 'unavailable',
      reason: '@rocket.chat/fuselage-forms not installed and Field* not found in @rocket.chat/fuselage',
      data: [],
    };
  } catch (err) {
    return { status: 'unavailable', reason: `forms resolver error: ${err.message}`, data: [] };
  }
}

async function resolveHooks() {
  try {
    const ts = loadTypeScript();
    if (!ts) return TS_DEGRADED;

    const entry = resolveTypesEntry('@rocket.chat/fuselage-hooks');
    if (!entry) {
      return {
        status: 'unavailable',
        reason: fuselageInstalled()
          ? '@rocket.chat/fuselage-hooks not installed'
          : `@rocket.chat/fuselage is not installed under ${anchor}; run inside your product repo.`,
        data: [],
      };
    }

    const prog = getTsProgram(entry.path);
    if (!prog) {
      return {
        status: 'unavailable',
        reason: 'Could not build TypeScript program for @rocket.chat/fuselage-hooks',
        data: [],
      };
    }

    const { checker, sourceFile } = prog;
    const exports = getExportedSymbols(checker, sourceFile);

    const names = exports
      .filter((s) => /^use[A-Z]/.test(s.getName()))
      .map((s) => s.getName())
      .sort();

    if (names.length > 0) {
      return { status: 'ok', source: entry.source, data: names };
    }

    return {
      status: 'unavailable',
      reason: 'No hook exports found in @rocket.chat/fuselage-hooks types',
      data: [],
    };
  } catch (err) {
    return { status: 'unavailable', reason: `hooks resolver error: ${err.message}`, data: [] };
  }
}

// ─── Companion reconciliation ─────────────────────────────────────────────────

/**
 * Pure function: given a map of symbols fuselage imports from each companion
 * and a map of symbols each companion exports, return all imported symbols that
 * are NOT present in the companion's export list.
 *
 * @param {Object.<string, string[]>} importsByCompanion
 * @param {Object.<string, string[]>} exportsByCompanion
 * @returns {{ companion: string, symbol: string }[]} sorted, deterministic
 */
export function findMissingSymbols(importsByCompanion, exportsByCompanion) {
  const results = [];
  for (const [pkg, importedNames] of Object.entries(importsByCompanion)) {
    const exportedSet = new Set(exportsByCompanion[pkg] ?? []);
    for (const name of importedNames) {
      if (!exportedSet.has(name)) {
        results.push({ companion: pkg, symbol: name });
      }
    }
  }
  // Sort deterministically: companion first, then symbol
  results.sort((a, b) => {
    const cmp = a.companion.localeCompare(b.companion);
    return cmp !== 0 ? cmp : a.symbol.localeCompare(b.symbol);
  });
  return results;
}

/**
 * Parse ESM static import/export declarations from a source text string and
 * return a map of companion specifier → exported names collected.
 *
 * Handles:
 *   import { A, B as C } from '@rocket.chat/pkg'   → pkg: [A, B]
 *   export { X } from '@rocket.chat/pkg'            → pkg: [X]
 *
 * Skips namespace imports (`import * as x`) — can't reconcile individual names.
 * Skips `import type` / `export type` — not runtime values.
 * Skips '@rocket.chat/fuselage' itself.
 *
 * Exported for unit testing. Pass the loaded `ts` module.
 *
 * @param {string} sourceText
 * @param {object} ts  - loaded TypeScript module
 * @returns {{ [specifier: string]: string[] }}
 */
export function collectNamedImportsFromSource(sourceText, ts) {
  const sf = ts.createSourceFile(
    '__synthetic__.js',
    sourceText,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
    ts.ScriptKind.JS,
  );

  /** @type {{ [spec: string]: string[] }} */
  const result = {};

  for (const stmt of sf.statements) {
    let modSpec = null;
    let names = null;

    if (ts.isImportDeclaration(stmt)) {
      // Skip `import type { … }`
      if (stmt.importClause?.isTypeOnly) continue;

      const specNode = stmt.moduleSpecifier;
      if (!specNode || specNode.kind !== ts.SyntaxKind.StringLiteral) continue;
      modSpec = specNode.text;

      const bindings = stmt.importClause?.namedBindings;
      if (!bindings) continue;
      if (ts.isNamespaceImport(bindings)) continue; // import * as x
      if (!ts.isNamedImports(bindings)) continue;

      names = [];
      for (const el of bindings.elements) {
        if (el.isTypeOnly) continue;
        names.push(el.propertyName?.text ?? el.name.text);
      }
    } else if (ts.isExportDeclaration(stmt)) {
      // Skip `export type { … } from '…'`
      if (stmt.isTypeOnly) continue;

      const specNode = stmt.moduleSpecifier;
      if (!specNode || specNode.kind !== ts.SyntaxKind.StringLiteral) continue;
      modSpec = specNode.text;

      const exportClause = stmt.exportClause;
      if (!exportClause) continue;
      if (!ts.isNamedExports(exportClause)) continue;

      names = [];
      for (const el of exportClause.elements) {
        if (el.isTypeOnly) continue;
        names.push(el.propertyName?.text ?? el.name.text);
      }
    }

    if (!modSpec || !names || names.length === 0) continue;
    if (!/^@rocket\.chat\//.test(modSpec)) continue;
    if (modSpec === '@rocket.chat/fuselage') continue;

    if (!result[modSpec]) result[modSpec] = [];
    for (const name of names) {
      if (!result[modSpec].includes(name)) result[modSpec].push(name);
    }
  }

  return result;
}

/**
 * Members that are interop/builtin — never real companion exports.
 * Captured accesses on these names are silently skipped to avoid false 'missing' reports.
 */
const RESERVED_MEMBERS = new Set([
  '__esModule', 'default', 'prototype', '__proto__', 'constructor',
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
  'toString', 'toLocaleString', 'valueOf',
  'length', 'name', 'call', 'apply', 'bind', 'arguments', 'caller',
]);

/**
 * Extract companion symbols from a webpack CJS bundle file.
 *
 * The bundle emits:
 *   varName = __webpack_require__(/*! @rocket.chat/pkg * / "@rocket.chat/pkg")
 * followed by property accesses:
 *   varName.symbolName(...)
 *   varName["symbolName"] / varName['symbolName']
 *
 * Returns { [specifier]: Map<symbolName, 'bundle'> } — each symbol mapped to a
 * fixed importedBy value since CJS bundles don't preserve per-file attribution.
 *
 * Single-pass: builds one combined regex over all captured varNames and runs it
 * once over the full bundle text (O(bundleLength)), routing each hit to its
 * specifier via the varName→specifier map.
 *
 * @param {string} bundleText
 * @param {string} [bundleBasename]  - used as importedBy value
 * @returns {{ [specifier: string]: Map<string, string> }}
 */
export function extractCompanionSymbolsFromBundle(bundleText, bundleBasename) {
  const importedBy = bundleBasename ?? 'bundle';

  // Step 1: build varName → specifier map from __webpack_require__ calls
  // Pattern: [const|let|var] varName = __webpack_require__(/*! @rc/pkg */ "...")
  const reqRe = /(?:(?:const|let|var)\s+)?(\w+)\s*=\s*__webpack_require__\s*\(\s*\/\*!?\s*(@rocket\.chat\/[^\s*/]+)\s*\*\//g;
  /** @type {{ [varName: string]: string }} */
  const varToSpec = {};
  let m;
  while ((m = reqRe.exec(bundleText)) !== null) {
    const [, varName, spec] = m;
    if (!varToSpec[varName]) varToSpec[varName] = spec;
  }

  /** @type {{ [specifier: string]: Map<string, string> }} */
  const result = {};

  const varNames = Object.keys(varToSpec);
  if (varNames.length === 0) return result;

  // Step 2 (single pass): build one combined regex matching any captured varName
  // followed by .member  OR  ["member"] / ['member'].
  // Escape each varName for regex safety (they are JS identifiers, but be defensive).
  const escapedVars = varNames.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const combinedRe = new RegExp(
    '(' + escapedVars.join('|') + ')' +
    '(?:\\.([a-zA-Z_$][a-zA-Z0-9_$]*)|\\[(["\'])([a-zA-Z_$][a-zA-Z0-9_$]*)\\3\\])',
    'g',
  );

  let pm;
  while ((pm = combinedRe.exec(bundleText)) !== null) {
    const [, varName, dotMember, , bracketMember] = pm;
    const sym = dotMember ?? bracketMember;
    if (!sym) continue;
    if (RESERVED_MEMBERS.has(sym)) continue;

    const spec = varToSpec[varName];
    if (!spec) continue;

    if (!result[spec]) result[spec] = new Map();
    if (!result[spec].has(sym)) result[spec].set(sym, importedBy);
  }

  return result;
}

/**
 * Locate fuselage's compiled JS files.
 *
 * Fuselage ships as CJS webpack bundles (dist/*.js). We prefer the development
 * build because it preserves readable symbol names; fall back to production.
 *
 * Returns an array of { path, basename } objects.
 */
function fuselageJsFiles() {
  try {
    const pkgJsonPath = anchorRequire.resolve('@rocket.chat/fuselage/package.json');
    const pkgDir = dirname(pkgJsonPath);
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));

    // Prefer the known CJS webpack bundles (readable dev build first).
    // pkgJson.main may point to a small switcher (index.js) — check the
    // well-known bundle paths before falling back to main.
    const candidates = [
      join(pkgDir, 'dist/fuselage.development.js'),
      join(pkgDir, 'dist/fuselage.production.js'),
      pkgJson.main ? join(pkgDir, pkgJson.main) : null,
    ].filter(Boolean);

    const found = [];
    for (const p of candidates) {
      if (existsSync(p)) {
        found.push({ path: p, basename: p.split('/').pop() ?? p });
        break; // first viable bundle is enough
      }
    }
    return found;
  } catch {
    return [];
  }
}

/**
 * Walk fuselage's compiled JS bundles and collect value imports from
 * companion @rocket.chat/* packages.
 *
 * Returns:
 *   {
 *     status: 'ok'|'missing'|'unavailable',
 *     reason?: string,
 *     fuselageVersion?: string,
 *     missing: Array<{ companion: string, symbol: string, importedBy: string }>,
 *     checked: { [pkg]: { imports: number, exports: number } },
 *     skipped: { [pkg]: string }
 *   }
 */
export async function reconcileCompanions() {
  try {
    const ts = loadTypeScript();
    if (!ts) {
      return { status: 'unavailable', reason: 'typescript not resolvable', missing: [], checked: {}, skipped: {} };
    }

    const fuselageVersion = readPackageVersion('@rocket.chat/fuselage');

    // ── Step 1: collect companion symbols from fuselage's compiled JS ──────────
    const jsFiles = fuselageJsFiles();
    if (jsFiles.length === 0) {
      return { status: 'unavailable', reason: 'fuselage compiled JS not found', missing: [], checked: {}, skipped: {} };
    }

    // Detect whether only a minified/production bundle was available.
    // fuselageJsFiles() returns at most one file (breaks at first hit).
    // The dev bundle basename contains 'development'; anything else is minified.
    const isDevBundleAbsent = jsFiles.length > 0 && !jsFiles[0].basename.includes('development');

    // importedByMap: { [specifier]: Map<symbolName, importedByBasename> }
    const importedByMap = {}; // pkg -> Map<symbolName, importedByBasename>

    for (const { path: filePath, basename } of jsFiles) {
      let text;
      try {
        text = readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      // Fast skip: only parse if the file mentions @rocket.chat/
      if (!text.includes('@rocket.chat/')) continue;

      // Run BOTH extractors and union their results.
      // extractCompanionSymbolsFromBundle: CJS webpack bundle (dot + bracket accesses).
      // collectNamedImportsFromSource: ESM AST (fires only when file has ESM import/export
      //   declarations; no-ops on CJS bundles because TS AST finds no such statements).
      const cjsExtracted = extractCompanionSymbolsFromBundle(text, basename);
      for (const [spec, symbolMap] of Object.entries(cjsExtracted)) {
        if (!importedByMap[spec]) importedByMap[spec] = new Map();
        for (const [sym, by] of symbolMap.entries()) {
          if (!importedByMap[spec].has(sym)) importedByMap[spec].set(sym, by);
        }
      }

      // ESM extractor — only active when the loaded TS module is available
      if (ts) {
        const esmExtracted = collectNamedImportsFromSource(text, ts);
        for (const [spec, names] of Object.entries(esmExtracted)) {
          if (!importedByMap[spec]) importedByMap[spec] = new Map();
          for (const name of names) {
            if (!importedByMap[spec].has(name)) importedByMap[spec].set(name, basename);
          }
        }
      }
    }

    // ── Step 2: resolve each companion's exports; skip those without types ─────
    const importsByCompanion = {};
    const exportsByCompanion = {};
    const checked = {};
    const skipped = {};

    for (const [companionPkg, symbolMap] of Object.entries(importedByMap)) {
      const importedNames = [...symbolMap.keys()];
      importsByCompanion[companionPkg] = importedNames;

      const companionEntry = resolveTypesEntry(companionPkg);
      if (!companionEntry) {
        // Not installed or no types field → skip rather than false-positive every import
        skipped[companionPkg] = 'companion not installed or no types';
        continue;
      }

      const companionProg = getTsProgram(companionEntry.path);
      let exportedNames = [];
      if (companionProg) {
        const syms = getExportedSymbols(companionProg.checker, companionProg.sourceFile);
        exportedNames = syms.map((s) => s.getName());
      }

      if (exportedNames.length === 0) {
        // TS program resolved but yielded zero exports — parse/build failure.
        // Skip to avoid false-positive storm (every imported symbol flagged as missing).
        skipped[companionPkg] = 'could not resolve companion exports';
        continue;
      }

      exportsByCompanion[companionPkg] = exportedNames;
      checked[companionPkg] = { imports: importedNames.length, exports: exportedNames.length };
    }

    // Only reconcile companions that had resolvable exports
    const reconcileImports = {};
    for (const pkg of Object.keys(exportsByCompanion)) {
      reconcileImports[pkg] = importsByCompanion[pkg];
    }

    const missingPairs = findMissingSymbols(reconcileImports, exportsByCompanion);

    // Attach importedBy from the recorded map
    const missing = missingPairs.map(({ companion, symbol }) => ({
      companion,
      symbol,
      importedBy: importedByMap[companion]?.get(symbol) ?? 'unknown',
    }));

    const totalExtracted = Object.values(importedByMap).reduce((n, m) => n + m.size, 0);

    const status = missing.length > 0 ? 'missing' : 'ok';

    let note;
    if (totalExtracted === 0) {
      note = isDevBundleAbsent
        ? 'only a minified/production bundle was scanned — static companion check has no coverage; rely on a runtime launch'
        : 'no companion symbols were extracted — static check has no coverage; rely on a runtime launch';
    }

    if (note !== undefined) {
      return { status, fuselageVersion, missing, checked, skipped, note };
    }
    return { status, fuselageVersion, missing, checked, skipped };
  } catch (err) {
    return { status: 'unavailable', reason: err.message, missing: [], checked: {}, skipped: {} };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a single category.
 * Returns: { status: 'ok'|'unavailable'|'type-only'|'rule', source?, reason?, data }
 */
export async function resolveCategory(category) {
  switch (category) {
    case 'colors':
      return resolveColors();
    case 'fontscale':
      return resolveFontScale();
    case 'breakpoints':
      return resolveBreakpoints();
    case 'semantic':
      return resolveSemantic();
    case 'elevation':
      return resolveElevation();
    case 'components':
      return resolveComponents();
    case 'inputs':
      return resolveInputs();
    case 'forms':
      return resolveForms();
    case 'hooks':
      return resolveHooks();
    case 'spacing':
      return {
        status: 'rule',
        data: "Spacing uses the x<N> token scale where N is pixels: the Box margin/padding transform matches /^(neg-|-)?x(\\d+)$/ and emits (N/16)rem, so x16=1rem=16px, x24=1.5rem=24px, x4=4px. Negative via neg-x<N>. A bare number prop (e.g. p={24}) emits '24px' — identical to x24. Type gate is authoritative for valid spacing tokens.",
      };
    case 'radius':
      return {
        status: 'rule',
        data: 'Border radius is permissive (CSSProperties[\'borderRadius\']); semantic convention is \'none\'|\'full\'|x<N> but this is not enforced by types. Validate via design system conventions.',
      };
    default:
      return { status: 'unavailable', reason: `Unknown category: ${category}`, data: [] };
  }
}

/**
 * Resolve all categories.
 * Returns: { root, resolvedFrom, fuselageInstalled, versions, categories: { [cat]: result } }
 */
export async function resolveAll() {
  const resolvedFrom = anchor;
  const versions = collectVersions();
  const installed = fuselageInstalled();

  const categoryNames = [
    'colors',
    'fontscale',
    'breakpoints',
    'semantic',
    'components',
    'inputs',
    'forms',
    'hooks',
    'spacing',
    'elevation',
    'radius',
  ];

  const categories = {};
  for (const cat of categoryNames) {
    categories[cat] = await resolveCategory(cat);
  }

  return { root: anchor, resolvedFrom, fuselageInstalled: installed, versions, categories };
}

// ─── Vocabulary diff ──────────────────────────────────────────────────────────

/**
 * Diff two resolveAll()-shaped snapshots.
 * Returns: { versions, categories: { [cat]: { removed, added } }, skipped: { [cat]: reason } }
 *
 * VALUE-FREE: operates only on resolver output, never hardcodes any Fuselage name or value.
 */
export function resolveDiff(oldAll, newAll) {
  const allCats = new Set([
    ...Object.keys(oldAll.categories ?? {}),
    ...Object.keys(newAll.categories ?? {}),
  ]);

  const categories = {};
  const skipped = {};

  for (const cat of allCats) {
    const oldCat = oldAll.categories?.[cat];
    const newCat = newAll.categories?.[cat];

    const oldOk = oldCat?.status === 'ok';
    const newOk = newCat?.status === 'ok';
    const oldMissing = oldCat === undefined;
    const newMissing = newCat === undefined;

    // If both sides are missing, skip
    if (oldMissing && newMissing) {
      skipped[cat] = 'missing on both sides';
      continue;
    }

    // If one side is missing but other is ok array/semantic → treat missing as empty
    // If present side is not ok → skip
    if (!oldMissing && !oldOk && !newMissing && !newOk) {
      skipped[cat] = 'old ' + oldCat.status + ', new ' + newCat.status;
      continue;
    }
    if (!oldMissing && !oldOk && newMissing) {
      skipped[cat] = 'old ' + oldCat.status;
      continue;
    }
    if (oldMissing && !newMissing && !newOk) {
      skipped[cat] = 'new ' + newCat.status;
      continue;
    }

    // Flatten to string sets for set-diff
    function flattenToStrings(catResult, isMissing) {
      if (isMissing) return [];
      if (catResult?.status !== 'ok') return null; // not ok
      const data = catResult.data;
      if (!Array.isArray(data)) return null; // not an array at all
      // Check if it looks like semantic: array of { groupName, keys }
      if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null && 'groupName' in data[0] && 'keys' in data[0]) {
        // Semantic group shape — validate ALL groups before flattening.
        // If any group is malformed, return null so the category is recorded
        // in skipped rather than crashing with TypeError.
        for (const group of data) {
          if (
            group === null ||
            typeof group !== 'object' ||
            typeof group.groupName !== 'string' ||
            !Array.isArray(group.keys)
          ) {
            return null;
          }
        }
        const result = [];
        for (const group of data) {
          for (const key of group.keys) {
            result.push(group.groupName + '/' + key);
          }
        }
        return result;
      }
      // Plain string array
      if (data.every((d) => typeof d === 'string')) {
        return data;
      }
      return null; // not comparable
    }

    const oldStrings = flattenToStrings(oldCat, oldMissing);
    const newStrings = flattenToStrings(newCat, newMissing);

    // If either side is not comparable data, skip
    if (oldStrings === null) {
      if (newStrings === null) {
        skipped[cat] = 'data not comparable on either side';
      } else {
        skipped[cat] = 'old ' + (oldCat?.status ?? 'missing') + ' (data not comparable)';
      }
      continue;
    }
    if (newStrings === null) {
      skipped[cat] = 'new ' + (newCat?.status ?? 'missing') + ' (data not comparable)';
      continue;
    }

    const oldSet = new Set(oldStrings);
    const newSet = new Set(newStrings);

    const removed = [...oldSet].filter((s) => !newSet.has(s)).sort();
    const added = [...newSet].filter((s) => !oldSet.has(s)).sort();

    categories[cat] = { removed, added };
  }

  return {
    versions: {
      old: oldAll.versions,
      new: newAll.versions,
    },
    categories,
    skipped,
  };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

export async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const categoryArg = args.find((a) => !a.startsWith('--')) || 'all';

  // ── diff mode ──────────────────────────────────────────────────────────────
  if (categoryArg === 'diff') {
    const nonFlagArgs = args.filter((a) => !a.startsWith('--'));
    const oldPath = nonFlagArgs[1];
    const newPath = nonFlagArgs[2];

    if (!oldPath || !newPath) {
      process.stderr.write(
        'Usage: fuselage-resolve diff <old.json> <new.json> [--json]\n',
      );
      process.exit(1);
    }

    let oldSnap, newSnap;
    try {
      oldSnap = JSON.parse(readFileSync(oldPath, 'utf8'));
    } catch (err) {
      process.stderr.write(`Error reading old snapshot "${oldPath}": ${err.message}\n`);
      process.exit(1);
    }
    try {
      newSnap = JSON.parse(readFileSync(newPath, 'utf8'));
    } catch (err) {
      process.stderr.write(`Error reading new snapshot "${newPath}": ${err.message}\n`);
      process.exit(1);
    }

    function assertSnapshot(snap, filePath) {
      if (
        snap === null ||
        typeof snap !== 'object' ||
        snap.categories === null ||
        typeof snap.categories !== 'object'
      ) {
        process.stderr.write(
          `Error: "${filePath}" is not a fuselage-resolve snapshot (missing top-level "categories" object). ` +
          `Produce one with: fuselage-resolve all --json > snap.json\n`,
        );
        process.exit(1);
      }
    }
    assertSnapshot(oldSnap, oldPath);
    assertSnapshot(newSnap, newPath);

    const diff = resolveDiff(oldSnap, newSnap);

    if (jsonMode) {
      process.stdout.write(JSON.stringify(diff, null, 2) + '\n');
      return;
    }

    const oldVer = oldSnap.versions?.['@rocket.chat/fuselage'] ?? 'unknown';
    const newVer = newSnap.versions?.['@rocket.chat/fuselage'] ?? 'unknown';

    process.stdout.write('═══ fuselage-craft vocab diff ════════════════════════\n');
    process.stdout.write(`old: ${oldVer}  →  new: ${newVer}\n`);
    process.stdout.write('──────────────────────────────────────────────────────\n');

    for (const [cat, { removed, added }] of Object.entries(diff.categories)) {
      process.stdout.write(`${cat}:\n`);
      if (removed.length === 0 && added.length === 0) {
        process.stdout.write(`  (no change)\n`);
      } else {
        if (removed.length > 0) {
          process.stdout.write(`  removed:  ${removed.join(', ')}\n`);
        }
        if (added.length > 0) {
          process.stdout.write(`  added:    ${added.join(', ')}\n`);
        }
      }
    }

    const skippedEntries = Object.entries(diff.skipped);
    if (skippedEntries.length > 0) {
      const skippedList = skippedEntries.map(([c, r]) => `${c} (${r})`).join(', ');
      process.stdout.write(`skipped (not comparable): ${skippedList}\n`);
    }

    return;
  }

  // ── check-companions mode ──────────────────────────────────────────────────
  if (categoryArg === 'check-companions') {
    const result = await reconcileCompanions();

    if (jsonMode) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }

    const checkedEntries = Object.entries(result.checked ?? {});
    const totalImports = checkedEntries.reduce((s, [, c]) => s + c.imports, 0);
    process.stdout.write('═══ fuselage-craft companion check ═══════════════════\n');
    if (result.fuselageVersion) {
      process.stdout.write(`fuselage ${result.fuselageVersion} — imports reconciled against installed companions\n`);
    }
    process.stdout.write('──────────────────────────────────────────────────────\n');

    if (result.status === 'unavailable') {
      process.stdout.write(`NOTE: ${result.reason}\n`);
      return; // exit 0
    }

    // Show skipped companions as NOTE lines
    for (const [pkg, reason] of Object.entries(result.skipped ?? {})) {
      process.stdout.write(`note: ${pkg} skipped (${reason})\n`);
    }

    if (result.note) {
      process.stdout.write(`NOTE: ${result.note}\n`);
      process.stdout.write(`  (no coverage — companion check skipped; rely on a runtime launch)\n`);
      return; // exit 0, no false confidence
    }

    if (result.status === 'ok') {
      process.stdout.write(
        `✓ ok   all ${totalImports} imported companion symbols are exported by the installed versions` +
          ` (${checkedEntries.length} companion${checkedEntries.length !== 1 ? 's' : ''} checked)\n`,
      );
      return; // exit 0
    }

    // status === 'missing'
    for (const { companion, symbol, importedBy } of result.missing) {
      process.stdout.write(
        `✗ ${companion} does not export '${symbol}' (imported by ${importedBy}) — bump ${companion} to a version that exports it\n`,
      );
    }
    process.exit(1);
  }

  if (jsonMode) {
    const result =
      categoryArg === 'all'
        ? await resolveAll()
        : {
            root: anchor,
            resolvedFrom: anchor,
            fuselageInstalled: fuselageInstalled(),
            versions: collectVersions(),
            categories: { [categoryArg]: await resolveCategory(categoryArg) },
          };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  // Human output
  const versions = collectVersions();
  const installed = fuselageInstalled();

  process.stdout.write('\n═══ fuselage-craft resolver ══════════════════════════\n');
  process.stdout.write(`Resolved from: ${anchor}\n`);
  process.stdout.write('Package versions:\n');
  for (const [pkg, ver] of Object.entries(versions)) {
    process.stdout.write(`  ${pkg}: ${ver}\n`);
  }
  process.stdout.write('══════════════════════════════════════════════════════\n\n');

  // Not-installed banner (informational, no nonzero exit)
  if (!installed) {
    process.stdout.write(
      `⚠ @rocket.chat/fuselage is not installed under ${anchor}.\n` +
        `  Run fuselage-craft inside your product repo (the package that depends on\n` +
        `  @rocket.chat/fuselage), or install it. Categories will be unavailable.\n\n`,
    );
  }

  const cats =
    categoryArg === 'all'
      ? [
          'colors',
          'fontscale',
          'breakpoints',
          'semantic',
          'components',
          'inputs',
          'forms',
          'hooks',
          'spacing',
          'elevation',
          'radius',
        ]
      : [categoryArg];

  for (const cat of cats) {
    const result = await resolveCategory(cat);
    process.stdout.write(`─── ${cat} (${result.source ?? result.status}) ──────────────────────────\n`);

    if (result.status === 'unavailable') {
      process.stdout.write(`  unavailable: ${result.reason}\n`);
    } else if (result.status === 'type-only' || result.status === 'rule') {
      process.stdout.write(`  ${result.data}\n`);
    } else if (cat === 'colors' && result.status === 'ok') {
      // Print the drift-trap warning before the raw palette
      if (result.warning) {
        process.stdout.write(`  ${result.warning}\n\n`);
      }
      for (const name of result.data) {
        process.stdout.write(`  ${name}\n`);
      }
    } else if (cat === 'semantic' && result.status === 'ok') {
      // Grouped output with prop-usage headers
      for (const group of result.data) {
        const { groupName, meta, keys } = group;
        if (meta) {
          process.stdout.write(`  [${groupName} → ${meta.prop}  (${meta.note})]\n`);
        } else {
          process.stdout.write(`  [${groupName}]\n`);
        }
        for (const k of keys) {
          process.stdout.write(`    ${k}\n`);
        }
      }
    } else if (Array.isArray(result.data)) {
      for (const name of result.data) {
        process.stdout.write(`  ${name}\n`);
      }
    }

    process.stdout.write('\n');
  }
}

// Run CLI only when resolve.mjs itself is the entry point.
// The bin (fuselage-resolve.mjs) calls main() explicitly, so this guard must
// NOT match the bin path — otherwise main() fires twice and --json emits two objects.
const isMain =
  process.argv[1] &&
  (process.argv[1] === __filename ||
    process.argv[1].endsWith('/src/resolve.mjs'));

if (isMain) {
  main().catch((err) => {
    process.stderr.write(`resolve.mjs error: ${err.message}\n`);
    process.exit(1);
  });
}
