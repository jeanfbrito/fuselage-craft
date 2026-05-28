/**
 * prefer-button — warn when a raw <button> element or an <a> element used as
 * a button-in-disguise is found, suggesting Fuselage <Button> / <IconButton>.
 *
 * Severity: WARN (not error) — heuristic on <a> to avoid false-failing CI on
 * real navigation links. Reserve errors for objective-literal rules.
 *
 * Detection:
 *   - Any lowercase <button> element → always flag (unambiguously hand-rolled).
 *   - <a> elements that are buttons-in-disguise, detected by ANY of:
 *       * href is the literal string '#' or starts with 'javascript:'
 *       * onClick attribute present AND no href attribute at all
 *       * role="button" attribute
 *
 * NOT flagged:
 *   - <a href="/real-path"> — real navigation link.
 *   - <a href={dynamicUrl}> — dynamic/variable href (may be real navigation).
 *   - <a href="/real-path" onClick={track}> — real link with an analytics handler.
 */

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer Fuselage <Button> (or <IconButton>) over raw <button> elements or <a> elements used as buttons.',
      recommended: false,
    },
    schema: [],
    messages: {
      preferButton:
        'Use the Fuselage `<Button>` (or `<IconButton>`) instead of a hand-rolled `<button>` / `<a>`-as-button — real button semantics, keyboard, focus, and theming.',
    },
  },

  create(context) {
    return {
      JSXOpeningElement(node) {
        const nameNode = node.name;
        // Only lowercase (DOM) elements
        if (nameNode.type !== 'JSXIdentifier') return;
        const tagName = nameNode.name;

        if (tagName === 'button') {
          // Raw <button> — always a hand-rolled button
          context.report({ node, messageId: 'preferButton' });
          return;
        }

        if (tagName === 'a') {
          const attrs = node.attributes;

          // Collect the relevant attributes
          let hrefAttr = null;
          let onClickAttr = null;
          let roleAttr = null;

          for (const attr of attrs) {
            if (attr.type !== 'JSXAttribute' || !attr.name) continue;
            const name = attr.name.name;
            if (name === 'href') hrefAttr = attr;
            else if (name === 'onClick') onClickAttr = attr;
            else if (name === 'role') roleAttr = attr;
          }

          // role="button"
          if (roleAttr) {
            const val = roleAttr.value;
            if (
              val &&
              val.type === 'Literal' &&
              typeof val.value === 'string' &&
              val.value === 'button'
            ) {
              context.report({ node, messageId: 'preferButton' });
              return;
            }
          }

          // href="#" or href="javascript:..."
          if (hrefAttr) {
            const val = hrefAttr.value;
            if (val && val.type === 'Literal' && typeof val.value === 'string') {
              const href = val.value;
              if (href === '#' || href.startsWith('javascript:')) {
                context.report({ node, messageId: 'preferButton' });
                return;
              }
            }
            // href is present but is a dynamic expression — real/unknown link, skip
            return;
          }

          // No href at all, but onClick — clickable non-link
          if (!hrefAttr && onClickAttr) {
            context.report({ node, messageId: 'preferButton' });
            return;
          }
        }
      },
    };
  },
};
