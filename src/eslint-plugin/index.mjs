/**
 * ESLint plugin — fuselage-craft-gate
 *
 * Exposes the seven gate rules as a standard ESLint plugin object.
 * Import this in eslint.config.mjs via the local path.
 */

import noRawColor from './no-raw-color.mjs';
import noLiteralDimension from './no-literal-dimension.mjs';
import noLiteralShadow from './no-literal-shadow.mjs';
import noLiteralMediaQuery from './no-literal-media-query.mjs';
import requireFieldWrapper from './require-field-wrapper.mjs';
import preferBox from './prefer-box.mjs';
import validColorToken from './valid-color-token.mjs';

export default {
  meta: {
    name: 'fuselage-craft-gate',
  },
  rules: {
    'no-raw-color': noRawColor,
    'no-literal-dimension': noLiteralDimension,
    'no-literal-shadow': noLiteralShadow,
    'no-literal-media-query': noLiteralMediaQuery,
    'require-field-wrapper': requireFieldWrapper,
    'prefer-box': preferBox,
    'valid-color-token': validColorToken,
  },
};
