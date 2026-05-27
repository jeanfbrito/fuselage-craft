/**
 * no-literal-media-query — flag literal @media queries in css/styled tagged
 * templates and matchMedia() calls with breakpoint string literals.
 *
 * Message: use useBreakpoints / useMediaQuery from fuselage-hooks.
 *
 * Zero hardcoded Fuselage values — bans the literal pattern, not specific breakpoint values.
 */

function isInsideCssTaggedTemplate(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'TaggedTemplateExpression') {
      const { tag } = current;
      if (
        (tag.type === 'Identifier' && tag.name === 'css') ||
        (tag.type === 'MemberExpression' &&
          tag.object &&
          tag.object.name === 'styled') ||
        (tag.type === 'CallExpression' &&
          tag.callee &&
          tag.callee.name === 'styled') ||
        (tag.type === 'CallExpression' &&
          tag.callee &&
          tag.callee.type === 'MemberExpression' &&
          tag.callee.object &&
          tag.callee.object.name === 'styled')
      ) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

const MEDIA_QUERY_RE = /@media\b/i;

// Matches min/max-(width|height|device-width|device-height|aspect-ratio) media features
// or any @media at-rule embedded in the string. Covers both window.matchMedia and direct calls.
const MATCH_MEDIA_ARG_RE =
  /@media|\(\s*(min|max)-(width|height|device-width|device-height|aspect-ratio)\b/i;

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow literal @media queries and matchMedia() breakpoint literals. Use useBreakpoints / useMediaQuery from fuselage-hooks so responsiveness tracks the Fuselage breakpoint scale.',
      recommended: true,
    },
    schema: [],
    messages: {
      noLiteralMediaQuery:
        'Literal media query detected. Drive responsiveness with `useBreakpoints` / `useMediaQuery` from fuselage-hooks instead of hardcoded media queries / breakpoint px.',
    },
  },

  create(context) {
    return {
      // TemplateElement inside css`...`/styled`...` containing @media
      TemplateElement(node) {
        const raw = node.value && node.value.raw;
        if (!raw) return;
        if (!isInsideCssTaggedTemplate(node)) return;
        if (MEDIA_QUERY_RE.test(raw)) {
          context.report({ node, messageId: 'noLiteralMediaQuery' });
        }
      },

      // matchMedia('(min-width: 1024px)') or window.matchMedia('...')
      CallExpression(node) {
        const { callee } = node;

        const isMatchMediaCall =
          // matchMedia(...)
          (callee.type === 'Identifier' && callee.name === 'matchMedia') ||
          // <anything>.matchMedia(...)  — covers window.matchMedia, etc.
          (callee.type === 'MemberExpression' &&
            callee.property &&
            callee.property.name === 'matchMedia');

        if (!isMatchMediaCall) return;

        const firstArg = node.arguments && node.arguments[0];
        // Only flag string Literal args — variables, template literals with
        // expressions, or absent args must NOT be flagged.
        if (!firstArg || firstArg.type !== 'Literal') return;
        if (typeof firstArg.value !== 'string') return;

        if (MATCH_MEDIA_ARG_RE.test(firstArg.value)) {
          context.report({ node: firstArg, messageId: 'noLiteralMediaQuery' });
        }
      },
    };
  },
};
