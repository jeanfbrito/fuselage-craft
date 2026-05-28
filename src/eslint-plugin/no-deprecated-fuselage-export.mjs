/**
 * no-deprecated-fuselage-export — flag importing a deprecated Fuselage component
 * when its current replacement exists in the installed package.
 *
 * VALUE-FREE: no stored deprecation list. The deprecated set is computed live from
 * the installed package's exports (naming-pair heuristic: `XLegacy` + base `X` both
 * exported → `XLegacy` is deprecated) and injected by run-gate.mjs.
 *
 * CRITICAL: If the `deprecated` option is absent or empty this rule is a complete
 * NO-OP. It must NEVER flag anything when it has no live data. Standalone
 * `npx eslint --config` won't inject the deprecated set — that's intentional.
 * The authoritative run is via run-gate.mjs which injects the live deprecated set.
 *
 * Options (single schema object):
 *   deprecated  {Array<{name: string, replacement: string|null}>}
 *     The deprecated export list from resolveDeprecated().data. Injected by
 *     run-gate.mjs; not present in standalone eslint runs.
 */

const FUSELAGE_RE = /^@rocket\.chat\/fuselage/;

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Flag importing a deprecated Fuselage export when the current replacement exists.',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          deprecated: {
            type: 'array',
            description:
              'Deprecated export list from resolveDeprecated(). Injected by run-gate.mjs. ' +
              'When absent the rule is a no-op.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                replacement: { type: ['string', 'null'] },
                reason: { type: 'string' },
              },
              required: ['name'],
              additionalProperties: true,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      deprecatedExport:
        '`{{name}}` is a deprecated Fuselage export. Use `{{replacement}}` instead.',
      deprecatedExportUnknown:
        '`{{name}}` is a deprecated Fuselage export. Use the current Fuselage equivalent (check the Fuselage Storybook/docs).',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const deprecatedList = Array.isArray(options.deprecated) ? options.deprecated : null;

    // NO-OP guard: if deprecated list is absent or empty, disable entirely
    if (!deprecatedList || deprecatedList.length === 0) {
      return {};
    }

    // Build a Map from deprecated name → replacement (may be null)
    const deprecatedMap = new Map();
    for (const entry of deprecatedList) {
      if (typeof entry.name === 'string') {
        deprecatedMap.set(entry.name, entry.replacement ?? null);
      }
    }

    return {
      ImportDeclaration(node) {
        // Only flag imports from @rocket.chat/fuselage*
        if (typeof node.source.value !== 'string') return;
        if (!FUSELAGE_RE.test(node.source.value)) return;

        for (const specifier of node.specifiers) {
          // Only named imports: import { X } from '...'
          if (specifier.type !== 'ImportSpecifier') continue;

          const importedName =
            specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : specifier.imported.value; // StringLiteral form

          if (!deprecatedMap.has(importedName)) continue;

          const replacement = deprecatedMap.get(importedName);
          if (replacement) {
            context.report({
              node: specifier,
              messageId: 'deprecatedExport',
              data: { name: importedName, replacement },
            });
          } else {
            context.report({
              node: specifier,
              messageId: 'deprecatedExportUnknown',
              data: { name: importedName },
            });
          }
        }
      },
    };
  },
};
